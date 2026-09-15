/**
 * What is done to an account (`ADMIN-001`): the list of who can sign in and the
 * one person behind a row of it, the eight acts an admin performs on somebody
 * else's account — suspend, role change, reinstate, end every session, erase,
 * honour a read-tracking objection, correct a name or an address, and say
 * whether the person has invested or is deciding — the erasure a person performs
 * on their own, and a read of everything held about one, for a data-portability
 * request (`LEGAL-GLOBAL-001/T2`).
 *
 * **Two of these acts have a second caller, and it is the account holder.**
 * [`ADMIN-DEC-06`](../../docs/decisions-log.md#ADMIN-DEC-06) lets a signed-in
 * reader correct their own name and address and delete their own account from
 * `/hall/account`, and the acts they reach are these rather than copies of them:
 * a second function writing `accounts.email` would be a second answer to what a
 * correction refuses, and the refusals are the whole content of the act. So
 * `correctIdentity` serves both callers unchanged, and erasure is one write body
 * behind two entry points that differ in exactly one refusal — stated below,
 * where the refusals are.
 *
 * The reads are plain and carry none of what follows. Each act is one carrying
 * several writes, and the design is that the writes are one
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
 * matches nothing and the trail carries one act rather than two. Ending every
 * session has no narrowed `UPDATE` to carry that check — a delete either matches
 * rows or it does not — so it locks the rows it is about to remove and reads
 * whether there were any, which lands in the same place: the second of two
 * concurrent calls finds them gone and records nothing.
 *
 * **Nothing to change is not an error, and it is not an act either.** An
 * account already in the state being asked for is left untouched: no session is
 * ended, no invitation is destroyed, and nothing is recorded, because the trail
 * holds acts and not re-assertions of a state. Each returns whether it changed
 * anything, which is also `false` for an id no account holds — in both cases
 * the answer to the caller is that nothing was written.
 *
 * **Two refusals, and they are not the same rule.** *No act may strand the
 * hall*: no single act may leave the hall with no admin who can sign in, and
 * that one binds every path there is or ever will be, because a hall with no
 * admin who can sign in cannot recover itself — reinstating a suspended admin is
 * an admin act, and no bootstrap creates a first admin — so it is recoverable
 * only from the database. *No admin may turn a privileged act on themselves*
 * (`ADMIN-DEC-01`): an admin cannot suspend, demote, or erase their own account
 * from the console, and the reason that costs nothing is the one the decision
 * gives — the hall has two admins, so the act they wanted is one they ask the
 * other admin for. Both are refused before anything is written, returning the
 * same `false` a no-op returns.
 *
 * The second rule is about privilege and not about the subject, which is why it
 * does not travel to the account holder's own erasure. A person deleting their
 * own account is not reaching past what they may do; they are exercising the
 * erasure right the regime gives them (`DATA-R03`), and a refusal that fired on
 * *actor is subject* would refuse precisely the case the control exists for. The
 * first rule does travel, unchanged: an erasure that stranded the hall would be
 * as unrecoverable arriving from `/hall/account` as from the console, so
 * `eraseOwnAccount` takes it and `ADMIN-DEC-06` says so.
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

import { sql, type Transaction } from 'kysely';

import { recordAudit } from '../audit/record';
import { isAddressShaped, lockAddress, normaliseAddress } from '../auth/address';
import { invalidateAllForAccountIn } from '../auth/session';
import { type AccountGrant, erasureContentCounts, grantsForAccount } from '../content/grants';
import { getDb } from '../db/index';
import type { AccountRole, AccountState, Database, InvestorType } from '../db/types';

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
 * The shape an account id takes, checked before a value from a URL reaches a
 * uuid column. `accounts.id` is a uuid, so a segment that is not one would make
 * the query raise where the honest answer is that no account holds it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One person, as the identity section of their page states them (`ADMIN-001/T2`). */
export interface PersonIdentity {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: AccountRole;
  readonly state: AccountState;
  readonly createdAt: Date;
  /** `null` when the person has never signed in. */
  readonly lastSignIn: Date | null;
  /** `null` when nobody has said, which is not the same as `prospect` (`INV-DEC-02`). */
  readonly investorType: InvestorType | null;
}

/**
 * The one person a page is about, or `null` when no account holds the id
 * (`ADMIN-001/T2`).
 *
 * Eight fields, which is the identity section and the whole of what the record
 * holds about a person worth showing (`DATA-R01`): the password hash stays in the
 * database, `updated_at` is the row's own clock rather than anything about them,
 * and there is no note field to read because there is no note field.
 *
 * It is also what resolves the subject of an act: a surface that knows the
 * account exists can answer "no such account" itself, instead of handing an
 * unknown id to an operation whose `false` would read as a refusal.
 */
export async function personIdentity(accountId: string): Promise<PersonIdentity | null> {
  if (!UUID.test(accountId)) {
    return null;
  }

  const account = await getDb()
    .selectFrom('accounts')
    .select(['id', 'email', 'name', 'role', 'state', 'created_at', 'last_sign_in', 'investor_type'])
    .where('id', '=', accountId)
    .executeTakeFirst();

  if (account === undefined) {
    return null;
  }

  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    state: account.state,
    createdAt: account.created_at,
    lastSignIn: account.last_sign_in,
    investorType: account.investor_type,
  };
}

/**
 * Whether `subjectId` is the only admin who can sign in — the safe default for
 * [`ADMIN-DEC-01`](../../docs/decisions-log.md#ADMIN-DEC-01). An act that would
 * leave no such admin is refused by its caller, because a hall with no admin who
 * can act cannot recover itself — reinstating a suspended admin is an admin act,
 * and there is no bootstrap that creates a first admin — so it is recoverable
 * only from the database.
 *
 * Active, not merely `admin`: a suspended admin cannot sign in, and reinstating
 * one is itself an admin act, so the count the hall depends on is admins who can
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
 * Whether this account is the only admin who can sign in, asked outside any act
 * — so a surface can say that erasure is closed to them instead of offering a
 * control the service would refuse (the `ADMIN-DEC-01` precedent, where the
 * person page hides the suspend control on the actor's own account).
 *
 * It opens a transaction to reach the same predicate the guards use rather than
 * spelling a second one. Two spellings of *the last admin who can sign in* would
 * be two chances to count it differently, and the disagreement would surface as
 * a page that offers a control the act refuses, or hides one it would allow.
 *
 * What it answers is true when it is read and is not a guarantee: another admin
 * can be suspended between this read and the press. That is why it decides what
 * is rendered and never what is permitted — the guard inside the act is the
 * control, and it re-evaluates under the lock.
 */
export async function isLastActiveAdminAccount(accountId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute((trx) => isLastActiveAdmin(trx, accountId));
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
      // not act on their own access, and no single act may leave the hall with
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
 * What a role change did, or the reason it did nothing.
 *
 * Four outcomes rather than a boolean, because four different things make a
 * role change do nothing and a surface that cannot tell them apart says the
 * wrong one out loud: an admin refused for demoting the last admin who can sign
 * in would read “the account already says that”, which is a lie about a refusal
 * — and a refusal an operator misreads as a no-op is the one they retry.
 */
export type RoleChangeOutcome =
  | 'changed'
  | 'unchanged'
  | 'refused_self'
  | 'refused_last_admin'
  | 'no_such_account';

/**
 * Change an account's role, ending every session it holds. Says what it did:
 * `unchanged` only when the account already held the role, and a named refusal
 * otherwise, in which case nothing is written, nobody is signed out and nothing
 * is recorded.
 *
 * This is how a `prospect` becomes an `investor` once they have invested
 * (`AUTH-DEC-06`), the ordinary end of a registered person's first chapter
 * rather than an exceptional act — which is why the refusals are named for the
 * console rather than folded into one silent `false`. The trail
 * carries the role that was replaced beside the one that replaced it
 * (`SEC-DEC-01`), so a reader months later can tell which direction a privilege
 * moved without restoring a database.
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
): Promise<RoleChangeOutcome> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      // Safe default for ADMIN-DEC-01: an admin may not change their own role,
      // and demoting the last admin who can sign in is refused. The check is
      // unconditional — promoting an investor leaves them outside the active-
      // admin set, so it is never the last one, and a self-change is refused
      // whichever direction it runs.
      if (actorId === accountId) {
        return 'refused_self';
      }
      if (await isLastActiveAdmin(trx, accountId)) {
        return 'refused_last_admin';
      }

      // The role as it stands, read under the lock the `UPDATE` will hold
      // anyway, because the `UPDATE ... RETURNING` can only hand back the value
      // it wrote and the trail records what a change replaced (`SEC-DEC-01`).
      // It decides nothing — the narrowed `UPDATE` below is still the check, so
      // a second concurrent call re-evaluates that predicate against the row the
      // first committed and matches nothing, whatever this read saw.
      const held = await trx
        .selectFrom('accounts')
        .select('role')
        .where('id', '=', accountId)
        .forUpdate()
        .executeTakeFirst();

      if (held === undefined) {
        return 'no_such_account';
      }

      const changed = await trx
        .updateTable('accounts')
        .set({ role: newRole })
        .where('id', '=', accountId)
        .where('role', '<>', newRole)
        .returning('id')
        .executeTakeFirst();

      if (changed === undefined) {
        return 'unchanged';
      }

      await invalidateAllForAccountIn(trx, accountId);

      await recordAudit(trx, {
        actorId,
        action: 'account.role_change',
        subjectType: 'account',
        subjectId: accountId,
        before: { role: held.role },
        after: { role: newRole },
      });

      return 'changed';
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
 * strand the hall — it only adds to the set of admins who can sign in — and a
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

/** A field a correction may move, named as the row names it. */
export type CorrectableField = 'name' | 'email';

/**
 * What an admin is asking to correct. A field left out is left alone, so
 * correcting one of the two says nothing about the other.
 */
export interface Correction {
  readonly name?: string;
  readonly email?: string;
}

/**
 * What came of a correction. Four answers, because a correction can fail in two
 * ways the other acts cannot: the value offered is not one the column can hold,
 * and the address offered belongs to somebody else. Each names itself, so the
 * surface can say which it was instead of reporting a refusal it cannot explain.
 */
export type CorrectionResult =
  | {
      readonly outcome: 'changed';
      /** Which fields moved. Never what they held — that is the point. */
      readonly fields: readonly CorrectableField[];
      /** Whether an outstanding invitation went with the address. */
      readonly invitationDestroyed: boolean;
    }
  | { readonly outcome: 'unchanged' }
  | { readonly outcome: 'address-taken' }
  | { readonly outcome: 'invalid'; readonly field: CorrectableField };

/**
 * Correct a person's name or the address they sign in with, which is how the
 * PDPA's correction right is answered from the console rather than from the
 * database (`LEGAL-SG-001` §3, `ADMIN-001/T10`).
 *
 * **The trail records which fields moved and never what they held.** No action's
 * allow-list may name `name` or `email` (`SEC-DEC-01`), so the one act whose
 * whole subject is those two fields records the fact that they moved — a value
 * on either side would put the person into a table kept seven years past their
 * erasure (`DATA-R02`), and the correction case is the one where *both* the old
 * and the new value are theirs. Neither ever leaves the database: the statements
 * below compute the new value from the old inside SQL, so this process never
 * holds either.
 *
 * **Correcting the address destroys an outstanding invitation.** A live token is
 * a way to set this account's password, and it was minted for the address that
 * has just been found wrong — so leaving it valid leaves a working way in
 * sitting in a mailbox the account holder does not read (`AUTH-003`). The delete
 * is the suspension's, in the same transaction as the address, and outstanding
 * means unconsumed: a consumed row records that somebody used a token at a
 * stated moment, which stays true. The answer says whether one went, because an
 * admin who corrected a typo needs to know that the link they sent has stopped
 * working.
 *
 * **No session is ended**, unlike a role change's. A session is keyed to the
 * account, the person behind it is the same person, and what they may read has
 * not moved — a correction grants nothing and takes nothing away, so there is no
 * privilege change for a live session's claims to be stale about (`SEC-R02`).
 * Where the account is in the wrong hands rather than merely mis-spelled, the act
 * wanted is suspension or ending the sessions, and both are on the same page;
 * this one cannot tell those apart and does not pretend to.
 *
 * **A taken address is refused by name.** `accounts.email` is unique and
 * `citext`, so "taken" is case-insensitive, and the refusal is read from a
 * lookup rather than from a driver's error code. The lookup can decide because
 * it is taken under the lock every writer of that address holds
 * (`lockAddress`), so no invitation and no other correction can claim it between
 * this read and this write. If the unique index ever raises here the lock
 * discipline has broken, and the transaction rolling back with it is the honest
 * answer rather than a caught code that would hide it.
 *
 * **Asking for what the row already holds is not an error and not an act.** The
 * comparison is the database's — `citext` for the address, the column's
 * collation for the name — so a correction that only changes the case of an
 * address moves nothing, records nothing, and leaves the invitation alone. The
 * narrowed `UPDATE` is still the check, as in the acts above: it is belt and
 * braces while the row lock is held across the read, and it is what keeps the
 * write honest if the two are ever separated.
 */
export async function correctIdentity(
  accountId: string,
  correction: Correction,
  actorId: string,
): Promise<CorrectionResult> {
  const name = correction.name === undefined ? undefined : correction.name.trim();
  const address = correction.email === undefined ? undefined : normaliseAddress(correction.email);

  // Refused before anything is locked or read, and refused for the value's own
  // shape: a blank name is a row that names nobody, and an address the sign-in
  // door would turn away is access nobody could use (`AUTH-001`).
  if (name !== undefined && name.length === 0) {
    return { outcome: 'invalid', field: 'name' };
  }
  if (address !== undefined && !isAddressShaped(address)) {
    return { outcome: 'invalid', field: 'email' };
  }

  return getDb()
    .transaction()
    .execute(async (trx) => {
      if (address !== undefined) {
        // Before the row lock, and in the same order `inviteAccount` takes the
        // two, so a correction and an invitation racing for one address
        // serialise rather than deadlock.
        await lockAddress(trx, address);
      }

      // `coalesce` makes an absent field compare against itself, so one
      // expression covers both "correct this" and "leave this alone" without a
      // second query shape. The comparison is the database's, which is the point:
      // `citext` decides what a changed address is, and reading the two values
      // out to compare them here would both differ from that and put them in
      // this process.
      const nextName = sql<string>`coalesce(${name ?? null}::text, name)`;
      const nextAddress = sql<string>`coalesce(${address ?? null}::citext, email)`;

      const held = await trx
        .selectFrom('accounts')
        .select([
          sql<boolean>`name is distinct from ${nextName}`.as('nameMoves'),
          sql<boolean>`email is distinct from ${nextAddress}`.as('addressMoves'),
        ])
        .where('id', '=', accountId)
        .forUpdate()
        .executeTakeFirst();

      if (held === undefined) {
        return { outcome: 'unchanged' };
      }

      const nameMoves = name !== undefined && held.nameMoves;
      const addressMoves = address !== undefined && held.addressMoves;

      if (!nameMoves && !addressMoves) {
        return { outcome: 'unchanged' };
      }

      if (addressMoves) {
        const taken = await trx
          .selectFrom('accounts')
          .select('id')
          .where('email', '=', address)
          .where('id', '<>', accountId)
          .executeTakeFirst();

        if (taken !== undefined) {
          return { outcome: 'address-taken' };
        }
      }

      const corrected = await trx
        .updateTable('accounts')
        .set({ name: nextName, email: nextAddress })
        .where('id', '=', accountId)
        .where((eb) =>
          eb.or([
            eb('name', 'is distinct from', nextName),
            eb('email', 'is distinct from', nextAddress),
          ]),
        )
        .returning('id')
        .executeTakeFirst();

      if (corrected === undefined) {
        return { outcome: 'unchanged' };
      }

      const fields: CorrectableField[] = [];
      if (nameMoves) {
        fields.push('name');
      }
      if (addressMoves) {
        fields.push('email');
      }

      const destroyed = addressMoves
        ? await trx
            .deleteFrom('invitations')
            .where('account_id', '=', accountId)
            .where('consumed_at', 'is', null)
            .returning('id')
            .execute()
        : [];

      await recordAudit(trx, {
        actorId,
        action: 'account.correct',
        subjectType: 'account',
        subjectId: accountId,
        // The moved column names, in the order the page states them. `before` is
        // absent because there is no prior value this row may carry: the two
        // fields a correction moves are the two no allow-list may name.
        after: { fields: fields.join(',') },
      });

      return { outcome: 'changed', fields, invitationDestroyed: destroyed.length > 0 };
    });
}

/**
 * Say whether this person has already invested or is still deciding, or that
 * nobody has said (`INV-DEC-02`). Returns whether anything moved — `false` for a value the row already holds and
 * for an id no account holds, in both of which nothing is written and nothing is
 * recorded.
 *
 * **It orders the hall's landing and gates nothing.** What a reader may read is
 * their grants and each document's audience through `CMS-006`, and nothing here
 * reaches either: the predicate those compose is handed an `Actor`, which carries
 * an id and a role and no type at all, so an access rule cannot read this column
 * without somebody first widening what the gate resolves. A person set to the
 * wrong type sees an oddly ordered page and never a document that is not theirs,
 * and that is a property of the shape rather than of the care taken here.
 *
 * **`null` is offered as deliberately as the other two.** It is what the column
 * says when nobody has described this person, and an admin who classified the
 * wrong account has to be able to put it back — a control that could only ever
 * add a judgement would make "nobody has said" a state the product can leave and
 * never return to.
 *
 * **The trail holds that the act happened and neither value** (`SEC-DEC-01`).
 * `account.investor_type_change` names no recordable field, so the row is the
 * actor, the subject and the act: recording the value would keep a statement
 * about a named person in a table retained seven years past their erasure, which
 * is the same reasoning that keeps a correction's two values out of it
 * (`ADMIN-001/T10`, `DATA-R02`). The audit is written in the transaction that
 * writes the column, so neither can happen without the other (`SEC-R04`).
 *
 * The narrowed `UPDATE` is the check, as in the acts above: two admins choosing
 * at once serialise on the row lock, and the second re-evaluates `is distinct
 * from` against the value the first committed, so setting a type already held
 * matches nothing and the trail carries one act rather than two.
 */
export async function setInvestorType(
  accountId: string,
  investorType: InvestorType | null,
  actorId: string,
): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const moved = await trx
        .updateTable('accounts')
        .set({ investor_type: investorType })
        .where('id', '=', accountId)
        .where('investor_type', 'is distinct from', investorType)
        .returning('id')
        .executeTakeFirst();

      if (moved === undefined) {
        return false;
      }

      await recordAudit(trx, {
        actorId,
        action: 'account.investor_type_change',
        subjectType: 'account',
        subjectId: accountId,
      });

      return true;
    });
}

/**
 * End every session an account holds, on any device, at an admin's hand
 * (`ADMIN-001/T2`, `AUTH-004`). Returns whether anything was ended — `false` when
 * the account held no live session, in which case nothing is written and nothing
 * is recorded.
 *
 * It is the same delete a person performs on themselves, asked for by somebody
 * else, so the account-wide predicate is `invalidateAllForAccountIn`'s and not a
 * second spelling of it. What this adds is the audit row: a person ending their
 * own sessions is a routine act the trail does not hold, and an admin ending
 * somebody else's is a privileged one it does (`SEC-R04`), recorded in the same
 * transaction as the delete so the two cannot come apart.
 *
 * What counts as something to end is a session the gate would still resolve, so
 * the check carries the gate's own liveness predicate: an account whose only rows
 * have lapsed has no access to revoke, and recording an act there would put a
 * revocation in the trail that revoked nothing. A lapsed row beside a live one is
 * deleted with it — it is not a session, and the retention sweep would have taken
 * it anyway.
 *
 * The rows are locked before they are deleted so the check and the act are one:
 * two admins pressing at once meet at the lock, and the second finds the rows
 * gone and records nothing, where a count taken outside a transaction would let
 * both write an act.
 *
 * It needs none of the guard the state-changing acts carry (`ADMIN-DEC-01`).
 * Ending sessions takes away no access: the account may still sign in, so no act
 * here can leave the hall without an admin who can, and an admin who ends their
 * own sessions has signed themselves out rather than locked themselves out.
 */
export async function endAllSessions(accountId: string, actorId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const live = await trx
        .selectFrom('sessions')
        .select('id')
        .where('account_id', '=', accountId)
        .where('expires_at', '>', sql<Date>`now()`)
        .forUpdate()
        .execute();

      if (live.length === 0) {
        return false;
      }

      await invalidateAllForAccountIn(trx, accountId);

      await recordAudit(trx, {
        actorId,
        action: 'session.invalidate_all',
        subjectType: 'account',
        subjectId: accountId,
      });

      return true;
    });
}

/** What deleting an account removes and what it leaves, by count and by kind. */
export interface ErasureCounts {
  readonly sessions: number;
  readonly invitations: number;
  /** Grants of access the person held, of any item type. */
  readonly grants: number;
  readonly deckReads: number;
  readonly reportReads: number;
  /** Revisions the person wrote, which survive with a null author (`DATA-002/T5`). */
  readonly authoredRevisions: number;
}

/** The tables holding rows that are about one account and go with it (`DATA-002`). */
type AccountScopedTable = 'sessions' | 'invitations' | 'deck_reads' | 'report_reads';

async function countFor(table: AccountScopedTable, accountId: string): Promise<number> {
  // `count(*)` is an `int8`, which the driver hands back as a string rather than
  // rounding a value a JavaScript number cannot hold exactly.
  const counted = await getDb()
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<string>().as('rows'))
    .where('account_id', '=', accountId)
    .executeTakeFirstOrThrow();

  return Number(counted.rows);
}

/**
 * What deleting an account would take with it and what it would leave behind, for
 * the confirmation to state before it takes the typed name (`ADMIN-001/T4`).
 *
 * Five kinds go and one stays, which is the erasure manifest's split seen from the
 * surface (`DATA-002`). What is about the person — the ways they could sign in,
 * the access they held, what they opened — is removed by the foreign keys'
 * cascades. A revision they wrote stays, with its author unset, because a
 * published document is the company's rather than theirs (`DATA-002/T5`).
 *
 * Counts, not rows. The confirmation needs to say how much goes; a preview that
 * named which decks somebody had opened would be putting their reading history on
 * an admin's screen in order to justify deleting it (`DATA-R01`).
 *
 * The grant and the revision halves come from the content module, which is where
 * those tables are read. The rest are this person's own rows, each scoped by
 * `account_id` (`DATA-R05`).
 */
export async function erasureCounts(accountId: string): Promise<ErasureCounts> {
  const [sessions, invitations, deckReads, reportReads, content] = await Promise.all([
    countFor('sessions', accountId),
    countFor('invitations', accountId),
    countFor('deck_reads', accountId),
    countFor('report_reads', accountId),
    erasureContentCounts(accountId),
  ]);

  return {
    sessions,
    invitations,
    grants: content.grants,
    deckReads,
    reportReads,
    authoredRevisions: content.authoredRevisions,
  };
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
 * inverse: an admin may not erase their own account (`ADMIN-DEC-01`), and no
 * single act may leave the hall with no admin who can sign in. A suspension that
 * stranded the hall could be undone from the database; an erasure could not be
 * undone at all. Both refusals return the `false` a no-op returns, before any
 * write.
 *
 * This is the console's door. The account holder's own is `eraseOwnAccount`, and
 * the two reach one write body.
 */
export async function eraseAccount(accountId: string, actorId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      // Safe default for ADMIN-DEC-01, before anything is written, and weightier
      // than suspension's because there is no way back: an admin may not erase
      // their own access from the console. The stranding guard below binds every
      // path and is taken inside `eraseIn`.
      if (actorId === accountId) {
        return false;
      }

      return eraseIn(trx, accountId, actorId);
    });
}

/**
 * Erase the account the reader is signed in as, at their own request
 * ([`ADMIN-DEC-06`](../../docs/decisions-log.md#ADMIN-DEC-06), `DATA-R03`).
 *
 * It takes one id, not two, and that is the authorisation expressed as a
 * signature: the actor and the subject of this act are one account by
 * definition, so there is no pair for a caller to get wrong and no id a posted
 * body could supply. Who that account is, is the session's answer and the
 * handler's question.
 *
 * One refusal stands and one does not. *No act may leave the hall with no admin
 * who can sign in* holds here exactly as it holds in the console — the sole
 * remaining admin is told so and is not erased — because the hall it would
 * strand is the same hall and an erasure is as final from this door as from the
 * other. *An admin may not act on their own access* is the console's rule and is
 * not carried over: it exists so that a privileged act passes a second pair of
 * eyes, and this act is not privileged — it is a person exercising erasure over
 * their own record, which is the one case where actor and subject being equal is
 * the point rather than the hazard.
 *
 * Returns whether a row was erased — `false` for the stranding refusal and for
 * an id no account holds, in both of which nothing is written.
 */
export async function eraseOwnAccount(accountId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute((trx) => eraseIn(trx, accountId, accountId));
}

/**
 * The erasure itself, inside the caller's transaction: the stranding guard, the
 * delete, and the audit row that records it.
 *
 * It is one body behind both doors so that what erasure *does* cannot differ by
 * the path taken to it. Only the refusal that is genuinely about privilege lives
 * outside, at the console's entry point, where the privilege is.
 *
 * No session is ended by hand, unlike a suspension's: deleting the accounts row
 * cascades to `sessions`, so the person is signed out by the statement that
 * erases them. The `account.delete` audit row outlives the account it names —
 * `actor_id` and `subject_id` are bare uuids, not foreign keys, so the record of
 * who erased whom survives its own subject (`SEC-002`, `DATA-R03`) — and it is
 * written in the same transaction as the delete, so the two are one act. When
 * the person erased themselves the two ids are equal, which is the trail stating
 * exactly that and not a field left unfilled.
 */
async function eraseIn(
  trx: Transaction<Database>,
  accountId: string,
  actorId: string,
): Promise<boolean> {
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
}

/**
 * Honour a person's objection to read-tracking (`LEGAL-GLOBAL-001/T3`, `DATA-R03`).
 *
 * Setting the flag stops the record functions writing new reads for this account,
 * and this deletes the reads already kept — a right exercised, so the flag, the
 * deletes and the audit row are one transaction (`SEC-R04`). The hall keeps
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
    /**
     * Whether the company has recorded this person as having invested or as
     * deciding, `null` where nobody has said. It is a statement about them, so a
     * request for what is held is answered with it or is answered incompletely
     * (`INV-DEC-02`, `DATA-R03`).
     */
    readonly investorType: InvestorType | null;
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
 * fields — never the password hash, and including whether the company has
 * recorded them as an investor or as deciding — the decks they were granted, which deck
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
    .select(['email', 'name', 'role', 'state', 'last_sign_in', 'investor_type'])
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
      investorType: account.investor_type,
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
