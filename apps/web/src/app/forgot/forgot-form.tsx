'use client';

/**
 * The reset-request form (`SEC-001/T4`, `AUTH-DEC-05`).
 *
 * It takes an address and posts it to `POST /api/auth/forgot`, which answers
 * `204` whatever the address names — so this form has no success state that
 * differs from its other one, and the sentence it shows afterwards is written to
 * be true either way: *if* an account uses that address, a link is on its way.
 * Saying "sent" here would be the enumeration answer the route is built to
 * withhold, put back by the screen (`SEC-R03`).
 *
 * The form is replaced by that sentence rather than left standing beside it. A
 * person who has just asked has nothing further to do here, and a field still
 * inviting them to try again is how somebody ends up asking three times and
 * receiving three links of which only the last one works.
 *
 * Every string is a key (`I18N-R01`) and the field carries a real label rather
 * than a placeholder standing in for one (`A11Y-R02`).
 */

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import styles from '../auth-card.module.css';

type Outcome = 'asked' | 'too_many' | 'unexpected';

export function ForgotForm(): ReactElement {
  const t = useTranslations('forgot');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);

    try {
      const response = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.status === 204) {
        setOutcome('asked');
      } else if (response.status === 429) {
        setOutcome('too_many');
      } else {
        // A 400 lands here too, and deliberately reads as "something went
        // wrong" rather than as a statement about the address: the route
        // refuses only a malformed body or an impossible length, and a form
        // that explained which would be explaining what the server thinks of
        // what was typed.
        setOutcome('unexpected');
      }
    } catch {
      setOutcome('unexpected');
    } finally {
      setBusy(false);
    }
  }

  if (outcome === 'asked') {
    return (
      <p className={styles.intro} role="status">
        {t('sent')}
      </p>
    );
  }

  const message = outcome === 'too_many' ? t('tooManyAttempts') : outcome === 'unexpected' ? t('unexpected') : '';

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
      <button type="submit" disabled={busy}>
        {t('submit')}
      </button>
      <p className={styles.error} role="alert">
        {message}
      </p>
    </form>
  );
}
