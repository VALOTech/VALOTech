'use client';

/**
 * One setting, and the two things an operator does to it (`CFG-001/T8`).
 *
 * **The change is the dangerous direction and the revert is the safe one**, so
 * they are shaped differently on purpose (`CFG-001` §3): changing takes a typed
 * value and an explicit Save, and reverting is a single action with no
 * confirmation. A confirmation on the safe direction trains people through the
 * one on the dangerous direction, so there is none here.
 *
 * A refusal is the store's own sentence — the bound the value missed — rather
 * than a word this screen invents, because the screen would invent a different
 * one and the two would drift (`CFG-001/T2`). Nothing is clamped: what an
 * operator typed is either stored or refused, and they are told which.
 *
 * `mail.enabled` is a kill switch and reads as one: two radios that say what
 * each state does, rather than a checkbox whose meaning has to be inferred from
 * the key's name (`A11Y-R02`).
 */

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import styles from './config.module.css';

export interface SettingRow {
  readonly key: string;
  readonly type: 'text' | 'bool';
  readonly what: string;
  readonly value: string;
  readonly fallback: string;
  readonly previousValue: string | null;
  readonly changedBy: string | null;
  /** Already UTC and already a string: the page holds the one clock. */
  readonly changedAt: string | null;
}

type Outcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'reverted'; readonly to: string }
  | { readonly kind: 'refused'; readonly detail: string };

const FAILED = 'Nothing was changed. Try again in a moment.';
const LAPSED = 'Your session has ended. Open the page again to sign in.';

/** What a stored value reads as when it is empty, so a blank line is visible. */
function shown(value: string): ReactElement | string {
  return value === '' ? <span className={styles.blank}>(empty)</span> : value;
}

export function SettingControl({ setting }: { readonly setting: SettingRow }): ReactElement {
  const [value, setValue] = useState(setting.value);
  const [inForce, setInForce] = useState(setting.value);
  const [previous, setPrevious] = useState(setting.previousValue);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);

    try {
      const response = await fetch(`/admin/config/${setting.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });

      if (response.status === 200) {
        const { value: stored } = (await response.json()) as { value: string };
        setPrevious(inForce);
        setInForce(stored);
        setValue(stored);
        setOutcome({ kind: 'saved' });
      } else if (response.redirected) {
        setOutcome({ kind: 'refused', detail: LAPSED });
      } else if (response.status === 400) {
        const body = (await response.json()) as { detail?: string };
        setOutcome({ kind: 'refused', detail: body.detail ?? FAILED });
      } else {
        setOutcome({ kind: 'refused', detail: FAILED });
      }
    } catch {
      setOutcome({ kind: 'refused', detail: FAILED });
    } finally {
      setBusy(false);
    }
  }

  async function revert(): Promise<void> {
    if (previous === null) {
      return;
    }
    setBusy(true);
    setOutcome(null);

    try {
      const response = await fetch(`/admin/config/${setting.key}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 200) {
        const restored = previous;
        setPrevious(inForce);
        setInForce(restored);
        setValue(restored);
        setOutcome({ kind: 'reverted', to: restored });
      } else if (response.redirected) {
        setOutcome({ kind: 'refused', detail: LAPSED });
      } else {
        setOutcome({ kind: 'refused', detail: FAILED });
      }
    } catch {
      setOutcome({ kind: 'refused', detail: FAILED });
    } finally {
      setBusy(false);
    }
  }

  const fieldId = `setting-${setting.key}`;
  const unsaved = value !== inForce;

  return (
    <form className={styles.setting} onSubmit={(event) => void save(event)}>
      <h2 className={styles.key}>{setting.key}</h2>
      <p className={styles.what}>{setting.what}</p>

      {setting.type === 'bool' ? (
        <fieldset className={styles.states}>
          <legend className={styles.label}>In force</legend>
          {[
            { option: 'true', says: 'On — mail is sent' },
            { option: 'false', says: 'Off — nothing is sent' },
          ].map(({ option, says }) => (
            <label key={option} className={styles.state}>
              <input
                type="radio"
                name={fieldId}
                value={option}
                checked={value === option}
                onChange={() => setValue(option)}
              />
              <span>{says}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <label className={styles.field} htmlFor={fieldId}>
          <span className={styles.label}>In force</span>
          <input
            id={fieldId}
            type="text"
            value={value}
            maxLength={280}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={`${fieldId}-default`}
          />
        </label>
      )}

      <p className={styles.meta} id={`${fieldId}-default`}>
        Default: {shown(setting.fallback)}
        {setting.changedAt === null ? (
          <span className={styles.never}> · never changed</span>
        ) : (
          <span>
            {' '}
            · last changed {setting.changedAt} UTC by {setting.changedBy ?? 'an erased account'}
          </span>
        )}
      </p>

      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy || !unsaved}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {previous === null ? null : (
          <button type="button" className={styles.secondary} onClick={() => void revert()} disabled={busy}>
            Revert to {previous === '' ? 'empty' : previous}
          </button>
        )}
        {unsaved ? <span className={styles.unsaved}>Not saved yet.</span> : null}
      </div>

      {outcome === null ? null : outcome.kind === 'refused' ? (
        <p className={styles.refused} role="alert">
          {outcome.detail}
        </p>
      ) : (
        <p className={styles.done} role="status">
          {outcome.kind === 'saved'
            ? 'Saved. It takes effect within a few seconds.'
            : `Reverted to ${outcome.to === '' ? 'empty' : outcome.to}. It takes effect within a few seconds.`}
        </p>
      )}
    </form>
  );
}
