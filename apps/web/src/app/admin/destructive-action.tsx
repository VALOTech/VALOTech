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
 * confirmed. Nothing here knows what suspending means, which is what keeps one
 * confirmation in front of every such act rather than one per surface.
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
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

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
  disabled = false,
}: {
  readonly action: DestructiveActionId;
  /** The thing being acted on, by the name the person reading the page sees. */
  readonly subject: string;
  readonly onConfirm: () => void;
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
  const hintId = `${base}-hint`;
  const waitingId = `${base}-waiting`;
  const fieldId = `${base}-name`;

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
    // Closed the same way a cancel closes it, so focus lands back on the trigger
    // rather than on the body when the panel that held it goes.
    close();
    onConfirm();
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
              aria-describedby={disabled ? `${consequenceId} ${waitingId}` : consequenceId}
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
