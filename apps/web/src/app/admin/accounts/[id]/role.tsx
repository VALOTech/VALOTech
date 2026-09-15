'use client';

/**
 * The control that moves a person between roles — in practice, that promotes
 * somebody who registered themselves once they have invested (`AUTH-DEC-06`,
 * `ADMIN-001/T13`).
 *
 * A form rather than a button, like the investor type beside it, because it
 * carries a value. The difference from that control is the whole reason this one
 * is worded as it is: **the investor type orders a page and this grants access**,
 * so the note under it says what the press will actually let the person read
 * rather than reassuring them it changes nothing.
 *
 * **`prospect` is not offered as a destination.** Somebody becomes one by
 * registering and confirming their own address, and nothing else; an admin who
 * invited the wrong person suspends or deletes the account rather than recording
 * a registration that never happened. The route refuses it as well, so the
 * absence here is a courtesy and not the guard.
 *
 * English console chrome (`ADMIN-002/T5`), like the rest of the admin surface.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { INVITABLE_ROLES, type AccountRole } from '../../../../db/types';

import type { RoleChangeAnswer } from './account-actions';
import styles from './person.module.css';

interface Reported {
  readonly failed: boolean;
  readonly text: string;
}

const LABELS: Readonly<Record<string, string>> = {
  prospect: 'Prospect — registered themselves',
  investor: 'Investor',
  admin: 'Admin',
};

/** What each outcome means to the admin who pressed the button. */
const SAID: Readonly<Record<RoleChangeAnswer['outcome'], (role: AccountRole) => string>> = {
  changed: (role) =>
    role === 'admin'
      ? 'Saved — this person is an admin and can now manage accounts, content and configuration. Every session they held has ended.'
      : 'Saved — this person is an investor and now reads what the hall publishes to investors, not only its public material. Every session they held has ended.',
  unchanged: () => 'Nothing changed: the account already holds that role.',
  refused_self: () =>
    'Refused: an admin cannot change their own role. Ask another admin to make this change.',
  refused_last_admin: () =>
    'Refused: this is the last admin who can sign in, and demoting them would leave the console unreachable. Make somebody else an admin first.',
  no_such_account: () => 'Refused: there is no such account. The page you are reading may be stale.',
};

export function SetRole({
  accountId,
  role: held,
  disabled,
}: {
  readonly accountId: string;
  /** The role the record holds, which the control opens on. */
  readonly role: AccountRole;
  /** Whether another act on this page is running. */
  readonly disabled: boolean;
}): ReactElement {
  const router = useRouter();
  // A prospect has no invitable role to open on, so the control opens on the
  // move an admin actually came here to make.
  const [value, setValue] = useState<AccountRole>(held === 'prospect' ? 'investor' : held);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState<Reported | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setReported(null);

    try {
      const response = await fetch(`/admin/accounts/${accountId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: value }),
      });

      if (response.redirected) {
        setReported({ failed: true, text: 'Your session has ended. Open the page again to sign in.' });
      } else if (response.status === 200) {
        const answer = (await response.json()) as RoleChangeAnswer;
        setReported({ failed: answer.outcome.startsWith('refused'), text: SAID[answer.outcome](value) });

        if (answer.outcome === 'changed') {
          router.refresh();
        }
      } else if (response.status >= 500) {
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
          <span>Role</span>
          <select value={value} onChange={(event) => setValue(event.target.value as AccountRole)}>
            {INVITABLE_ROLES.map((option) => (
              <option key={option} value={option}>
                {LABELS[option] ?? option}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.note}>
          This changes what the person may read, at once. A prospect reads only what the hall
          publishes openly; an investor reads everything published to investors, and an admin reads
          and changes everything. Saving ends every session the account holds, so the change reaches
          somebody who is signed in right now.
        </p>
        <button type="submit" className={styles.action} disabled={busy || disabled}>
          Save role
        </button>
      </form>

      <div role="status">
        {reported === null ? null : (
          <p className={reported.failed ? styles.failure : styles.outcome}>{reported.text}</p>
        )}
      </div>
    </>
  );
}
