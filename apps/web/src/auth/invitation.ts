/**
 * How an account comes to have a password (`AUTH-003`): the token an invitation
 * and a password reset are both carried by, the invitation an admin creates,
 * and the reset a person asks for themselves.
 *
 * One mechanism, two flows. They differ in who starts them and in how long the
 * token lives, and in nothing else, so building them separately would give two
 * consumption rules and two chances to get single-use wrong.
 *
 * The token is 32 bytes from the system CSPRNG, base64url, and the row holds
 * only its SHA-256 — a database read gives an attacker nothing to present. The
 * hash is SHA-256 rather than Argon2 for the same reason the session token's
 * is: the value is 256 bits of randomness, so there is no low-entropy secret
 * for a slow hash to protect.
 *
 * Consumption is one statement, and the statement that consumes is the check.
 * A read followed by a write would let two simultaneous posts both pass the
 * read, and the second would set a password the first person did not choose.
 *
 * The two flows part company in one place: what they hand back. An invitation
 * returns its link, because an admin is standing at the screen and a missing
 * mail credential must degrade delivery rather than stop them adding an
 * investor (`SEC-R05`). A reset returns nothing at all — a token in the answer
 * would be a self-service password reset for anybody who knows an address, and
 * an answer that differed in any respect between an address an account holds
 * and one it does not is the enumeration oracle `SEC-R03` closes.
 */

import { createHash, randomBytes } from 'node:crypto';

import { sql, type RawBuilder, type Transaction } from 'kysely';

import { recordAudit } from '../audit/record';
import { getConfig, type MailConfig } from '../config/index';
import { getDb } from '../db/index';
import type { AccountRole, Database } from '../db/types';

import { MAX_EMAIL_LENGTH, normaliseAddress } from './address';

/** 256 bits from the system CSPRNG, which is what makes the token unguessable. */
const TOKEN_BYTES = 32;

const SECONDS_PER_HOUR = 3600;
const HOURS_PER_DAY = 24;

/**
 * How long an invitation lives. Seven days, because an invitation is expected
 * to sit in an inbox over a weekend before the person it names opens it.
 *
 * A constant rather than an environment variable, unlike the session lifetime
 * an operator legitimately tunes: this number and the one below are a security
 * policy whose reason for differing is an argument about how each flow is used,
 * and a deployment able to lengthen the reset window would be that policy
 * changed where nobody reviews it.
 */
export const INVITATION_TTL_SECONDS = 7 * HOURS_PER_DAY * SECONDS_PER_HOUR;

/**
 * How long a password reset lives. One hour, because it is asked for by
 * somebody who is at their keyboard right now, and every minute past that is a
 * window for a mailbox nobody is watching any more.
 */
export const RESET_TTL_SECONDS = SECONDS_PER_HOUR;

/**
 * The one hashing of a token in this module, so the value written at issue and
 * the value looked up at consumption cannot drift apart. Two spellings of the
 * same hash would fail closed — every token rejected — but a third variation
 * that agreed with the first would not, and neither failure is visible from a
 * row.
 */
function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Serialise everything that issues a token for one address, on a lock the
 * address alone decides.
 *
 * A row lock cannot do this job. `SELECT … FOR UPDATE` on the account takes a
 * lock when a row is there and takes none when it is not, so concurrent
 * requests for an address an account holds queue behind each other while
 * requests for an address it does not hold run straight through — and the gap
 * widens with every extra client, which is a membership oracle that grows
 * louder the harder it is asked. An advisory lock is taken on the address
 * itself, so both answers cost the same wait under any amount of concurrency.
 *
 * `hashtext` folds the address into the lock's integer key. Two addresses can
 * collide there and serialise together, which costs a little contention and
 * nothing else — the lock orders writers, it does not decide anything. It is
 * held to the end of the transaction and released with it, so no path can
 * forget to give it back.
 */
async function lockAddress(trx: Transaction<Database>, address: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${address}))`.execute(trx);
}

/**
 * The moment a token stops working, computed by the database rather than by
 * this process, because the predicate that later admits the token reads the
 * database's clock. Taking the value from one clock and the comparison from
 * another would make a skewed process issue tokens that live longer or shorter
 * than the constant says, and the skew would be invisible from either side.
 */
function expiresIn(ttlSeconds: number): RawBuilder<Date> {
  return sql<Date>`now() + make_interval(secs => cast(${ttlSeconds} as int))`;
}

/**
 * Mint a token for an account and return the plaintext, which exists here and
 * nowhere else: the caller shows it once and the row keeps only its hash.
 *
 * Issuing invalidates every outstanding token the account holds, in the same
 * transaction as the insert, so the account never holds two live tokens and
 * never holds none. Two live tokens is the state where a link somebody has
 * already forgotten sets a password after the current one was used; a gap with
 * none is a person clicking a link that was valid when it was sent.
 *
 * The account row is locked first, because "never two" is a claim about
 * concurrency and the delete-then-insert alone does not keep it. Two issues for
 * one account at READ COMMITTED would each delete against a snapshot that cannot
 * see the other's not-yet-committed insert, and both would insert — two live
 * tokens, the invariant broken through the issue path rather than the consume
 * path. The lock makes the second wait for the first to commit, so its delete
 * then sees and removes the first's row. The partial unique index on
 * `(account_id) WHERE consumed_at IS NULL` states the same invariant as a
 * schema property, so a caller that ever reached the insert without this lock is
 * refused by the database rather than quietly holding two.
 *
 * Outstanding means unconsumed, and invalidating means deleting. A consumed row
 * records that somebody used a token at a stated moment, which is true and is
 * kept; an unconsumed row records nothing but the ability to present it, so
 * stamping it `consumed_at` instead would write down a use that never happened.
 *
 * The transaction is the caller's, so an account created and invited together
 * commit or roll back as one — an `invited` account nobody can reach is not a
 * lesser version of an invitation, it is an account whose only way in was lost.
 * `Transaction<Database>` is not assignable from `Kysely<Database>`, so a caller
 * that opened no transaction cannot reach this at all, and a caller that opened
 * one cannot issue on a second connection and deadlock against its own
 * uncommitted account row.
 */
async function issueTokenIn(
  trx: Transaction<Database>,
  accountId: string,
  ttlSeconds: number,
): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  // The lock the "never two live tokens" invariant depends on: it serialises
  // concurrent issues for this account so the delete below sees a committed
  // predecessor rather than racing it.
  //
  // The state is part of the same statement rather than a check before it, and
  // that placement is what closes the race. `ADMIN-001` deletes a suspended
  // account's outstanding invitations so a link cannot re-open access that was
  // just ended; a suspension committing between a separate check and this lock
  // would let the new row land just after that delete. Here the lock and the
  // predicate are one: an issue that arrives first blocks the suspension, which
  // then deletes what it wrote, and an issue that arrives second waits on the
  // suspension's row lock and re-evaluates this predicate against the row it
  // committed — where it matches nothing.
  const issuable = await trx
    .selectFrom('accounts')
    .select('id')
    .where('id', '=', accountId)
    .where('state', '<>', 'suspended')
    .forUpdate()
    .executeTakeFirst();

  if (issuable === undefined) {
    throw new SuspendedAccountError();
  }

  await trx
    .deleteFrom('invitations')
    .where('account_id', '=', accountId)
    .where('consumed_at', 'is', null)
    .execute();

  await trx
    .insertInto('invitations')
    .values({
      account_id: accountId,
      token_hash: hashOf(token),
      expires_at: expiresIn(ttlSeconds),
    })
    .execute();

  return token;
}

/** Issue a token for an account that already exists, in a transaction of its own. */
export async function issueToken(accountId: string, ttlSeconds: number): Promise<string> {
  return getDb()
    .transaction()
    .execute((trx) => issueTokenIn(trx, accountId, ttlSeconds));
}

/**
 * Consume a token and return the account it belonged to, or `null`.
 *
 * `null` covers three states — no such token, already consumed, past its expiry
 * — and the caller answers them identically, because telling them apart tells
 * whoever is guessing which of the three their guess landed on.
 *
 * Single-use is settled inside the statement rather than by anything around it.
 * Two concurrent calls meet at the row: PostgreSQL blocks the second on the
 * first's lock, and when the first commits the second re-evaluates this
 * predicate against the row as it now stands, where `consumed_at` is no longer
 * null. It matches nothing, returns nothing, and answers `null` — a lock the
 * caller neither takes nor can forget to take.
 */
export async function consumeToken(token: string): Promise<string | null> {
  const consumed = await getDb()
    .updateTable('invitations')
    .set({ consumed_at: sql<Date>`now()` })
    .where('token_hash', '=', hashOf(token))
    .where('consumed_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`)
    .returning('account_id')
    .executeTakeFirst();

  return consumed?.account_id ?? null;
}

/** The person an admin is inviting. `DATA-R01` is the whole of it: a name, an address, a role. */
export interface NewAccount {
  readonly email: string;
  readonly name: string;
  readonly role: AccountRole;
}

/** What an admin is left holding after inviting somebody. */
export interface Invitation {
  readonly accountId: string;
  /**
   * The single-use link, absolute so it can be copied into any medium the admin
   * has. It carries the token in plaintext, which exists in this value and in
   * no row, so it is shown once and is not recoverable afterwards.
   */
  readonly link: string;
  /**
   * Why the admin must deliver `link` themselves, which while the send is
   * unbuilt (`AUTH-003/T3`) is every invitation, whatever the environment.
   *
   * A field that went empty as soon as a credential was configured would put
   * "sent" on the screen for an invitee who received nothing, and `MAIL-DEC-01`
   * tells operators to configure exactly that credential — so the honest answer
   * has two spellings of "by hand" rather than one of "by hand" and one of
   * silence. It becomes nullable when a send exists to make it null.
   */
  readonly deliverByHand: string;
}

/**
 * Why an admin carries the link even where mail is configured. The credential
 * says a message *could* be sent; nothing yet says one *was*.
 */
const NO_SEND_YET = 'no message is sent yet; deliver this link by hand';

/**
 * Raised when the address already belongs to an account.
 *
 * The message names no address. An error is the value most likely to be logged
 * or rendered by something generic, and an investor's e-mail address in a log
 * is the leak `DATA-R02` forbids — so there is nothing here for a later `catch`
 * to spill. Which address it was is what the admin typed, and their own screen
 * still has it.
 */
export class EmailTakenError extends Error {
  constructor() {
    super('an account already holds that address');
    this.name = 'EmailTakenError';
  }
}

/**
 * Raised when a token is asked for a suspended account.
 *
 * Suspending an account ends its access and deletes the invitation it held
 * (`ADMIN-001`), so issuing a fresh token would hand back the way in the
 * suspension removed. `issueTokenIn` refuses it in the same statement that takes
 * the account lock, so no re-issue can slip in just after a suspension. The same
 * refusal catches an id no account holds — a case the callers never reach, since
 * `inviteAccount` issues against the row it just created and a resend issues
 * against one it read. The message names no address (`DATA-R02`).
 */
export class SuspendedAccountError extends Error {
  constructor() {
    super('cannot issue a token for a suspended account');
    this.name = 'SuspendedAccountError';
  }
}

/**
 * The link an invitee opens. base64url is already URL-safe — the alphabet is
 * `A-Z a-z 0-9 - _` — so the token is placed rather than encoded, and what the
 * admin copies is byte-for-byte what `consumeToken` will hash.
 */
function inviteLink(token: string): string {
  return `${getConfig().app.origin}/invite/${token}`;
}

/**
 * Create an `invited` account and the invitation that lets that person set
 * their own password. The only way an account comes to exist: there is no
 * self-registration, and no admin sets a password on somebody else's behalf.
 *
 * One transaction covers all three writes — the account, its token, and the
 * audit row that says who created it (`SEC-R04`). An account with no invitation
 * is a person who cannot get in and whom the one-outstanding rule will not
 * issue a second link for; an invitation with no account cannot exist at all;
 * and a creation with no audit row is a privileged write that did not happen.
 *
 * `state` and `password_hash` are left to the column defaults rather than
 * written here. `accounts.state` defaults to `invited` and `password_hash` is
 * nullable, so this insert produces exactly the account an invitation is for,
 * and stating either value again would be a second copy to go stale against the
 * migration that owns it.
 *
 * `mail` defaults to the running configuration and is a parameter so a test can
 * drive the credential-present branch without a second environment; nothing in
 * the application passes it.
 */
export async function inviteAccount(
  account: NewAccount,
  invitedBy: string,
  mail: MailConfig = getConfig().mail,
): Promise<Invitation> {
  const address = normaliseAddress(account.email);

  const invited = await getDb()
    .transaction()
    .execute(async (trx) => {
      // The same lock a reset takes, so an invitation and a reset for one
      // address cannot interleave. Without it a reset that had already deleted
      // the outstanding row would meet this insert at the partial unique index
      // and raise — for an address an account holds, and never for one it does
      // not, which is the enumeration answer `SEC-R03` forbids.
      await lockAddress(trx, address);

      // DO NOTHING rather than a caught unique violation: the conflict is an
      // ordinary answer to an ordinary request, and reading it from a returned
      // row keeps this free of a driver-specific error code. DO UPDATE would be
      // worse than either — it would let an invitation overwrite the name and
      // role of an account that already exists.
      //
      // The address is normalised first, because `citext` folds case and keeps
      // whitespace: a pasted `" Zz@x.test\n"` would miss the unique index the
      // same person already occupies and create a second account.
      const created = await trx
        .insertInto('accounts')
        .values({ email: address, name: account.name, role: account.role })
        .onConflict((oc) => oc.column('email').doNothing())
        .returning('id')
        .executeTakeFirst();

      if (created === undefined) {
        throw new EmailTakenError();
      }

      const token = await issueTokenIn(trx, created.id, INVITATION_TTL_SECONDS);

      await recordAudit(trx, {
        actorId: invitedBy,
        action: 'account.create',
        subjectType: 'account',
        subjectId: created.id,
      });

      return { accountId: created.id, token };
    });

  // Deferred: AUTH-003/T3 — send the link to the invitee, in their locale, when
  // `mail.available`. It waits on the `Mailer` port (`MAIL-001/T1`), which is
  // the one place an SMTP connection is opened; writing a second sender here
  // would be a second transport to secure and to keep in step. Unblocks when:
  // AUTH-003/T3. Next action: call the port with this link and the invitee's
  // locale, and leave the link returned so the degraded path still has one.
  // Until then delivery is the admin's in both branches, which is what the
  // returned link is for — incomplete, and honest about it rather than a call
  // that goes nowhere.
  return {
    accountId: invited.accountId,
    link: inviteLink(invited.token),
    deliverByHand: mail.available ? NO_SEND_YET : mail.unavailable,
  };
}

/**
 * Issue a fresh invitation for somebody who has not accepted theirs, and hand
 * back the link (`ADMIN-001/T2`). Returns `null` when the account is not waiting
 * on an invitation, in which case no token is minted and the one it holds — if any
 * — is left alone.
 *
 * Narrowed to `invited`, which is stricter than `issueTokenIn`'s own refusal of a
 * suspended account, and the narrowing is the whole of why this is a function
 * rather than a call to `issueToken`. An invitation link sets a password, so
 * issuing one for an `active` account would hand an admin the way into a person's
 * account that `ADMIN-001` §3 refuses them: an admin who could set a password
 * could sign in as that person, and the trail would say the person did it. An
 * account that has not accepted has no password to take over, which is why
 * creation may hand its link to an admin and a resend may do no more than repeat
 * that.
 *
 * The account row is locked while the state is read, so a resend and an
 * acceptance racing each other serialise: either the acceptance commits first and
 * this finds an `active` account and mints nothing, or this mints first and the
 * link it replaced is the one that stops working.
 *
 * What comes back is `inviteAccount`'s value and the delivery sentence with it —
 * the token is in this answer and in no row, so the admin delivers it or nobody
 * does (`AUTH-003/T7`).
 */
export async function resendInvitation(accountId: string): Promise<Invitation | null> {
  const token = await getDb()
    .transaction()
    .execute(async (trx) => {
      const invited = await trx
        .selectFrom('accounts')
        .select('id')
        .where('id', '=', accountId)
        .where('state', '=', 'invited')
        .forUpdate()
        .executeTakeFirst();

      if (invited === undefined) {
        return null;
      }

      return issueTokenIn(trx, accountId, INVITATION_TTL_SECONDS);
    });

  if (token === null) {
    return null;
  }

  const { mail } = getConfig();

  return {
    accountId,
    link: inviteLink(token),
    deliverByHand: mail.available ? NO_SEND_YET : mail.unavailable,
  };
}

/**
 * Ask for a password reset. Answers the same for an address an account holds
 * and one it does not (`SEC-R03`).
 *
 * The identical answer is a property of the code's shape rather than of two
 * branches kept in step: there is no branch. Every statement below is keyed by
 * the address, so the same round trips run in the same order whatever the
 * address is, and each simply matches nothing when no account holds it. The
 * token is minted and hashed before any of them, so the CSPRNG read and the
 * SHA-256 are paid for either way. There is no early return to add later, which
 * is the failure this shape is chosen to make unavailable — the reset form is
 * where an address list gets confirmed, because the sign-in form gets the
 * attention.
 *
 * The lock is the address's rather than the account's, and that is what keeps
 * the answer identical under load rather than only in a single request: a row
 * lock exists only where a row does, so concurrent requests for a known address
 * would serialise while requests for an unknown one would not, and the ratio
 * between them would grow with every extra client until it could be read from
 * the outside.
 *
 * What remains unequal is what the database writes: one row in one case and
 * none in the other, so the commit that follows flushes a little more. That is
 * why the design's bar is the same timing *envelope* rather than constant time,
 * and why the request is rate-limited per account and per address (`SEC-001`) —
 * a difference too small to read in one request must also be too expensive to
 * average over many.
 *
 * Nothing is returned. A token in the answer would be a self-service reset for
 * anybody who knows an address; even a boolean would be the oracle itself.
 */
export async function requestReset(email: string): Promise<void> {
  const address = normaliseAddress(email);

  // Refused before the address is used for anything, and refused for its length
  // alone — which the requester already knows and which says nothing about any
  // account. An address this long is not one: `AUTH-001` turns the same length
  // away at the door, so no account that could ever sign in holds it.
  if (address.length === 0 || address.length > MAX_EMAIL_LENGTH) {
    return;
  }

  const tokenHash = hashOf(randomBytes(TOKEN_BYTES).toString('base64url'));

  await getDb()
    .transaction()
    .execute(async (trx) => {
      await lockAddress(trx, address);

      await trx
        .deleteFrom('invitations')
        .where(
          'account_id',
          'in',
          trx
            .selectFrom('accounts')
            .select('id')
            .where('email', '=', address)
            .where('state', '=', 'active'),
        )
        .where('consumed_at', 'is', null)
        .execute();

      // INSERT ... SELECT rather than VALUES, so the statement itself decides
      // whether there is a row to write. A lookup followed by a conditional
      // insert would put the existence test in this process, where it becomes a
      // branch, and a branch is what a timing measurement reads.
      //
      // Safe default for decisions-log.md#AUTH-DEC-04 — an invited account's
      // invitation is not destroyed by a reset request. Both statements are
      // narrowed to an `active` account, so for an account still holding an
      // invitation, or a suspended one, this writes nothing and deletes
      // nothing: an unauthenticated request cannot destroy a link somebody is
      // waiting on, and cannot be told that it failed to. The narrowing is in
      // SQL and keyed by the address, so it matches nothing for a non-active
      // account exactly as it matches nothing for an address no account holds.
      await trx
        .insertInto('invitations')
        .columns(['account_id', 'token_hash', 'expires_at'])
        .expression((eb) =>
          eb
            .selectFrom('accounts')
            .select((inner) => [
              'accounts.id',
              inner.val(tokenHash).as('token_hash'),
              expiresIn(RESET_TTL_SECONDS).as('expires_at'),
            ])
            .where('email', '=', address)
            .where('state', '=', 'active'),
        )
        .execute();
    });

  // Deferred: AUTH-003/T3 — mail the reset link to the address when a row was
  // written, which is the one difference the design allows between the two
  // answers because it reaches an inbox the requester may not control. It waits
  // on the `Mailer` port (`MAIL-001/T1`). Unblocks when: AUTH-003/T3. Next
  // action: have the insert return the row it wrote and hand that link to the
  // port. Until then a reset request records a token nobody is told about, so
  // the address is neither confirmed nor reachable — incomplete on delivery,
  // and never a difference the requester can read.
}
