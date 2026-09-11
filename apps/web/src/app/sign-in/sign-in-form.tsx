'use client';

/**
 * The sign-in form (`AUTH-001/T4`). It collects an address and a password and
 * posts them to `POST /api/auth/sign-in`, which answers `204` with the session
 * cookie, `401` for the one failure the three rejected states share (`SEC-R03`),
 * or `429` when a limit is hit. Every string is a key so the form reads in any
 * of the twenty locales (`I18N-R01`), and every field carries a real label
 * rather than a placeholder standing in for one (`A11Y-R02`).
 */

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { useTranslations } from 'next-intl';

import styles from './sign-in.module.css';

type Outcome = 'invalid' | 'too_many' | 'unexpected';

export function SignInForm(): ReactElement {
  const t = useTranslations('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);

    try {
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.status === 204) {
        // The session cookie is set. The room is the application root until
        // INV-001 mounts one of its own; a full navigation, not a client route,
        // so the next response is fetched under the new cookie.
        window.location.assign('/');
        return;
      }

      if (response.status === 401) {
        setOutcome('invalid');
      } else if (response.status === 429) {
        setOutcome('too_many');
      } else {
        setOutcome('unexpected');
      }
    } catch {
      // A network failure is the reader's to retry, not a statement about the
      // credentials, so it says so rather than blaming the password.
      setOutcome('unexpected');
    } finally {
      setBusy(false);
    }
  }

  const message =
    outcome === 'invalid'
      ? t('error')
      : outcome === 'too_many'
        ? t('tooManyAttempts')
        : outcome === 'unexpected'
          ? t('unexpected')
          : '';

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}>
        <span>{t('email')}</span>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          autoFocus
        />
      </label>
      <label className={styles.field}>
        <span>{t('password')}</span>
        <input
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <button type="submit" disabled={busy}>
        {t('submit')}
      </button>
      <p className={styles.error} role="alert">
        {message}
      </p>
    </form>
  );
}
