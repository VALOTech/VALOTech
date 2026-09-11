'use client';

/**
 * The set-password form (`AUTH-003/T4`), shared by the invitation and the reset
 * flows because they differ only in how the token was issued. It collects a
 * password and a confirmation, checks they match before it posts, and sends the
 * token and the password to `POST /api/auth/set-password`, which answers `204`
 * with the session cookie, `400` naming the policy rule to fix, or `409` when
 * the link has been used or has expired.
 *
 * Every string is a key (`I18N-R01`); both fields carry a real label rather than
 * a placeholder (`A11Y-R02`), and the policy is stated in a hint the password
 * field points at with `aria-describedby` so a screen reader reads it with the
 * field rather than after it.
 */

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { useTranslations } from 'next-intl';

import styles from './set-password.module.css';

type Outcome = 'too-short' | 'too-long' | 'too-common' | 'mismatch' | 'expired' | 'unexpected';

const HINT_ID = 'set-password-hint';

export function SetPasswordForm({ token }: { readonly token: string }): ReactElement {
  const t = useTranslations('setPassword');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    // The confirmation is a typo guard for the person, not something the server
    // needs, so it is checked here and never sent.
    if (password !== confirm) {
      setOutcome('mismatch');
      return;
    }

    setBusy(true);
    setOutcome(null);

    try {
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (response.status === 204) {
        // Set and signed in; the room is the application root until INV-001
        // mounts one. A full navigation, so the next response is fetched under
        // the new cookie.
        window.location.assign('/');
        return;
      }

      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as { error?: string; problem?: string } | null;
        if (
          body?.error === 'weak_password' &&
          (body.problem === 'too-short' || body.problem === 'too-long' || body.problem === 'too-common')
        ) {
          setOutcome(body.problem);
        } else {
          setOutcome('unexpected');
        }
      } else if (response.status === 409) {
        setOutcome('expired');
      } else {
        setOutcome('unexpected');
      }
    } catch {
      setOutcome('unexpected');
    } finally {
      setBusy(false);
    }
  }

  const message =
    outcome === null
      ? ''
      : outcome === 'too-short'
        ? t('tooShort')
        : outcome === 'too-long'
          ? t('tooLong')
          : outcome === 'too-common'
            ? t('tooCommon')
            : outcome === 'mismatch'
              ? t('mismatch')
              : outcome === 'expired'
                ? t('expiredBody')
                : t('unexpected');

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}>
        <span>{t('password')}</span>
        <input
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="new-password"
          autoFocus
          aria-describedby={HINT_ID}
        />
      </label>
      <p id={HINT_ID} className={styles.hint}>
        {t('hint')}
      </p>
      <label className={styles.field}>
        <span>{t('confirm')}</span>
        <input
          type="password"
          name="confirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
          autoComplete="new-password"
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
