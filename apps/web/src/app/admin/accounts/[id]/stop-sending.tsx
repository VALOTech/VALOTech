'use client';

/**
 * The control that stops investor mail to one person, and records why
 * (`MAIL-002/T4`).
 *
 * A form rather than a button, because the reason is the point. SMTP reports no
 * bounce: a message that fails after hand-off becomes a notice in the
 * `MAIL_FROM` mailbox that nothing here reads, so an admin who finds one sets
 * this by hand, and the sentence they type is the only record of why an address
 * stopped being written to. A stop with no reason would be one nobody can undo
 * with confidence a year later.
 *
 * **It is offered only while mail is reaching the person.** Once the list holds
 * them the control is replaced by what the list says — when it was set, and by
 * whom — because a second press would change nothing and a control that changes
 * nothing is worse than none.
 *
 * **Nothing here starts investor mail again**, and that is the trail's
 * vocabulary rather than a control somebody forgot: `AUDIT_ACTIONS` is closed
 * and enforced by the database, its one mail-preference act is the stop, and an
 * admin resuming somebody else's mail is a privileged write `SEC-R04` requires
 * the trail to hold (`MAIL-DEC-06`). The person can start it again themselves
 * from their own account page, which is their own inbox and not a privileged
 * write — so this is a stop an admin cannot take back, and the sentence beside
 * it says so before the press.
 *
 * English console chrome (`ADMIN-002/T5`), like the rest of the admin surface.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type { StopSendingAnswer } from './account-actions';
import styles from './person.module.css';

/** What the act reported, and whether it is news about it or a failure of it. */
interface Reported {
  readonly failed: boolean;
  readonly text: string;
}

/** The list's own record of this person, as the page read it. */
export interface MailStopped {
  /** When the list took them, already rendered as the UTC instant the page shows. */
  readonly at: string;
  /** Which door set it: the person's own, or an admin's. */
  readonly source: 'link' | 'admin';
}

/** What the list holds, in the words an admin reads it for. */
function heldSentence(stopped: MailStopped): string {
  const who =
    stopped.source === 'admin'
      ? 'An admin stopped it'
      : 'They stopped it themselves, by the link in a message or from their account page';

  return `Investor mail is stopped for this person. ${who}, on ${stopped.at}. They can start it again from their own account page; nothing here can.`;
}

export function StopSending({
  accountId,
  stopped,
}: {
  readonly accountId: string;
  /** The list's record of this person, or `null` when mail is reaching them. */
  readonly stopped: MailStopped | null;
}): ReactElement {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState<Reported | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setReported(null);

    try {
      const response = await fetch(`/admin/accounts/${accountId}/mail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      if (response.redirected) {
        setReported({ failed: true, text: 'Your session has ended. Open the page again to sign in.' });
      } else if (response.status === 200) {
        const answer = (await response.json()) as StopSendingAnswer;
        setReported({
          failed: false,
          text:
            answer.outcome === 'changed'
              ? 'Investor mail to this person is stopped. Transactional messages — an invitation, a password reset — still reach them.'
              : 'Nothing changed: this person was already on the list, and the reason recorded there is the one set first.',
        });
        // The section above is the server's read: re-render so the page says
        // what the list now holds rather than what it held on load.
        router.refresh();
      } else if (response.status === 400) {
        const body = (await response.json()) as { error?: string };
        setReported({
          failed: true,
          text:
            body.error === 'invalid_reason'
              ? 'A reason is needed, and it has to fit in 500 characters. Nothing was stopped.'
              : 'The request could not be read as written. Nothing was stopped.',
        });
      } else if (response.status >= 500) {
        // A server failure is not a refusal, and saying which it was would be a
        // guess: the row and its audit row are one transaction, so it most likely
        // wrote nothing — but this surface cannot see that, and the page can.
        setReported({
          failed: true,
          text: `Investor mail was not stopped (status ${response.status}) — the server failed rather than refusing. Re-read the page to see where things stand.`,
        });
      } else {
        setReported({ failed: true, text: `The act was refused (status ${response.status}).` });
      }
    } catch {
      setReported({ failed: true, text: 'The act could not be sent — the network request failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {stopped === null ? (
        <form className={styles.correction} onSubmit={(event) => void submit(event)}>
          <label className={styles.field}>
            <span>Why investor mail should stop</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={500}
              autoComplete="off"
            />
          </label>
          <p className={styles.note}>
            Use this when a bounce notice for this person arrives in the send mailbox. It stops
            investor mail only — an invitation and a password reset still reach them. Nothing in the
            console starts it again; the person does that from their own account page.
          </p>
          <button type="submit" className={styles.action} disabled={busy}>
            Stop sending investor mail
          </button>
        </form>
      ) : (
        <p className={styles.note}>{heldSentence(stopped)}</p>
      )}

      {/* Mounted from the first render, empty. A live region that appears in the
          same render as its own first text is not reliably read, because what is
          announced is a change within a region that was already there. */}
      <div role="status">
        {reported === null ? null : (
          <p className={reported.failed ? styles.failure : styles.outcome}>{reported.text}</p>
        )}
      </div>
    </>
  );
}
