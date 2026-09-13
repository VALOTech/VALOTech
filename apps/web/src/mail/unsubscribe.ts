/**
 * Stopping investor mail, and the token that lets somebody do it without
 * signing in (`MAIL-002/T2`, `MAIL-002/T4`, `DATA-R04`).
 *
 * **The token is derived, not stored.** An invitation's token exists because an
 * admin minted one and a row remembers its hash; an unsubscribe link has no such
 * moment — it is in every bulk message, so it has to be computable at send time
 * for an account that has never unsubscribed and has no row anywhere. So it is
 * the account's id beside an HMAC of that id under `SESSION_SECRET`, the same
 * construction and the same secret the session cookie's signature uses
 * (`AUTH-DEC-02`). Nothing about the id is secret from the person holding the
 * link; what the signature buys is that a value this server did not mint is
 * recognised as one before anything is written.
 *
 * **It is single-purpose because the purpose is inside the hash.** The signed
 * string carries a label no other signer here uses, so a session cookie's
 * signature is not an unsubscribe token and an unsubscribe token is not a
 * session — presenting one where the other is expected fails the comparison
 * rather than being read as the wrong thing. And the only act it admits is the
 * one below: it opens no room, reads no document and names no address.
 *
 * **Rotating `SESSION_SECRET` invalidates every link already in an inbox.** That
 * is the cost of deriving rather than storing, and it is the same lever
 * `CRED-001` describes for signing every session out at once. It is not a dead
 * end: the page says a link that no longer works is one to sign in past, and the
 * preference inside the room writes the same row.
 *
 * The row records the SHA-256 of the token that set it, never the token, for the
 * reason `AUTH-003` records its own the same way — a table holding a presentable
 * credential is one a database read turns into an act. Since the token is
 * derived from the account, the hash stays a working record: it is the same
 * value the account's current link would produce, so a row can be checked
 * against the link it claims.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { recordAudit } from '../audit/record';
import { getConfig } from '../config/index';
import { getDb } from '../db/index';
import type { UnsubscribeSource } from '../db/types';

import { UNSUBSCRIBE_PATH } from './unsubscribe-notice';

/**
 * What separates the account id from its signature. Both halves are drawn from
 * alphabets without it — a uuid is hex and hyphens, a signature is base64url —
 * so the two are always separable.
 */
const SIGNATURE_SEPARATOR = '.';

/**
 * What the signature is over, besides the account. It is what makes the token
 * single-purpose: every other signer under this secret signs a different shape,
 * so a value minted for one of them cannot verify here and this one cannot
 * verify there.
 */
const PURPOSE = 'mail-unsubscribe:';

/**
 * The longest reason an admin may record, long enough for a bounce notice's
 * gist and capped because the column outlives the afternoon it was typed in. An
 * over-long reason is refused rather than cut, the way a setting outside its
 * bounds is (`CFG-001`): a truncated sentence records something nobody wrote.
 */
export const MAX_REASON_LENGTH = 500;

/** The signature for one account under the current `SESSION_SECRET`. */
function signatureOf(accountId: string): string {
  return createHmac('sha256', getConfig().session.secret.value)
    .update(`${PURPOSE}${accountId}`)
    .digest('base64url');
}

/** The one hashing of a token here, so what is written and what is compared cannot drift. */
function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The token that identifies one account for this act and for nothing else. */
export function unsubscribeToken(accountId: string): string {
  return `${accountId}${SIGNATURE_SEPARATOR}${signatureOf(accountId)}`;
}

/** The link a bulk message carries for one recipient. */
export function unsubscribeLink(accountId: string): string {
  return `${getConfig().app.origin}${UNSUBSCRIBE_PATH}/${unsubscribeToken(accountId)}`;
}

/**
 * The account a token names, or `null` when the value carries no signature this
 * server made.
 *
 * The comparison is `timingSafeEqual` for the reason the session cookie's is: a
 * check that returns on the first wrong byte tells a forger how much of their
 * guess is right. Lengths are compared first and may short-circuit — every
 * signature here is the same length, so it is not a secret.
 *
 * A verified id is one this server signed, so it is a uuid by construction and
 * no separate shape check stands between it and the column.
 */
export function accountForUnsubscribeToken(token: string): string | null {
  const separator = token.lastIndexOf(SIGNATURE_SEPARATOR);

  // Nothing at index 0 either: a separator there leaves an empty account id,
  // which is not one this server ever signed.
  if (separator <= 0) {
    return null;
  }

  const accountId = token.slice(0, separator);
  const presented = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signatureOf(accountId));

  if (presented.length !== expected.length) {
    return null;
  }

  return timingSafeEqual(presented, expected) ? accountId : null;
}

/** Whether investor mail is stopped for an account, and how it came to be. */
export type MailPreference =
  | { readonly stopped: false }
  | { readonly stopped: true; readonly at: Date; readonly source: UnsubscribeSource };

/** What an account's preference is now — what the room page and the link page both read. */
export async function investorMailPreference(accountId: string): Promise<MailPreference> {
  const row = await getDb()
    .selectFrom('unsubscribes')
    .select(['at', 'source'])
    .where('account_id', '=', accountId)
    .executeTakeFirst();

  return row === undefined ? { stopped: false } : { stopped: true, at: row.at, source: row.source };
}

/**
 * The account a link names, or `null` — both for a token nobody here signed and
 * for one naming an account that no longer exists.
 *
 * One answer for the two, deliberately. They are different facts and neither is
 * one a holder of the link is owed: a page that distinguished them would confirm
 * that an account exists to anybody who kept an old link after an erasure.
 */
export async function unsubscribeSubject(token: string): Promise<string | null> {
  const accountId = accountForUnsubscribeToken(token);

  if (accountId === null) {
    return null;
  }

  const account = await getDb()
    .selectFrom('accounts')
    .select('id')
    .where('id', '=', accountId)
    .executeTakeFirst();

  return account?.id ?? null;
}

/**
 * Who stopped investor mail for an account.
 *
 * `person` covers both doors somebody uses on their own behalf — the link in a
 * message and the preference in their account page — because the row's `source`
 * records who decided and the token is what identifies them either way: it is
 * presented in the link when they are not signed in, and derived from the
 * account when they are. `admin` is a staff member acting for somebody else,
 * which the schema requires a reason for and this requires an actor for.
 */
export type MailStop =
  | { readonly by: 'person'; readonly accountId: string }
  | {
      readonly by: 'admin';
      readonly accountId: string;
      readonly actorId: string;
      readonly reason: string;
    };

/** A reason that is neither blank nor longer than the column should keep. */
export function reasonIsRecordable(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_REASON_LENGTH;
}

/**
 * Stop investor mail for one account, and record that it happened
 * (`SEC-R04`). Answers whether a row was written — `false` when the account was
 * already on the list, in which case nothing is written and nothing is recorded,
 * because a second press of the same link is not a second act.
 *
 * The row and its audit are one transaction, so a suppression nothing recorded
 * and a record of a suppression that rolled back are both impossible. The
 * conflict is resolved by doing nothing rather than by replacing the row: the
 * first stop is the one that happened, and overwriting its source and its
 * timestamp with a later press would lose which door it came through.
 *
 * The reason an admin gives stays in the row. No action's audit list names a
 * field for it (`SEC-DEC-01`), and admin free text in the seven-year trail is
 * the open question `SEC-DEC-03` holds, so the two-year row is where it lives.
 */
export async function stopInvestorMail(stop: MailStop): Promise<boolean> {
  const values =
    stop.by === 'admin'
      ? {
          account_id: stop.accountId,
          source: 'admin' as const,
          token: null,
          reason: stop.reason.trim(),
        }
      : {
          account_id: stop.accountId,
          source: 'link' as const,
          token: hashOf(unsubscribeToken(stop.accountId)),
          reason: null,
        };

  return getDb()
    .transaction()
    .execute(async (trx) => {
      const written = await trx
        .insertInto('unsubscribes')
        .values(values)
        .onConflict((oc) => oc.column('account_id').doNothing())
        .returning('account_id')
        .executeTakeFirst();

      if (written === undefined) {
        return false;
      }

      await recordAudit(trx, {
        actorId: stop.by === 'admin' ? stop.actorId : stop.accountId,
        action: 'mail.unsubscribe',
        subjectType: 'account',
        subjectId: stop.accountId,
      });

      return true;
    });
}

/**
 * Let investor mail reach an account again, at the request of the person whose
 * account it is. Answers whether a row was removed.
 *
 * Only the person's own doing, and only from inside the room, because the trail
 * has no action that names it: `AUDIT_ACTIONS` is a closed vocabulary the
 * database enforces, and the one mail-preference act in it is the stop. An
 * admin resuming somebody else's mail is a privileged write `SEC-R04` requires
 * the trail to hold, so it is not offered until the trail can hold it
 * (`MAIL-DEC-06`). A person
 * setting their own preference over their own inbox is not a privileged write,
 * so this one records nothing and leaves nothing unrecorded.
 */
export async function resumeInvestorMail(accountId: string): Promise<boolean> {
  const removed = await getDb()
    .deleteFrom('unsubscribes')
    .where('account_id', '=', accountId)
    .returning('account_id')
    .executeTakeFirst();

  return removed !== undefined;
}
