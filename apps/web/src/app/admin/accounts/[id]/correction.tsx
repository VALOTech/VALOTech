'use client';

/**
 * The control that corrects a person's name or the address they sign in with
 * (`ADMIN-001/T10`).
 *
 * It is the console's answer to the PDPA correction right (`LEGAL-SG-001` §3),
 * so it is a form rather than a button: the other acts on this page are a name
 * and a press, and this one carries the two values the admin is fixing. The
 * fields open holding what the record holds, because a correction is almost
 * always one character in one of them and retyping the other is how the other
 * gets a second typo.
 *
 * **What it says afterwards names the fields that moved**, which is also all the
 * trail is allowed to hold (`SEC-DEC-01`): the answer carries the field names and
 * never the values, so nothing here can report a value the server declined to
 * record. Correcting the address destroys an invitation the person had not
 * accepted, and that is said in the same breath — it is the one consequence an
 * admin cannot see from the page, and the one they have to act on.
 *
 * English console chrome (`ADMIN-002/T5`), like the rest of the admin surface.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type { CorrectableField } from '../../../../admin/accounts';

import type { AccountCorrectionAnswer } from './account-actions';
import styles from './person.module.css';

/** What the correction reported, and whether it is news about the act or a failure of it. */
interface Reported {
  readonly failed: boolean;
  readonly text: string;
}

/** The fields that moved, as a sentence. */
function movedSentence(fields: readonly CorrectableField[]): string {
  const both = fields.length > 1;
  const moved = fields.includes('name') ? (both ? 'name and the address' : 'name') : 'address';

  return `The ${moved} ${both ? 'were' : 'was'} corrected.`;
}

/** What a correction that wrote should say, including the part the page cannot show. */
function corrected(answer: AccountCorrectionAnswer): string {
  if (answer.outcome === 'unchanged') {
    return 'Nothing changed: the account already holds those values.';
  }

  return answer.invitationDestroyed
    ? `${movedSentence(answer.fields)} The invitation they had not accepted was sent to the old address, so it has stopped working — resend it to the new one.`
    : movedSentence(answer.fields);
}

/** Why a `400` naming a field was refused, in the words of the field it names. */
function unusable(field: unknown): string {
  if (field === 'name') {
    return 'A name is needed — the field cannot be left empty.';
  }
  if (field === 'email') {
    return 'That is not an address this system can store. Check it and try again.';
  }

  // A field this side does not know, which is a server saying something newer
  // than this page. Naming it would be guessing at which input to point at.
  return 'One of the two values cannot be stored. Check both fields.';
}

export function CorrectIdentity({
  accountId,
  name: held,
  email: heldEmail,
  disabled,
}: {
  readonly accountId: string;
  /** The name the record holds, which the field opens on. */
  readonly name: string;
  /** The address the record holds, which the field opens on. */
  readonly email: string;
  /** Whether another act on this page is running. */
  readonly disabled: boolean;
}): ReactElement {
  const router = useRouter();
  const [name, setName] = useState(held);
  const [email, setEmail] = useState(heldEmail);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState<Reported | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setReported(null);

    try {
      const response = await fetch(`/admin/accounts/${accountId}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      if (response.redirected) {
        setReported({ failed: true, text: 'Your session has ended. Open the page again to sign in.' });
      } else if (response.status === 200) {
        const answer = (await response.json()) as AccountCorrectionAnswer;
        setReported({ failed: false, text: corrected(answer) });

        if (answer.outcome === 'changed') {
          // The identity section is the server's read: re-render so the page
          // states what the record now holds rather than what it held on load.
          router.refresh();
        }
      } else if (response.status === 409) {
        setReported({
          failed: true,
          text: 'That address already belongs to another account. Nothing was changed.',
        });
      } else if (response.status === 400) {
        const body = (await response.json()) as { error?: string; field?: unknown };
        setReported({
          failed: true,
          text:
            body.error === 'invalid_field'
              ? unusable(body.field)
              : 'The correction could not be read as written. Check both fields.',
        });
      } else if (response.status >= 500) {
        // A server failure is not a refusal, and saying which it was would be a
        // guess: the correction and its audit row are one transaction, so it most
        // likely wrote nothing — but this surface cannot see that, and the page can.
        setReported({
          failed: true,
          text: `The correction was not made (status ${response.status}) — the server failed rather than refusing. Re-read the page to see where things stand.`,
        });
      } else {
        setReported({ failed: true, text: `The correction was refused (status ${response.status}).` });
      }
    } catch {
      setReported({ failed: true, text: 'The correction could not be sent — the network request failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className={styles.correction} onSubmit={(event) => void submit(event)}>
        <label className={styles.field}>
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="off"
          />
        </label>
        <label className={styles.field}>
          <span>Address</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="off"
          />
        </label>
        <p className={styles.note}>
          Correcting the address changes what this person signs in with, and stops an invitation they
          have not accepted from working. It ends no session: the same person keeps the access they
          had.
        </p>
        <button type="submit" className={styles.action} disabled={busy || disabled}>
          Save correction
        </button>
      </form>

      {/* Mounted from the first render, empty. A live region that appears in the
          same render as its own first text is not reliably read, because what is
          announced is a change within a region that was already there. Focus is
          not moved: the form and its button are still on the page, and taking
          focus off them would take it from where the reader just left it. */}
      <div role="status">
        {reported === null ? null : (
          <p className={reported.failed ? styles.failure : styles.outcome}>{reported.text}</p>
        )}
      </div>
    </>
  );
}
