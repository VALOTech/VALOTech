'use client';

/**
 * The controls on a person's page, and what each of them says afterwards
 * (`ADMIN-001/T2`).
 *
 * They are here rather than in the page because an act is a `POST` and a page is a
 * render: the surface has to report what came of a press, and a resent
 * invitation's link has to be somewhere an admin can copy it from. It is not in a
 * query string for the same reason the link is not mailed to anybody — a
 * single-use password link in a URL is one in history, in a proxy log, and in the
 * next screenshot.
 *
 * Which controls appear follows the state, because a control that cannot work is
 * worse than none: an invitation is resent only to somebody who has not accepted,
 * a reset belongs to an account that has a password, and only a suspended account
 * is reinstated. Neither suspending nor deleting is offered on the reader's own
 * page, for the same reason — both are refused for the actor's own account
 * (`ADMIN-DEC-01`). The services refuse every one of those cases anyway
 * (`ADMIN-001`), so this is what an admin is offered and not what is enforced.
 *
 * **Each sentence says exactly what happened**, including when what happened is
 * less than the control's name suggests. Nothing here reports success it cannot
 * see: `unchanged` names the reasons it could be, because the services answer a
 * refusal and a no-op with one value, and a resent link is described as a link
 * nobody has delivered.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { ErasureCounts } from '../../../../admin/accounts';
import type { AccountState } from '../../../../db/types';
import { DestructiveAction } from '../../destructive-action';

import type { AccountAction, AccountActionAnswer, AccountDeleteAnswer } from './account-actions';
import styles from './person.module.css';

/** One act and the answer it came back with, held so the page can report it. */
interface Performed {
  readonly action: AccountAction;
  readonly answer: AccountActionAnswer;
}

interface ActionRunner {
  /** The act in flight, so every control is held while one is running. */
  readonly busy: AccountAction | null;
  readonly performed: Performed | null;
  /** A transport or session failure, which is not an outcome of an act. */
  readonly failure: string | null;
  readonly run: (action: AccountAction) => Promise<void>;
}

function useAccountAction(accountId: string): ActionRunner {
  const router = useRouter();
  const [busy, setBusy] = useState<AccountAction | null>(null);
  const [performed, setPerformed] = useState<Performed | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: AccountAction): Promise<void> {
    setBusy(action);
    setPerformed(null);
    setFailure(null);

    try {
      const response = await fetch(`/admin/accounts/${accountId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (response.redirected) {
        setFailure('Your session has ended. Open the page again to sign in.');
      } else if (response.status === 200) {
        const answer = (await response.json()) as AccountActionAnswer;
        setPerformed({ action, answer });

        if (answer.outcome === 'changed') {
          // The identity, the sessions and the access list are the server's reads:
          // re-render so the page says what is now true rather than what it said
          // when it loaded.
          router.refresh();
        }
      } else if (response.status >= 500) {
        // A server failure is not a refusal, and saying so would be a guess about
        // what happened: every act is one transaction, so it most likely wrote
        // nothing — but this surface cannot see that, and the page can.
        setFailure(
          `The action could not be completed (status ${response.status}) — the server failed rather than refusing it. Re-read the page to see where things stand.`,
        );
      } else {
        setFailure(`The action was refused (status ${response.status}).`);
      }
    } catch {
      setFailure('The action could not be sent — the network request failed.');
    } finally {
      setBusy(null);
    }
  }

  return { busy, performed, failure, run };
}

function said(action: AccountAction, answer: AccountActionAnswer, self: boolean): string {
  const changed = answer.outcome === 'changed';

  switch (action) {
    case 'resend-invitation':
      // Deferred: AUTH-003/T4 — the clause about the link having nowhere to land
      // comes out when the set-password form exists.
      // Why: nothing consumes an invitation token yet, so a link handed over today
      // reaches a page that is not there.
      // Unblocks when: AUTH-003/T4.
      // Next action: drop the clause and say what the link opens instead.
      // Until then the admin is told before they send it rather than after the
      // investor tells them — honest about the gap, which is the safe default.
      return changed
        ? 'A fresh invitation link was issued, and the one sent before it has stopped working. The page that accepts the link is not built yet, so it cannot be used until that lands.'
        : 'Nothing was issued: an invitation is resent only to somebody who has not accepted one yet.';
    case 'reset-password':
      return 'A password reset was asked for, on the address this account holds. The reset flow answers nothing by design, and nothing mails the link yet, so this reaches the person only once the reset mail is built.';
    case 'suspend':
      return changed
        ? 'Suspended. Every live session ended, and an invitation they had not accepted has stopped working.'
        : 'Nothing changed: the account is already suspended, or suspending it would leave the room with no admin who can sign in.';
    case 'reinstate':
      return changed
        ? 'Reinstated. They can sign in again, and will have to — suspension ended the sessions and nothing restores them.'
        : 'Nothing changed: only a suspended account is reinstated.';
    case 'end-sessions':
      if (!changed) {
        return 'Nothing changed: there was no live session left to end.';
      }

      // Second person when the page is about the reader: the act has just ended
      // the session they are reading it with, and a sentence about "them" would
      // describe somebody else while the next click fails.
      return self
        ? 'Every session ended, including the one you are using. Nothing here will answer until you sign in again.'
        : 'Every session ended. They are signed out everywhere and can sign in again.';
  }
}

function Outcome({
  runner,
  self,
}: {
  readonly runner: ActionRunner;
  readonly self: boolean;
}): ReactElement | null {
  const reported = useRef<HTMLElement | null>(null);
  const { performed, failure } = runner;

  // A callback ref, because the report is a paragraph in one branch and a division
  // in the other and one `RefObject` cannot be both.
  function capture(element: HTMLElement | null): void {
    reported.current = element;
  }

  // Focus what just happened. Three of the five acts take their own control off
  // the page — the suspend control goes when the account suspends, the reinstate
  // control when it becomes active again, the sessions control when the last
  // session ends — and focus would otherwise fall to the document body, which
  // sends a keyboard reader back to the top of the page to find out what changed.
  useEffect(() => {
    if (performed !== null || failure !== null) {
      reported.current?.focus();
    }
  }, [performed, failure]);

  if (failure !== null) {
    return (
      <p ref={capture} tabIndex={-1} className={styles.failure} role="alert">
        {failure}
      </p>
    );
  }

  if (performed === null) {
    return null;
  }

  const { action, answer } = performed;

  return (
    <div ref={capture} tabIndex={-1} className={styles.outcome} role="status">
      <p>{said(action, answer, self)}</p>
      {answer.link === undefined ? null : (
        <>
          <p className={styles.deliver}>{answer.deliverByHand}</p>
          <code className={styles.link}>{answer.link}</code>
        </>
      )}
    </div>
  );
}

/** The list, which is where a deleted person's own page can no longer send a reader. */
const ACCOUNTS = '/admin/accounts';

/** A count and the noun it counts, pluralised for the English console. */
function counted(howMany: number, noun: string): string {
  return `${howMany} ${noun}${howMany === 1 ? '' : 's'}`;
}

/**
 * What this delete would remove and what it would leave, in one sentence
 * (`ADMIN-001/T4`).
 *
 * The two kinds of read record are one number here, because what somebody opened
 * is one thing to an admin and two tables only to the schema. No deck or report is
 * named: the count is what makes the size of the act legible, and the titles would
 * be reading a person's history in order to justify deleting it (`DATA-R01`).
 *
 * It is a sentence rather than a list because it is read in the moment before an
 * irreversible act, and a table of seven numbers at that moment is skipped.
 */
function erasureSentence(counts: ErasureCounts): string {
  const removed = [
    counted(counts.sessions, 'session'),
    counted(counts.invitations, 'invitation'),
    counted(counts.grants, 'grant'),
    counted(counts.deckReads + counts.reportReads, 'read record'),
  ];

  const kept =
    counts.authoredRevisions === 0
      ? 'They wrote nothing, so no document is left behind.'
      : `It keeps ${counted(counts.authoredRevisions, 'revision')} they wrote, with the author removed.`;

  return `Removing this account also removes ${removed.slice(0, -1).join(', ')} and ${removed[removed.length - 1]}. ${kept}`;
}

/** Whether the delete is in flight, has succeeded, or is waiting to be asked for. */
type ErasePhase = 'idle' | 'erasing' | 'gone';

/** What the delete reported, and whether it is news about the act or a failure of it. */
interface Reported {
  readonly failed: boolean;
  readonly text: string;
}

/**
 * The one control on this page that nothing undoes (`ADMIN-001/T4`).
 *
 * It posts to a route of its own rather than through the act runner above, because
 * it carries the typed name the confirmation collected and the route checks that
 * name again before erasing anything — a disabled button is a courtesy, not a
 * control.
 *
 * **A delete that worked leaves this page behind.** The account the page is about
 * no longer exists, so re-reading it — what every other act here does — would land
 * on the `404` an unknown id gives. It goes to the list instead, which is where the
 * admin can see that the row has gone. The phase stays `gone` across that
 * navigation so the control cannot be pressed a second time while it is under way.
 *
 * What it reports is announced rather than focused, unlike the acts above: the
 * panel returns focus to the trigger as it closes, and the trigger is still there,
 * so moving focus would take it away from where the reader just left it. The
 * region that announces is mounted empty from the first render, because a live
 * region that appears in the same render as its own first text is not reliably
 * read — the announcement is of a change within a region, so the region has to
 * have been there to change.
 */
function DeleteAccount({
  accountId,
  name,
  erasure,
  disabled,
}: {
  readonly accountId: string;
  /** The person's name, which the confirmation states and demands typed. */
  readonly name: string;
  readonly erasure: ErasureCounts;
  /** Whether another act on this page is running. */
  readonly disabled: boolean;
}): ReactElement {
  const router = useRouter();
  const [phase, setPhase] = useState<ErasePhase>('idle');
  const [reported, setReported] = useState<Reported | null>(null);

  async function erase(typedName: string): Promise<void> {
    setPhase('erasing');
    setReported(null);

    try {
      const response = await fetch(`/admin/accounts/${accountId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: typedName }),
      });

      if (response.redirected) {
        setReported({ failed: true, text: 'Your session has ended. Open the page again to sign in.' });
      } else if (response.status === 200) {
        const answer = (await response.json()) as AccountDeleteAnswer;

        if (answer.outcome === 'changed') {
          setPhase('gone');
          router.push(ACCOUNTS);
        } else {
          setReported({
            failed: false,
            text: 'Nothing was deleted: an admin cannot delete their own account, and deleting the last admin who can sign in is refused.',
          });
        }
      } else if (response.status >= 500) {
        // A server failure is not a refusal, and saying which it was would be a
        // guess: the delete and its audit row are one transaction, so it most
        // likely wrote nothing — but this surface cannot see that, and the page can.
        setReported({
          failed: true,
          text: `The account was not deleted (status ${response.status}) — the server failed rather than refusing. Re-read the page to see where things stand.`,
        });
      } else {
        setReported({
          failed: true,
          text: `The delete was refused (status ${response.status}). Re-read the page: the account may already be gone, or its name may not be what this page shows.`,
        });
      }
    } catch {
      setReported({ failed: true, text: 'The delete could not be sent — the network request failed.' });
    } finally {
      // `gone` stands: the page is on its way to the list and the control must not
      // re-arm behind it.
      setPhase((current) => (current === 'gone' ? current : 'idle'));
    }
  }

  return (
    <>
      <DestructiveAction
        action="account.delete"
        subject={name}
        details={<p>{erasureSentence(erasure)}</p>}
        disabled={disabled || phase !== 'idle'}
        onConfirm={(typedName) => void erase(typedName)}
      />
      <div role="status">
        {reported === null ? null : (
          <p className={reported.failed ? styles.failure : styles.outcome}>
            {reported.text}
          </p>
        )}
      </div>
    </>
  );
}

export function PersonActions({
  accountId,
  name,
  state,
  self,
  erasure,
}: {
  readonly accountId: string;
  /** The person's name, which the suspension and delete confirmations state. */
  readonly name: string;
  readonly state: AccountState;
  /** Whether the admin reading the page is the person it is about. */
  readonly self: boolean;
  /** What a delete would remove and leave, which its confirmation states. */
  readonly erasure: ErasureCounts;
}): ReactElement {
  const runner = useAccountAction(accountId);
  const held = runner.busy !== null;

  return (
    <>
      <ul className={styles.actions}>
        {state === 'invited' ? (
          <li>
            <button
              type="button"
              className={styles.action}
              disabled={held}
              onClick={() => void runner.run('resend-invitation')}
            >
              Resend invitation
            </button>
            <span className={styles.note}>Issues a fresh link, and the previous one stops working.</span>
          </li>
        ) : null}

        {state === 'active' ? (
          <li>
            <button
              type="button"
              className={styles.action}
              disabled={held}
              onClick={() => void runner.run('reset-password')}
            >
              Reset password
            </button>
            <span className={styles.note}>Starts the reset the person would ask for themselves.</span>
          </li>
        ) : null}

        {state === 'suspended' ? (
          <li>
            <button
              type="button"
              className={styles.action}
              disabled={held}
              onClick={() => void runner.run('reinstate')}
            >
              Reinstate
            </button>
            <span className={styles.note}>They can sign in again, and sign in afresh.</span>
          </li>
        ) : null}

        {state !== 'suspended' && !self ? (
          <li>
            <DestructiveAction
              action="account.suspend"
              subject={name}
              disabled={held}
              onConfirm={() => void runner.run('suspend')}
            />
          </li>
        ) : null}

        {self ? null : (
          <li>
            <DeleteAccount accountId={accountId} name={name} erasure={erasure} disabled={held} />
          </li>
        )}
      </ul>

      {self ? (
        <p className={styles.note}>
          This is your own account. Suspending and deleting it are both refused, so neither control
          is offered — ask the other admin.
        </p>
      ) : null}

      <Outcome runner={runner} self={self} />
    </>
  );
}

/**
 * The sessions section's control. It is rendered only while there is a session to
 * end, so a successful press takes it off the page along with the table — which is
 * the report: the section goes from listing ways in to saying there are none. A
 * press that changed nothing leaves both standing and says why.
 *
 * On the reader's own page it is still offered, because ending every session is
 * exactly what somebody who thinks their password is known needs (`AUTH-004`) — but
 * it says in the second person that it ends the session they are reading with,
 * since a control that signs you out is one you should press deliberately.
 */
export function EndSessions({
  accountId,
  self,
}: {
  readonly accountId: string;
  /** Whether the admin reading the page is the person it is about. */
  readonly self: boolean;
}): ReactElement {
  const runner = useAccountAction(accountId);

  return (
    <>
      <button
        type="button"
        className={styles.action}
        disabled={runner.busy !== null}
        onClick={() => void runner.run('end-sessions')}
      >
        {self ? 'End every session, including this one' : 'End every session'}
      </button>
      {self ? (
        <span className={styles.note}>
          This ends the session you are reading with, so nothing here will answer until you sign in
          again.
        </span>
      ) : null}
      <Outcome runner={runner} self={self} />
    </>
  );
}
