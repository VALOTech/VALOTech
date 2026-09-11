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
  /** A resent invitation's single-use link, which exists in this answer and in no row. */
  readonly link?: string;
  /** Why that link has to be delivered by hand. */
  readonly deliverByHand?: string;
}
