'use client';

/**
 * The composer, the audience, and the one control that cannot be undone
 * (`MAIL-001/T4`, `MAIL-001/T7`).
 *
 * **The preview is the message, not a rendering of it.** `compose` is the same
 * function the send calls, over the same source: the body the author wrote and
 * the unsubscribe line every investor message carries (`MAIL-002/T2`). So what
 * is shown below is what leaves, down to the one thing that cannot be the same
 * for everybody — the link in that line names the recipient, and the preview
 * stands a phrase in for the token so an admin is not handed one person's link
 * to press. The plain-text half appears as an author wrote it, which is what a
 * corporate mail client shows, and the HTML half as its source, so an admin can
 * see that nothing was invented around their words. Painting that HTML into this
 * page instead would be the only place in the console that writes markup it did
 * not author, and the escaping it would be trusting is the very thing the
 * preview exists to let somebody check.
 *
 * **The sender is named on the send panel, because that mailbox is where bounces
 * arrive.** SMTP answers once at hand-off and reports nothing afterwards, so a
 * message that fails later is a notice in `MAIL_FROM` that no code reads
 * (`MAIL-002` §3). Saying so is what makes the absence of bounce handling a
 * thing an admin knows to compensate for rather than a silence they mistake for
 * success.
 *
 * **The count is typed, and nothing fills it in.** The field starts empty and is
 * compared against the number of people ticked; the server compares its own
 * against the audience as it re-resolves it. A pre-filled number would be a
 * button with an extra step, and the step is the point — the number has to be
 * read off the screen and written by hand, which is where somebody notices it is
 * not the number they meant.
 *
 * **The send control carries its reason when it is withheld.** With no
 * credential, or with sending turned off, it is disabled and the sentence saying
 * why is beside it and named by it, so the reason reaches a screen reader as part
 * of the control rather than as a paragraph somewhere on the page (`A11Y-R01`,
 * `A11Y-R02`). Everything else on this screen still works.
 *
 * **A `250` is not delivery.** What comes back is that the company's own mail
 * server accepted the message; what happens after that is invisible to this
 * system, so the outcome says *accepted* and never *sent*. The word people read
 * as a guarantee is the one this carrier cannot give.
 */

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { compose } from '../../../mail/mailer';

import styles from './mail.module.css';

/** One person the send may reach, as this screen needs them: a name and an id. */
export interface ComposerRecipient {
  readonly id: string;
  readonly name: string;
}

/** One account the send will not reach, and why (`MAIL-001/T3`). */
export interface ComposerExclusion extends ComposerRecipient {
  readonly reason: 'suspended' | 'unsubscribed';
}

/** What the outcome of one hand-off looked like, keyed by account. */
interface Outcome {
  readonly accepted: readonly string[];
  /** Failures another retry claimed first: nothing was attempted for these. */
  readonly alreadyRetried?: readonly string[];
  readonly failed: readonly {
    readonly accountId: string;
    /** The `mail_log` row this refusal is recorded in — what a retry names. */
    readonly logId: string;
    readonly error: string;
  }[];
}

const LAPSED = 'Your session has ended. Open the page again to sign in.';
const FAILED = 'Nothing was sent. Try again in a moment.';

const WHY_EXCLUDED: Readonly<Record<ComposerExclusion['reason'], string>> = {
  suspended: 'Suspended — this account has no access.',
  unsubscribed: 'Unsubscribed — they asked not to receive investor mail.',
};

/** What a refusal from the send means, in the words an admin can act on. */
function refusalText(status: number, body: unknown): string {
  const answer = (body ?? {}) as {
    error?: unknown;
    detail?: unknown;
    count?: unknown;
    excluded?: unknown;
    missing?: unknown;
    spent?: unknown;
  };

  if (answer.error === 'mail_unavailable') {
    return typeof answer.detail === 'string' ? answer.detail : FAILED;
  }

  if (answer.error === 'audience_changed') {
    const excluded = Array.isArray(answer.excluded) ? answer.excluded.length : 0;
    const missing = Array.isArray(answer.missing) ? answer.missing.length : 0;
    // `spent` arrives only from a retry, and it is the likeliest refusal on that
    // surface -- the same failures named twice, usually by pressing the control
    // twice. Counting only the other two would read `0 of the people`, which is
    // an admin told the audience changed and that nobody changed.
    const spent = Array.isArray(answer.spent) ? answer.spent.length : 0;

    if (spent > 0 && excluded + missing === 0) {
      return `${spent} of those failures had already been retried, so nothing was sent a second time. Reload the page to see where they stand.`;
    }

    return `The audience changed while this was open: ${excluded + missing + spent} of the people selected can no longer be reached. Nothing was sent. Reload the page and choose again.`;
  }

  if (answer.error === 'count_mismatch') {
    const count = typeof answer.count === 'number' ? answer.count : null;
    return count === null
      ? 'The number typed did not match the audience. Nothing was sent.'
      : `The number typed did not match the audience, which is now ${count}. Nothing was sent. Reload the page and check who is selected.`;
  }

  return status === 400 ? 'The message or the selection was refused. Nothing was sent.' : FAILED;
}

export function MailComposer({
  recipients,
  excluded,
  unavailable,
  sender,
  unsubscribeNotice,
}: {
  readonly recipients: readonly ComposerRecipient[];
  readonly excluded: readonly ComposerExclusion[];
  /** The reason a send cannot happen, or `null` when it can (`MAIL-001/T7`). */
  readonly unavailable: string | null;
  /** The `MAIL_FROM` mailbox, or `null` when no credential names one. */
  readonly sender: string | null;
  /** The unsubscribe line every recipient receives, with their token stood in for. */
  readonly unsubscribeNotice: string;
}): ReactElement {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [typedCount, setTypedCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [typedRetryCount, setTypedRetryCount] = useState('');

  // Composed from the body *and* the unsubscribe line, because that is what the
  // send composes: `deliverQueued` appends the recipient's own link before the
  // hand-off, so a preview of the body alone would be a preview of something
  // shorter than what leaves (`MAIL-002/T2`).
  const message = useMemo(
    () => compose(subject, body === '' ? '' : `${body}\n\n${unsubscribeNotice}`),
    [subject, body, unsubscribeNotice],
  );
  const nameOf = useMemo(
    () => new Map(recipients.map((recipient) => [recipient.id, recipient.name])),
    [recipients],
  );

  const count = selected.length;
  const countMatches = typedCount.trim() !== '' && Number(typedCount) === count;
  const composed = subject.trim() !== '' && body.trim() !== '';
  const ready = unavailable === null && composed && count > 0 && countMatches && !busy && outcome === null;

  function toggle(id: string): void {
    setRefused(null);
    setTypedCount('');
    setSelected((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );
  }

  async function post(payload: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setRefused(null);

    try {
      const response = await fetch('/admin/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, subject, body }),
      });

      if (response.redirected) {
        setRefused(LAPSED);
        return;
      }

      const answer: unknown = await response.json().catch(() => null);

      if (response.status === 200) {
        // The latest attempt replaces the previous one rather than merging with
        // it. Merging would need a rule for what an id accepted in one attempt
        // and refused in another means, and there is no such rule — each attempt
        // is its own set of rows and its own answer.
        setOutcome(answer as Outcome);
        setTypedRetryCount('');
        return;
      }

      setRefused(refusalText(response.status, answer));
    } catch {
      setRefused(FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function sendNow(): Promise<void> {
    await post({ recipients: selected, confirmCount: Number(typedCount) });
  }

  /**
   * Try the refusals again, and nobody else. The ids are the `mail_log` rows the
   * last attempt refused, so the request names failures rather than people: the
   * database claims each one before a message leaves and will not let a claimed
   * failure be claimed twice, which is what makes pressing this twice send once.
   */
  async function retryFailed(failed: Outcome['failed']): Promise<void> {
    await post({ retryOf: failed.map((failure) => failure.logId), confirmCount: Number(typedRetryCount) });
  }

  return (
    <div className={styles.composer}>
      <section className={styles.panel} aria-labelledby="message-heading">
        <h2 id="message-heading">The message</h2>

        <p className={styles.quiet}>
          Written once, in one language. Investor mail is not translated: it is a message from a person to
          named people.
        </p>

        <label className={styles.field} htmlFor="mail-subject">
          Subject
        </label>
        <input
          id="mail-subject"
          className={styles.input}
          type="text"
          maxLength={200}
          value={subject}
          disabled={outcome !== null}
          onChange={(event) => setSubject(event.target.value)}
        />

        <label className={styles.field} htmlFor="mail-body">
          Message
        </label>
        <textarea
          id="mail-body"
          className={styles.textarea}
          rows={12}
          value={body}
          disabled={outcome !== null}
          onChange={(event) => setBody(event.target.value)}
        />

        <h3 className={styles.subhead}>What will be sent</h3>
        <p className={styles.quiet}>
          These are the exact bytes the send uses — the same rendering, not an approximation of it.
          The unsubscribe line goes on every investor message; each person receives it with a link of
          their own, which is the one thing below that differs between them.
        </p>
        <pre className={styles.preview}>{message.text === '' ? 'Nothing written yet.' : message.text}</pre>
        <details className={styles.details}>
          <summary>The HTML half</summary>
          <pre className={styles.preview}>{message.html === '' ? 'Nothing written yet.' : message.html}</pre>
        </details>
      </section>

      <section className={styles.panel} aria-labelledby="audience-heading">
        <h2 id="audience-heading">Who it goes to</h2>

        {recipients.length === 0 ? (
          <p className={styles.quiet}>There is nobody this message could reach.</p>
        ) : (
          <ul className={styles.people}>
            {recipients.map((recipient) => (
              <li key={recipient.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(recipient.id)}
                    disabled={outcome !== null}
                    onChange={() => toggle(recipient.id)}
                  />{' '}
                  {recipient.name}
                </label>
              </li>
            ))}
          </ul>
        )}

        {excluded.length === 0 ? null : (
          <>
            <h3 className={styles.subhead}>Not reachable</h3>
            <ul className={styles.people}>
              {excluded.map((account) => (
                <li key={account.id} className={styles.quiet}>
                  {account.name} — {WHY_EXCLUDED[account.reason]}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="send-heading">
        <h2 id="send-heading">Send</h2>

        {sender === null ? null : (
          <p className={styles.quiet}>
            Sent from <strong>{sender}</strong>, which is also where bounces arrive. The mail server
            answers once, when it takes each message; anything that fails afterwards comes back to
            that mailbox as a notice, and nothing here reads it. Somebody has to open it. When a
            notice says an address is dead, stop investor mail to that person from their account
            page.
          </p>
        )}

        {outcome === null ? (
          <>
            <p className={styles.count}>
              This message will go to <strong>{count}</strong> {count === 1 ? 'person' : 'people'}.
            </p>

            <label className={styles.field} htmlFor="mail-confirm">
              Type that number to confirm
            </label>
            <input
              id="mail-confirm"
              className={styles.confirm}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={typedCount}
              onChange={(event) => setTypedCount(event.target.value)}
            />

            <div className={styles.row}>
              <button
                type="button"
                className={styles.primary}
                disabled={!ready}
                aria-describedby={unavailable === null ? undefined : 'send-unavailable'}
                onClick={() => void sendNow()}
              >
                {busy ? 'Sending…' : `Send to ${count} ${count === 1 ? 'person' : 'people'}`}
              </button>
            </div>

            {unavailable === null ? null : (
              <p id="send-unavailable" className={styles.refused}>
                {unavailable}
              </p>
            )}
          </>
        ) : (
          <div role="status">
            <p className={styles.done}>
              Accepted for delivery by the mail server in this attempt:{' '}
              <strong>{outcome.accepted.length}</strong>. That is what the server answered when it took
              each message; it is not confirmation that anything arrived.
            </p>
            {outcome.failed.length === 0 ? null : (
              <>
                <h3 className={styles.subhead}>Not accepted</h3>
                <ul className={styles.people}>
                  {outcome.failed.map((failure) => (
                    <li key={failure.logId}>
                      {nameOf.get(failure.accountId) ?? failure.accountId} — {failure.error}
                    </li>
                  ))}
                </ul>
                <p className={styles.quiet}>
                  A retry goes to these {outcome.failed.length} and to nobody else. Each refusal is
                  claimed before anything leaves, so nobody who was already accepted can be reached a
                  second time — including if this is pressed twice.
                </p>
                <label className={styles.field} htmlFor="retry-count">
                  <span>Type {outcome.failed.length} to retry</span>
                  <input
                    id="retry-count"
                    className={styles.confirm}
                    type="text"
                    inputMode="numeric"
                    value={typedRetryCount}
                    onChange={(event) => setTypedRetryCount(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy || Number(typedRetryCount) !== outcome.failed.length || typedRetryCount.trim() === ''}
                  onClick={() => void retryFailed(outcome.failed)}
                >
                  Retry the ones that failed
                </button>
              </>
            )}
            {outcome.alreadyRetried === undefined || outcome.alreadyRetried.length === 0 ? null : (
              <p className={styles.quiet} role="status">
                {outcome.alreadyRetried.length} of the failures named had already been retried by somebody
                else, so nothing was attempted for them. They are neither above nor below.
              </p>
            )}
            <p className={styles.quiet}>Reload the page to write another message.</p>
          </div>
        )}

        {refused === null ? null : (
          <p className={styles.refused} role="alert">
            {refused}
          </p>
        )}
      </section>
    </div>
  );
}
