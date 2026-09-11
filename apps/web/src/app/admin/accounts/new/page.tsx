'use client';

/**
 * The invite form (`ADMIN-001/T6`). An admin names a person and a role; submitting
 * issues the invitation through `POST /admin/accounts/invite` and shows the
 * single-use link, which the admin delivers by hand because nothing mails it yet
 * (`AUTH-003/T3`). No password is set here — the person sets their own from the
 * link — so this collects a name, an address and a role and nothing else
 * (`DATA-R01`). English console chrome (`ADMIN-002/T5`).
 */

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { ACCOUNT_ROLES } from '../../../../db/types';

import styles from './invite.module.css';

type Result =
  | { readonly kind: 'link'; readonly name: string; readonly link: string; readonly deliverByHand: string }
  | { readonly kind: 'taken' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ended' }
  | { readonly kind: 'failed' };

export default function InvitePage(): ReactElement {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('investor');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch('/admin/accounts/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role }),
      });

      if (response.redirected) {
        setResult({ kind: 'ended' });
      } else if (response.status === 200) {
        const body = (await response.json()) as { link: string; deliverByHand: string };
        setResult({ kind: 'link', name: name.trim(), link: body.link, deliverByHand: body.deliverByHand });
        setName('');
        setEmail('');
        setRole('investor');
      } else if (response.status === 409) {
        setResult({ kind: 'taken' });
      } else if (response.status === 400) {
        setResult({ kind: 'invalid' });
      } else {
        setResult({ kind: 'failed' });
      }
    } catch {
      setResult({ kind: 'failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Invite a person</h1>
      <p>
        An account comes to exist by being invited. No password is set here — the person sets their
        own from the link below, which you deliver to them.
      </p>

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <label className={styles.field}>
          <span>Name</span>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} required autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span>Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            {ACCOUNT_ROLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy}>
          Invite
        </button>
      </form>

      {result === null ? null : <Outcome result={result} />}
    </>
  );
}

function Outcome({ result }: { readonly result: Result }): ReactElement {
  switch (result.kind) {
    case 'link':
      return (
        <div className={styles.outcome} role="status">
          <p>
            Invited {result.name}. {result.deliverByHand}
          </p>
          <code className={styles.link}>{result.link}</code>
        </div>
      );
    case 'taken':
      return (
        <p className={styles.error} role="alert">
          That address already belongs to an account. No second one was created.
        </p>
      );
    case 'invalid':
      return (
        <p className={styles.error} role="alert">
          Check the fields: a name, an email address and a role are all needed.
        </p>
      );
    case 'ended':
      return (
        <p className={styles.error} role="alert">
          Your session has ended. Open the page again to sign in.
        </p>
      );
    case 'failed':
      return (
        <p className={styles.error} role="alert">
          The invitation could not be issued. Try again in a moment.
        </p>
      );
  }
}
