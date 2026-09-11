/**
 * What counts as a destructive action in the console, in one place
 * (`ADMIN-002/T3`).
 *
 * The list lives here rather than at each surface because an ordinary control and
 * a destructive one that look alike is how somebody deletes an account meaning to
 * suspend it. `DestructiveAction` renders from an entry and from nothing else, so
 * a red button cannot be added to the console without its consequence and its
 * reversal being written down here first — which is the property the design asks
 * for, and the reason this is a registry rather than a set of props.
 *
 * **Whether a confirmation demands the subject's name typed is derived from the
 * reversal, not stated beside it.** The three acts nothing undoes — deleting an
 * account, deleting a file, sending mail — are exactly the three that take a
 * typed name, so deriving one from the other leaves no pair to drift apart: an
 * entry cannot be marked final and then quietly skip the typing, and a reversible
 * act cannot acquire the friction reserved for the final ones.
 *
 * The entries for deleting a file (`CMS-003`) and sending mail (`MAIL-001`) are
 * listed before those surfaces exist, because a list that named only what is
 * already built would be silent about two of the three acts the design singles
 * out, and each surface would then arrive deciding its own friction. Suspension
 * (`ADMIN-001/T2`) and deleting an account (`ADMIN-001/T4`) are the entries with
 * callers today, and the second is the first to take a typed name.
 */

/** What undoes an act, or the statement that nothing does. */
export type Reversal =
  | { readonly kind: 'reversible'; readonly undo: string }
  | { readonly kind: 'final' };

/** One destructive act: the word on its control, what it does, and what undoes it. */
export interface DestructiveActionSpec {
  /** A verb, so the control says what it does rather than where it leads. */
  readonly verb: string;
  /** What the act does, stated in the confirmation beside the subject's name. */
  readonly consequence: string;
  readonly reversal: Reversal;
}

export const DESTRUCTIVE_ACTIONS = {
  'account.suspend': {
    verb: 'Suspend',
    consequence:
      'They can no longer sign in, every live session of theirs ends, and an invitation they have not accepted stops working.',
    reversal: { kind: 'reversible', undo: 'Reinstating the account lets them sign in again.' },
  },
  'account.delete': {
    verb: 'Delete',
    consequence:
      'The account is deleted, with the sessions, invitations, deck grants and read records that belong to it.',
    reversal: { kind: 'final' },
  },
  'media.delete': {
    verb: 'Delete',
    consequence: 'The file leaves the library, and anything still pointing at it renders nothing.',
    reversal: { kind: 'final' },
  },
  'mail.send': {
    verb: 'Send',
    consequence: 'The message goes to every recipient it names, and a message that has gone cannot be recalled.',
    reversal: { kind: 'final' },
  },
} as const satisfies Readonly<Record<string, DestructiveActionSpec>>;

/** The key a caller names: an act absent from the registry cannot be rendered at all. */
export type DestructiveActionId = keyof typeof DESTRUCTIVE_ACTIONS;

/**
 * Whether this act's confirmation demands the subject's name typed — true for
 * exactly the acts nothing undoes.
 */
export function requiresTypedName(action: DestructiveActionId): boolean {
  return DESTRUCTIVE_ACTIONS[action].reversal.kind === 'final';
}

/**
 * Whether what somebody typed is the subject's name.
 *
 * Surrounding whitespace is ignored, because a pasted name carries a trailing
 * newline and neither end of the string says anything about which subject was
 * named. Nothing else is forgiven: the letters and their case must match, since
 * the whole point of typing a name shown on the screen is that the person looked
 * at it.
 *
 * An empty subject matches nothing, which is what keeps a missing name from
 * enabling a final act on an empty field — the one way a lenient comparison
 * would fail open rather than closed.
 */
export function typedNameMatches(typed: string, subject: string): boolean {
  const wanted = subject.trim();

  return wanted !== '' && typed.trim() === wanted;
}
