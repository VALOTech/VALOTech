/**
 * What a self-service act on the account page tells the reader afterwards, and
 * how it gets back to them ([`ADMIN-DEC-06`](../../../../../../docs/decisions-log.md#ADMIN-DEC-06)).
 *
 * The three controls are plain forms posting to routes, because the page carries
 * no client script and a control that needs a bundle fails closed on the day the
 * bundle does not load. A form post therefore answers with post-redirect-get,
 * and the outcome has to survive one redirect. The mail preference needs no such
 * carriage — the page re-reads the row and says what is now true — but a password
 * refused and an address another account holds leave no row to read, so the
 * answer travels in the query string.
 *
 * **The vocabulary is closed, and the page renders nothing for a value outside
 * it.** A query parameter is whatever the address bar holds, so the page reads it
 * through `accountOutcomeOf` and drops anything it does not recognise: a crafted
 * link can select one of these sentences and can never inject a string, so no
 * raw key and no attacker's words reach the screen (`I18N-R04`).
 *
 * What a crafted link *can* do is show a reader a sentence about an act that did
 * not happen, and that is worth stating rather than leaving implied. The
 * direction it fails in is the safe one: every sentence here describes something
 * the reader would have asked for, so one arriving unasked reads as alarming and
 * not as reassuring. Nothing here grants anything, and nothing here is the
 * evidence an act took place — the sessions list, the name on the page and the
 * mail row are, and they are read from the database on every render.
 */

/**
 * Every answer the three acts can hand back. Password refusals are one value and
 * not three, because a wrong current password, an account holding none, and a
 * row that moved under the write all mean the same thing to the person typing.
 */
export const ACCOUNT_OUTCOMES = [
  'password-changed',
  'password-refused',
  'password-too-short',
  'password-too-long',
  'password-too-common',
  'password-too-many',
  'identity-changed',
  'identity-changed-invitation-ended',
  'identity-unchanged',
  'identity-name-needed',
  'identity-email-invalid',
  'identity-email-unavailable',
  'identity-too-many',
  'delete-name-mismatch',
  'delete-last-admin',
] as const;

export type AccountOutcome = (typeof ACCOUNT_OUTCOMES)[number];

/** The page the three acts post from and return to. */
export const ACCOUNT_PAGE = '/hall/account';

/** The query parameter the answer travels in. */
export const OUTCOME_PARAM = 'outcome';

/** The outcome a query parameter names, or `null` for anything else. */
export function accountOutcomeOf(value: unknown): AccountOutcome | null {
  return typeof value === 'string' && (ACCOUNT_OUTCOMES as readonly string[]).includes(value)
    ? (value as AccountOutcome)
    : null;
}

/**
 * The redirect an act answers with: back to the page, carrying what happened.
 *
 * `303 See Other` rather than `302`, so the browser fetches the page with `GET`
 * whatever the original method was (RFC 9110 §15.4.4) and a refresh re-reads
 * rather than re-posting. `Location` is a relative reference, which the
 * specification permits (RFC 9110 §10.2.2) and which cannot send a reader to
 * another host when a deployment's origin is set wrongly.
 */
export function backToAccount(outcome: AccountOutcome): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: `${ACCOUNT_PAGE}?${OUTCOME_PARAM}=${outcome}` },
  });
}
