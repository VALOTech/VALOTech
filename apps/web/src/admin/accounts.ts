/**
 * The two mutations an admin makes to somebody else's account (`ADMIN-001`):
 * suspending it, and changing its role.
 *
 * Each is one act carrying several writes, and the design is that the writes
 * are one transaction. A suspension that changed the state and failed to end
 * the sessions would leave a suspended person signed in for the rest of the
 * day; a role change that changed the role and failed to end the sessions would
 * leave a privilege change that has not happened yet; and either without its
 * audit row is a privileged write that nothing recorded (`SEC-R04`).
 * `invalidateAllForAccountIn` and `recordAudit` both take a transaction rather
 * than the pool, so a write that fell out of it would not compile.
 *
 * **The `UPDATE` is the check.** Each operation narrows its update to the rows
 * that would really change — a state that is not already `suspended`, a role
 * that is not already the one asked for — and reads whether a row came back. A
 * lookup followed by a decision would let two admins acting at once both pass
 * the lookup and both write; here the second blocks on the first's row lock and
 * then re-evaluates this predicate against the row as the first left it, so it
 * matches nothing and the trail carries one act rather than two.
 *
 * **Nothing to change is not an error, and it is not an act either.** An
 * account already in the state being asked for is left untouched: no session is
 * ended, no invitation is destroyed, and nothing is recorded, because the trail
 * holds acts and not re-assertions of a state. Each returns whether it changed
 * anything, which is also `false` for an id no account holds — in both cases
 * the answer to the caller is that nothing was written.
 *
 * **Neither act may strand the room or turn on the actor** (`ADMIN-DEC-01`). An
 * admin cannot suspend or demote their own account, and no single act may leave
 * the room with no admin who can sign in; both are refused before anything is
 * written, returning the same `false` a no-op returns. The guard is fail-closed
 * rather than advisory because a suspension is a one-way door in code — nothing
 * restores `active` yet — and no bootstrap creates a first admin, so a room with
 * no active admin is recoverable only from the database.
 *
 * The account row is locked by the update before either operation touches
 * `invitations`, which is the order the invitation path takes too, so an invite
 * and a suspension racing for one account serialise rather than deadlock.
 *
 * What makes a suspension effective is not these deletes. The gate resolves a
 * session only while its account is `active` and sign-in refuses every other
 * state, so a suspended person is turned away on their next request whatever
 * rows survive. What the deletes give is immediacy and honesty: revocation that
 * waits for the next natural expiry is not revocation, and a page listing live
 * sessions for a suspended account would be describing access already refused.
 */

import type { Transaction } from 'kysely';

import { recordAudit } from '../audit/record';
import { invalidateAllForAccountIn } from '../auth/session';
import { getDb } from '../db/index';
import type { AccountRole, Database } from '../db/types';

/**
 * Whether `subjectId` is the only admin who can sign in — the safe default for
 * [`ADMIN-DEC-01`](../../docs/decisions-log.md#ADMIN-DEC-01). An act that would
 * leave no such admin is refused by its caller, because `suspendAccount` is a
 * one-way door in code — nothing sets a `suspended` account back to `active`
 * yet — and there is no bootstrap that creates a first admin, so a room with no
 * admin who can act is recoverable only from the database.
 *
 * Active, not merely `admin`: a suspended admin cannot sign in, and reinstating
 * one is itself an admin act, so the count the room depends on is admins who can
 * act now. The rows are locked in id order inside the caller's transaction, so
 * two demotions racing cannot each read two admins and both commit to zero — the
 * second waits on the first and re-evaluates against the row it left — and the id
 * order keeps two such locks from deadlocking.
 */
async function isLastActiveAdmin(trx: Transaction<Database>, subjectId: string): Promise<boolean> {
  const activeAdmins = await trx
    .selectFrom('accounts')
    .select('id')
    .where('role', '=', 'admin')
    .where('state', '=', 'active')
    .orderBy('id')
    .forUpdate()
    .execute();

  return activeAdmins.length === 1 && activeAdmins[0]?.id === subjectId;
}

/**
 * Suspend an account: it can no longer sign in, its live sessions end, and the
 * invitation it may be holding stops working. Returns whether the account was
 * suspended — `false` when it already was, in which case nothing is written and
 * nothing is recorded.
 *
 * Suspension reaches an `invited` account as well as an active one, and that is
 * the case the invitation delete is for: such an account holds no session at
 * all, and its whole way in is a link somebody was sent. Leaving that link live
 * would let the person set a password and re-activate the access an admin had
 * just ended (`AUTH-003`), so the outstanding invitation goes in the same
 * transaction as the state.
 *
 * Outstanding means unconsumed. A consumed row records that somebody used a
 * token at a stated moment, which is true and stays true; deleting it would
 * erase a fact rather than a capability.
 */
export async function suspendAccount(accountId: string, actorId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      // Safe default for ADMIN-DEC-01, before anything is written: an admin may
      // not act on their own access, and no single act may leave the room with
      // no admin who can sign in. Both return the same `false` a no-op returns.
      if (actorId === accountId) {
        return false;
      }
      if (await isLastActiveAdmin(trx, accountId)) {
        return false;
      }

      const suspended = await trx
        .updateTable('accounts')
        .set({ state: 'suspended' })
        .where('id', '=', accountId)
        .where('state', '<>', 'suspended')
        .returning('id')
        .executeTakeFirst();

      if (suspended === undefined) {
        return false;
      }

      await invalidateAllForAccountIn(trx, accountId);

      await trx
        .deleteFrom('invitations')
        .where('account_id', '=', accountId)
        .where('consumed_at', 'is', null)
        .execute();

      await recordAudit(trx, {
        actorId,
        action: 'account.suspend',
        subjectType: 'account',
        subjectId: accountId,
      });

      return true;
    });
}

/**
 * Change an account's role, ending every session it holds. Returns whether the
 * role changed — `false` when the account already held it, in which case
 * nothing is written, nobody is signed out and nothing is recorded.
 *
 * The sessions go because a privilege change that leaves the old session's
 * claims in place is a privilege change that has not happened yet (`SEC-R02`).
 * That is defence in depth rather than the mechanism: the gate reads the role
 * from `accounts` on every request, so the new role is in force immediately and
 * a demoted admin could not act as one even if their session survived. Ending
 * the sessions removes the second question — whether anything the application
 * grows later caches what a session was authorised for — by removing the
 * session.
 *
 * An invitation an `invited` account is holding is left alone, unlike a
 * suspension's: the person is still expected, and what changed is what they
 * will be able to reach once they arrive.
 */
export async function changeRole(
  accountId: string,
  newRole: AccountRole,
  actorId: string,
): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      // Safe default for ADMIN-DEC-01: an admin may not change their own role,
      // and demoting the last admin who can sign in is refused. The check is
      // unconditional — promoting an investor leaves them outside the active-
      // admin set, so it is never the last one, and a self-change is refused
      // whichever direction it runs.
      if (actorId === accountId) {
        return false;
      }
      if (await isLastActiveAdmin(trx, accountId)) {
        return false;
      }

      const changed = await trx
        .updateTable('accounts')
        .set({ role: newRole })
        .where('id', '=', accountId)
        .where('role', '<>', newRole)
        .returning('id')
        .executeTakeFirst();

      if (changed === undefined) {
        return false;
      }

      await invalidateAllForAccountIn(trx, accountId);

      await recordAudit(trx, {
        actorId,
        action: 'account.role_change',
        subjectType: 'account',
        subjectId: accountId,
      });

      return true;
    });
}

/**
 * Reinstate a suspended account: it can sign in again. Returns whether the
 * account was reinstated — `false` when it was not suspended, in which case
 * nothing is written and nothing is recorded.
 *
 * The inverse of `suspendAccount`, and deliberately simpler than it. No session
 * is restored: suspension deleted them, and the person signs in afresh — a
 * reinstatement grants the ability to sign in, not a live session. No outstanding
 * invitation is restored either; a suspension deleted it, and if the account
 * never had a password, a fresh invitation is the way back in, not this.
 *
 * It needs none of `suspendAccount`'s guard. Making an account active cannot
 * strand the room — it only adds to the set of admins who can sign in — and a
 * suspended account's holder cannot sign in to reinstate themselves, so the
 * actor is always a different, active admin. Reinstating an account that is not
 * suspended is the no-op the narrowed `UPDATE` makes it: the predicate matches
 * nothing, so an `active` or `invited` account is left exactly as it was.
 */
export async function reinstateAccount(accountId: string, actorId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const reinstated = await trx
        .updateTable('accounts')
        .set({ state: 'active' })
        .where('id', '=', accountId)
        .where('state', '=', 'suspended')
        .returning('id')
        .executeTakeFirst();

      if (reinstated === undefined) {
        return false;
      }

      await recordAudit(trx, {
        actorId,
        action: 'account.reinstate',
        subjectType: 'account',
        subjectId: accountId,
      });

      return true;
    });
}
