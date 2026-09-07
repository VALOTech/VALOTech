/**
 * The token an invitation and a password reset are both carried by
 * (`AUTH-003`).
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
 */

import { createHash, randomBytes } from 'node:crypto';

import { sql } from 'kysely';

import { getDb } from '../db/index';

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
 * The expiry is computed by the database rather than by this process, because
 * the predicate that later admits the token reads the database's clock. Taking
 * the value from one clock and the comparison from another would make a skewed
 * process issue tokens that live longer or shorter than the constant says, and
 * the skew would be invisible from either side.
 */
export async function issueToken(accountId: string, ttlSeconds: number): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  await getDb()
    .transaction()
    .execute(async (trx) => {
      // The lock the "never two live tokens" invariant depends on: it serialises
      // concurrent issues for this account so the delete below sees a committed
      // predecessor rather than racing it.
      await trx.selectFrom('accounts').select('id').where('id', '=', accountId).forUpdate().execute();

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
          expires_at: sql<Date>`now() + make_interval(secs => cast(${ttlSeconds} as int))`,
        })
        .execute();
    });

  return token;
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
