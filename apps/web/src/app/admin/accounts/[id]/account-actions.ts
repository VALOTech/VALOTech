/**
 * What an admin does to a person from their page, as one vocabulary
 * (`ADMIN-001/T2`).
 *
 * The route and the panel that posts to it sit on opposite sides of the
 * server/client boundary, so neither can import the other without dragging it
 * across — a route handler into the browser bundle, or a component's state into
 * the handler. The names they have to agree on live here, where both reach them
 * and a misspelling is a type error rather than a `400` somebody finds by
 * clicking.
 */

import type { CorrectionResult } from '../../../../admin/accounts';

export const ACCOUNT_ACTIONS = [
  'resend-invitation',
  'reset-password',
  'suspend',
  'reinstate',
  'end-sessions',
] as const;

export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];

/** Whether a posted body named one of the acts; anything else is a malformed request. */
export function isAccountAction(value: unknown): value is AccountAction {
  return typeof value === 'string' && (ACCOUNT_ACTIONS as readonly string[]).includes(value);
}

/**
 * What came of an act.
 *
 * `changed` means something was written. `unchanged` means nothing was — which
 * covers an act asking for a state the account already holds and an act the
 * account guards refused, because the services answer both with the same value
 * and a route that invented a reason would be guessing at which (`ADMIN-DEC-01`).
 * `requested` belongs to the password reset alone: that flow reports nothing back
 * by design, so the honest answer is that the request was made and not that a
 * token was written (`SEC-R03`).
 */
export type AccountActionOutcome = 'changed' | 'unchanged' | 'requested';

export interface AccountActionAnswer {
  readonly outcome: AccountActionOutcome;
  /**
   * A resent invitation's single-use link, which exists in this answer and in no
   * row. A reset never carries one: that link sets the password of an active
   * account, and an admin holding it could sign in as its owner (`ADMIN-001` §3).
   */
  readonly link?: string;
  /**
   * What became of the message, in a sentence — for a resend, why its link may
   * still need delivering by hand; for a reset, whether anybody was reached at
   * all, since mail is the only way one can be.
   */
  readonly delivery?: string;
}

/**
 * What came of a delete (`ADMIN-001/T4`).
 *
 * Its own answer rather than the one above, because deletion is not one of the
 * acts that route performs and two of that type's three outcomes are impossible
 * here: there is no `requested`, and no link. `changed` means the row is gone;
 * `unchanged` means a guard refused it and nothing was written (`ADMIN-DEC-01`).
 */
export interface AccountDeleteAnswer {
  readonly outcome: 'changed' | 'unchanged';
}

/**
 * What came of stopping investor mail to somebody (`MAIL-002/T4`).
 *
 * Its own answer rather than the acts' above, because a stop-sending is not one
 * of the five that route performs and none of that type's other fields can occur
 * here: there is no `requested`, no link and no delivery sentence. `changed`
 * means the row was written; `unchanged` means the account was already on the
 * list, in which case nothing was written and nothing recorded — a second stop
 * is not a second act.
 */
export interface StopSendingAnswer {
  readonly outcome: 'changed' | 'unchanged';
}

/**
 * What came of a correction (`ADMIN-001/T10`).
 *
 * The two outcomes a correction can be *answered* with, taken from the four the
 * act itself has: the other two are a refused address and a value the column
 * cannot hold, which the route reports as statuses rather than as outcomes, the
 * way the invite surface reports a taken address. Narrowing the service's own
 * type rather than restating two of its arms is what keeps the wire and the act
 * from drifting — a field added to the changed arm arrives here by itself.
 *
 * The import is a type and is erased, so nothing this file's other side depends
 * on reaches the browser bundle.
 */
export type AccountCorrectionAnswer = Extract<
  CorrectionResult,
  { outcome: 'changed' | 'unchanged' }
>;
