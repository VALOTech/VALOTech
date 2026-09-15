'use client';

/**
 * The control that says whether a person has already invested or is still
 * deciding (`ADMIN-001/T11`, `INV-DEC-02`).
 *
 * A form rather than a button, like the correction beside it: the acts above are
 * a name and a press, and this one carries a value. The value is chosen from a
 * closed list rather than typed, because the column holds three states and there
 * is nothing about them for an admin to spell.
 *
 * **"Nobody has said" is the first option and is a real choice**, not the absence
 * of one. It is what the record says about somebody the company has not
 * described, it is distinct from deciding, and an admin who classified the wrong
 * person has to be able to put it back.
 *
 * **What it says afterwards says what it did and what it did not do.** It orders
 * the hall's landing for this person and changes nothing about what they may
 * read, which is the sentence that stops the control being mistaken for an access
 * control — the mistake that would matter, and the only way this surface can
 * mislead.
 *
 * English console chrome (`ADMIN-002/T5`), like the rest of the admin surface.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { INVESTOR_TYPES, type InvestorType } from '../../../../db/types';

import type { InvestorTypeAnswer } from './account-actions';
import styles from './person.module.css';

/** What the act reported, and whether it is news about it or a failure of it. */
interface Reported {
  readonly failed: boolean;
  readonly text: string;
}

/**
 * The three states, as the admin reads them. `''` stands for `null` on the wire
 * because an HTML option's value is a string and there is no null to give it;
 * `chosen` converts it back at the one place that submits, so nothing else in
 * this file has to know the option list has a spelling of its own.
 */
const UNSAID = '';

const LABELS: Readonly<Record<InvestorType, string>> = {
  current: 'Has invested',
  prospect: 'Still deciding',
};

const SAID: Readonly<Record<InvestorType, string>> = {
  current: 'recorded as having invested',
  prospect: 'recorded as still deciding',
};

function chosen(value: string): InvestorType | null {
  return value === UNSAID ? null : (value as InvestorType);
}

export function SetInvestorType({
  accountId,
  investorType: held,
  disabled,
}: {
  readonly accountId: string;
  /** What the record holds, which the control opens on. `null` is nobody having said. */
  readonly investorType: InvestorType | null;
  /** Whether another act on this page is running. */
  readonly disabled: boolean;
}): ReactElement {
  const router = useRouter();
  const [value, setValue] = useState<string>(held ?? UNSAID);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState<Reported | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setReported(null);

    const asked = chosen(value);

    try {
      const response = await fetch(`/admin/accounts/${accountId}/investor-type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investorType: asked }),
      });

      if (response.redirected) {
        setReported({ failed: true, text: 'Your session has ended. Open the page again to sign in.' });
      } else if (response.status === 200) {
        const answer = (await response.json()) as InvestorTypeAnswer;
        setReported({
          failed: false,
          text:
            answer.outcome === 'unchanged'
              ? 'Nothing changed: the account already says that.'
              : `${asked === null ? 'Cleared — the record says nobody has said' : `Saved — this person is ${SAID[asked]}`}. It orders the blocks on their hall landing and changes nothing about what they may read.`,
        });

        if (answer.outcome === 'changed') {
          // The identity section is the server's read: re-render so the page
          // states what the record now holds rather than what it held on load.
          router.refresh();
        }
      } else if (response.status >= 500) {
        // A server failure is not a refusal, and saying which it was would be a
        // guess: the write and its audit row are one transaction, so it most
        // likely wrote nothing — but this surface cannot see that, and the page can.
        setReported({
          failed: true,
          text: `Nothing was saved (status ${response.status}) — the server failed rather than refusing. Re-read the page to see where things stand.`,
        });
      } else {
        setReported({ failed: true, text: `The change was refused (status ${response.status}).` });
      }
    } catch {
      setReported({ failed: true, text: 'The change could not be sent — the network request failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className={styles.correction} onSubmit={(event) => void submit(event)}>
        <label className={styles.field}>
          <span>Investor type</span>
          <select value={value} onChange={(event) => setValue(event.target.value)}>
            <option value={UNSAID}>Nobody has said</option>
            {INVESTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.note}>
          This orders the blocks on this person&rsquo;s hall landing. It grants nothing and withholds
          nothing: what they may read is their deck grants and each document&rsquo;s audience. Leave
          it at &ldquo;nobody has said&rdquo; where the company has not described them &mdash; that is
          not the same as still deciding.
        </p>
        <button type="submit" className={styles.action} disabled={busy || disabled}>
          Save investor type
        </button>
      </form>

      {/* Mounted from the first render, empty. A live region that appears in the
          same render as its own first text is not reliably read, because what is
          announced is a change within a region that was already there. Focus is
          not moved: the control and its button are still on the page, and taking
          focus off them would take it from where the reader just left it. */}
      <div role="status">
        {reported === null ? null : (
          <p className={reported.failed ? styles.failure : styles.outcome}>{reported.text}</p>
        )}
      </div>
    </>
  );
}
