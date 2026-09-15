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

import { INVITABLE_ROLES } from '../../../../db/types';
import { languageName, LOCALES } from '../../../../i18n/locales';

import styles from './invite.module.css';

type Result =
  | { readonly kind: 'link'; readonly name: string; readonly link: string; readonly delivery: string }
  | { readonly kind: 'taken' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ended' }
  | { readonly kind: 'failed' };

export default function InvitePage(): ReactElement {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('investor');
  const [locale, setLocale] = useState<string>('');
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
        body: JSON.stringify({ name, email, role, locale }),
      });

      if (response.redirected) {
        setResult({ kind: 'ended' });
      } else if (response.status === 200) {
        const body = (await response.json()) as { link: string; delivery: string };
        setResult({ kind: 'link', name: name.trim(), link: body.link, delivery: body.delivery });
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
        own from the link below. The link is shown to you whether or not the invitation reached their
        inbox, so you always have a way to deliver it yourself.
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
            {INVITABLE_ROLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Language</span>
          <select value={locale} onChange={(event) => setLocale(event.target.value)}>
            {/* Empty, first and selected by default, so not choosing is what
                happens when nobody thinks about it. A list defaulting to English
                would record a claim about every invitee an admin never considered. */}
            <option value="">Not known</option>
            {LOCALES.map((option) => (
              <option key={option} value={option}>
                {languageName(option)}
              </option>
            ))}
          </select>
          <small className={styles.note}>Their invitation is written in this. English when not known.</small>
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
            Invited {result.name}. {result.delivery}
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
