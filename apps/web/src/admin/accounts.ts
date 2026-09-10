/**
 * What an admin does to somebody else's account (`ADMIN-001`): the list of who
 * can sign in, the five acts that change one — suspend, role change, reinstate,
 * erase, and honour a read-tracking objection — and a read of everything held
 * about one, for a data-portability request (`LEGAL-GLOBAL-001/T2`).
 *
 * The list is a plain read and carries none of what follows. Each act is one
 * carrying several writes, and the design is that the writes are one
 * transaction. A suspension that changed the state and failed to end
 * the sessions would leave a suspended person signed in for the rest of the
 * day; a role change that changed the role and failed to end the sessions would
 * leave a privilege change that has not happened yet; and any of them without
 * its audit row is a privileged write that nothing recorded (`SEC-R04`).
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
 * **No act may strand the room or turn on the actor** (`ADMIN-DEC-01`). An
 * admin cannot suspend, demote, or erase their own account, and no single act
 * may leave the room with no admin who can sign in; both are refused before
 * anything is written, returning the same `false` a no-op returns. The guard is
 * fail-closed rather than advisory because a room with no admin who can sign in
 * cannot recover itself — reinstating a suspended admin is an admin act, and no
 * bootstrap creates a first admin — so a stranded room is recoverable only from
 * the database.
 *
 * The account row is locked by the update before suspension touches
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
import { type AccountGrant, grantsForAccount } from '../content/grants';
import { getDb } from '../db/index';
import type { AccountRole, AccountState, Database } from '../db/types';

/** One person on the account list, and everything the list says about them. */
export interface AccountListRow {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: AccountRole;
  readonly state: AccountState;
  /** `null` when the person has never signed in. */
  readonly last_sign_in: Date | null;
}

/**
 * Every account, stalest first.
 *
 * The order is the point of the list rather than a presentation choice
 * (`ADMIN-001` §3): last sign-in is what makes a stale account visible — an
 * investor who has not signed in for a year is either somebody who lost
 * interest or an account nobody remembered to close — so the list arrives
 * already asking that question, and an admin who came to answer it reads the
 * top of the page rather than sorting first.
 *
 * `nulls first`, stated rather than left to PostgreSQL's default, which puts
 * nulls last under `asc`. Never having signed in is the strongest form of the
 * signal the column exists for, not the absence of one, so it belongs at the
 * top; the `state` column beside it is what separates an invitation nobody
 * accepted from a person who stopped coming.
 *
 * The address breaks the tie, because it is the one column the schema makes
 * unique: without a total order two accounts sharing a timestamp — every
 * account that has never signed in shares one — could swap places between
 * renders, which is a list that looks wrong while being right.
 *
 * It reads no more than the list shows (`DATA-R01`). The password hash and the
 * row's own timestamps stay in the database.
 */
export async function listAccounts(): Promise<AccountListRow[]> {
  return getDb()
    .selectFrom('accounts')
    .select(['id', 'email', 'name', 'role', 'state', 'last_sign_in'])
    .orderBy('last_sign_in', (order) => order.asc().nullsFirst())
    .orderBy('email')
    .execute();
}

/**
 * Whether `subjectId` is the only admin who can sign in — the safe default for
 * [`ADMIN-DEC-01`](../../docs/decisions-log.md#ADMIN-DEC-01). An act that would
 * leave no such admin is refused by its caller, because a room with no admin who
 * can act cannot recover itself — reinstating a suspended admin is an admin act,
 * and there is no bootstrap that creates a first admin — so it is recoverable
 * only from the database.
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

/**
 * Erase an account: the row is deleted, and the foreign keys carry the deletion
 * outward exactly as the manifest declares (`DATA-002`). What is about the person
 * goes with them — the sessions they hold, the invitation they were sent, the
 * mail they received, the decks they were granted — and what they did on the
 * company's behalf stays behind with a null actor: a revision they authored, a
 * translation they reviewed, a grant they made for somebody else, a file they
 * uploaded, the board they last touched. The split is the manifest's, and a gate
 * holds the schema to it; this function is what sets it in motion.
 *
 * Returns whether a row was erased — `false` for an id no account holds, and
 * `false` when the act is refused before anything is written.
 *
 * The guard matters more here than anywhere, because erasure is final and has no
 * inverse (`ADMIN-DEC-01`): an admin may not erase their own account, and no
 * single act may leave the room with no admin who can sign in. A suspension that
 * stranded the room could be undone from the database; an erasure could not be
 * undone at all. Both refusals return the `false` a no-op returns, before any
 * write.
 *
 * No session is ended by hand, unlike a suspension's: deleting the accounts row
 * cascades to `sessions`, so the person is signed out by the statement that
 * erases them. The `account.delete` audit row outlives the account it names —
 * `actor_id` and `subject_id` are bare uuids, not foreign keys, so the record of
 * who erased whom survives its own subject (`SEC-002`, `DATA-R03`) — and it is
 * written in the same transaction as the delete, so the two are one act.
 */
export async function eraseAccount(accountId: string, actorId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      // Safe default for ADMIN-DEC-01, before anything is written, and weightier
      // than suspension's because there is no way back: an admin may not erase
      // their own access, and no single act may leave the room with no admin who
      // can sign in. Both return the same `false` a no-op returns.
      if (actorId === accountId) {
        return false;
      }
      if (await isLastActiveAdmin(trx, accountId)) {
        return false;
      }

      const erased = await trx
        .deleteFrom('accounts')
        .where('id', '=', accountId)
        .returning('id')
        .executeTakeFirst();

      if (erased === undefined) {
        return false;
      }

      await recordAudit(trx, {
        actorId,
        action: 'account.delete',
        subjectType: 'account',
        subjectId: accountId,
      });

      return true;
    });
}

/**
 * Honour a person's objection to read-tracking (`LEGAL-GLOBAL-001/T3`, `DATA-R03`).
 *
 * Setting the flag stops the record functions writing new reads for this account,
 * and this deletes the reads already kept — a right exercised, so the flag, the
 * deletes and the audit row are one transaction (`SEC-R04`). The room keeps
 * working: unread marking degrades to everything looking new, which is the cost
 * the person chose. Returns whether it changed anything — `false` when the account
 * had already objected or holds no id, in which case nothing is written or
 * deleted. The narrowed `UPDATE` is the check, as in the acts above: a second
 * objection matches nothing and the trail carries one act, not two.
 */
export async function objectToReadTracking(accountId: string, actorId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const objected = await trx
        .updateTable('accounts')
        .set({ read_tracking_objected: true })
        .where('id', '=', accountId)
        .where('read_tracking_objected', '=', false)
        .returning('id')
        .executeTakeFirst();

      if (objected === undefined) {
        return false;
      }

      await trx.deleteFrom('deck_reads').where('account_id', '=', accountId).execute();
      await trx.deleteFrom('report_reads').where('account_id', '=', accountId).execute();

      await recordAudit(trx, {
        actorId,
        action: 'account.object_read_tracking',
        subjectType: 'account',
        subjectId: accountId,
      });

      return true;
    });
}

/** Everything held about one person, as a machine-readable record (`LEGAL-GLOBAL-001/T2`). */
export interface PersonExport {
  readonly account: {
    readonly email: string;
    readonly name: string;
    readonly role: AccountRole;
    readonly state: AccountState;
    readonly lastSignIn: Date | null;
  };
  readonly decksGranted: readonly AccountGrant[];
  readonly decksRead: readonly {
    readonly deckId: string;
    readonly version: number;
    readonly firstOpenedAt: Date;
    readonly lastOpenedAt: Date;
  }[];
  readonly reportsRead: readonly { readonly reportId: string; readonly readAt: Date }[];
  readonly mail: readonly { readonly subject: string; readonly at: Date }[];
}

/**
 * Everything held about one person, gathered for a data-portability request
 * (`LEGAL-GLOBAL-001/T2`, `DATA-R01`). An admin generates it and sends the file;
 * there is no self-service route and no link mailed to the person, because a link
 * to a person's whole record is a credential in an inbox (`DATA-R02`).
 *
 * It reads the five things the system holds about a person: the account's own
 * fields — never the password hash — the decks they were granted, which deck
 * versions and which reports they opened and when, and the subjects and dates of
 * the mail they were sent. The grants read is delegated to `content/grants`,
 * because the grant table lives behind the audience predicate's module boundary;
 * the rest are this person's own rows, each scoped by `account_id` (`DATA-R05`).
 * It answers `null` for an id no account holds.
 */
export async function exportPersonData(accountId: string): Promise<PersonExport | null> {
  const db = getDb();

  const account = await db
    .selectFrom('accounts')
    .select(['email', 'name', 'role', 'state', 'last_sign_in'])
    .where('id', '=', accountId)
    .executeTakeFirst();
  if (account === undefined) {
    return null;
  }

  const decksGranted = await grantsForAccount(accountId);

  const deckRead = await db
    .selectFrom('deck_reads')
    .select(['deck_id', 'version', 'first_opened_at', 'last_opened_at'])
    .where('account_id', '=', accountId)
    .orderBy('deck_id')
    .orderBy('version')
    .execute();

  const reportRead = await db
    .selectFrom('report_reads')
    .select(['item_id', 'read_at'])
    .where('account_id', '=', accountId)
    .orderBy('item_id')
    .execute();

  const mail = await db
    .selectFrom('mail_log')
    .select(['subject', 'at'])
    .where('account_id', '=', accountId)
    .orderBy('at')
    .execute();

  return {
    account: {
      email: account.email,
      name: account.name,
      role: account.role,
      state: account.state,
      lastSignIn: account.last_sign_in,
    },
    decksGranted,
    decksRead: deckRead.map((row) => ({
      deckId: row.deck_id,
      version: row.version,
      firstOpenedAt: row.first_opened_at,
      lastOpenedAt: row.last_opened_at,
    })),
    reportsRead: reportRead.map((row) => ({ reportId: row.item_id, readAt: row.read_at })),
    mail: mail.map((row) => ({ subject: row.subject, at: row.at })),
  };
}
