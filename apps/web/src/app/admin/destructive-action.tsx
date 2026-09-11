'use client';

/**
 * The one control every destructive act in the console is reached through
 * (`ADMIN-002/T3`).
 *
 * It is a disclosure rather than a button that acts: pressing it opens a
 * confirmation that **names the subject** — "Suspend Ada Lovelace?" rather than
 * "Are you sure?" — states what the act does, and says in words whether anything
 * undoes it. For an act nothing undoes, the confirm button stays off until the
 * subject's name has been typed, so the person confirming has read which subject
 * they are confirming against.
 *
 * The act itself is the caller's: this component decides only that it was
 * confirmed, and hands back what was typed so the caller can have the act's own
 * surface check it as well. A button that stays off is a courtesy to the person
 * confirming and never a control — whatever a caller posts is whatever any caller
 * could post — so the name travels rather than being consumed here. Nothing in
 * this file knows what suspending means, which is what keeps one confirmation in
 * front of every such act rather than one per surface.
 *
 * `details` carries what only the caller can know. The consequence comes from the
 * registry and is true of every subject; a caller with something particular to add
 * — how many rows this one subject would take with it — puts it in the panel
 * between that sentence and the line about undoing the act, so the general
 * statement is read first, the particular one second, and the finality last.
 *
 * Keyboard and colour (`A11Y-R01`, `A11Y-R02`, `A11Y-R03`). The trigger is a real
 * button carrying `aria-expanded`; opening moves focus into the confirmation — to
 * the name field when there is one, otherwise to its heading — and `Escape`
 * closes it and returns focus to the trigger, so the panel can be entered and
 * left without a pointer. The key is handled on the wrapper rather than on the
 * panel, because focus can be on the trigger while the panel is open and a
 * handler bound to the panel would not see the keystroke there. The trigger stays
 * mounted while the panel is open for that return to land somewhere. Red never
 * carries the meaning on its own: the verb is on the control, the consequence is a
 * sentence, and whether the act can be undone is written out rather than implied
 * by the shade.
 *
 * A disabled confirm button says why it is off in a standing line rather than on
 * a hover or after a failed press, because a control that is off for an unstated
 * reason reads as a broken page. Both reasons are stated, and each is tied to the
 * button by `aria-describedby`: a name not yet typed, and another act on the page
 * still running.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react';

import {
  DESTRUCTIVE_ACTIONS,
  type DestructiveActionId,
  requiresTypedName,
  typedNameMatches,
} from './destructive-actions';
import styles from './destructive-action.module.css';

export function DestructiveAction({
  action,
  subject,
  onConfirm,
  details,
  disabled = false,
}: {
  readonly action: DestructiveActionId;
  /** The thing being acted on, by the name the person reading the page sees. */
  readonly subject: string;
  /**
   * What was typed, for an act that asked for the name; the empty string for one
   * that did not.
   */
  readonly onConfirm: (typedName: string) => void;
  /** What this one subject would cost, beside the consequence every subject shares. */
  readonly details?: ReactNode;
  readonly disabled?: boolean;
}): ReactElement {
  const { verb, consequence, reversal } = DESTRUCTIVE_ACTIONS[action];
  const typedRequired = requiresTypedName(action);

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLParagraphElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const base = useId();
  const panelId = `${base}-panel`;
  const headingId = `${base}-heading`;
  const consequenceId = `${base}-consequence`;
  const detailsId = `${base}-details`;
  const hintId = `${base}-hint`;
  const waitingId = `${base}-waiting`;
  const fieldId = `${base}-name`;

  // Everything the confirm button is described by, in reading order. The
  // particulars belong to the description rather than to the panel alone: this is
  // the moment of commitment, and a reader who tabbed straight to the button would
  // otherwise hear the general consequence and not this subject's cost.
  const describedBy = [
    consequenceId,
    details === undefined ? null : detailsId,
    disabled ? waitingId : null,
  ]
    .filter((id): id is string => id !== null)
    .join(' ');

  const ready = (!typedRequired || typedNameMatches(typed, subject)) && !disabled;

  // An open panel keeps its trigger live whatever else the page is doing: the
  // trigger is where Escape and Cancel put focus back, and a disabled button
  // cannot take it.
  const triggerDisabled = disabled && !open;

  // Focus into the confirmation once it has rendered: the name field when the act
  // demands one, otherwise the heading that names the subject, so a keyboard
  // reader lands on what they are confirming rather than after it.
  useEffect(() => {
    if (!open) {
      return;
    }
    (field.current ?? heading.current)?.focus();
  }, [open]);

  function close(): void {
    setOpen(false);
    setTyped('');
    trigger.current?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    // Handled here rather than on the panel: focus is on the trigger for the whole
    // keyboard path that opens it, and a handler bound to the panel would never see
    // the keystroke that is most likely to arrive.
    if (open && event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  function confirm(): void {
    // Read before closing, which clears it.
    const typedName = typed;

    // Closed the same way a cancel closes it, so focus lands back on the trigger
    // rather than on the body when the panel that held it goes.
    close();
    onConfirm(typedName);
  }

  return (
    <div className={styles.destructive} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={trigger}
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={triggerDisabled}
        onClick={() => {
          setTyped('');
          setOpen(!open);
        }}
      >
        {verb}…
      </button>

      {open ? (
        <div id={panelId} className={styles.panel} role="group" aria-labelledby={headingId}>
          <p className={styles.heading} id={headingId} tabIndex={-1} ref={heading}>
            {verb} {subject}?
          </p>
          <p className={styles.consequence} id={consequenceId}>
            {consequence}
          </p>
          {details === undefined ? null : (
            <div className={styles.details} id={detailsId}>
              {details}
            </div>
          )}
          <p className={styles.reversal}>
            {reversal.kind === 'final' ? 'This cannot be undone.' : reversal.undo}
          </p>

          {typedRequired ? (
            <>
              <label className={styles.fieldLabel} htmlFor={fieldId}>
                Type <strong>{subject}</strong> to confirm
              </label>
              <input
                id={fieldId}
                ref={field}
                className={styles.field}
                type="text"
                value={typed}
                autoComplete="off"
                aria-describedby={hintId}
                onChange={(event) => setTyped(event.target.value)}
              />
              <p className={styles.hint} id={hintId}>
                {verb} turns on when what you type is the name exactly.
              </p>
            </>
          ) : null}

          {disabled ? (
            <p className={styles.hint} id={waitingId}>
              Another act on this page is still running, so {verb} is off until it finishes.
            </p>
          ) : null}

          <div className={styles.controls}>
            <button
              type="button"
              className={styles.confirm}
              disabled={!ready}
              aria-describedby={describedBy}
              onClick={confirm}
            >
              {verb} {subject}
            </button>
            <button type="button" className={styles.cancel} onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
