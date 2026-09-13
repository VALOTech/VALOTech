'use client';

/**
 * Who may read this item, and what changing that does (`RPT-001/T5`,
 * `POST-002/T5`).
 *
 * **The two directions are not the same act.** Widening hands the document to
 * people who did not have it, and the widening that matters is to `public`,
 * where "people who did not have it" is everyone — so that confirmation says in
 * words that anyone including a competitor will be able to read it, rather than
 * naming an audience and trusting an admin to work out what it means
 * (`RPT-001` §3). Narrowing takes it away, and the thing it cannot do is take
 * back what has already been served: a page somebody has open stays on their
 * screen, and a copy of something that was public may sit in their browser until
 * its lifetime elapses. The confirmation says that plainly rather than leaving an
 * admin to believe a narrowing is a recall (`POST-002` §3).
 *
 * Every sentence beyond the two fixed ones is computed from facts the server
 * read (`content/audience.ts:audienceOptions`), so the control cannot describe an
 * outcome the store would not produce. The one that changes an answer rather
 * than decorating it is the grant count: narrowing to `granted` with nothing
 * granted turns a document every investor could read into one nobody can, and
 * "only the investors it is granted to" is how that reads if the number is left
 * out.
 *
 * The strength of the public confirmation is in its words and not in a colour of
 * its own: the panel is already the console's one warning treatment, and meaning
 * carried by hue is meaning some readers do not receive (`A11Y-R03`). The button
 * says what pressing it does rather than agreeing to a question.
 *
 * Choosing the audience the item already has is not offered as a change — the
 * current one is marked and does nothing, because a confirmation for an act that
 * writes nothing is a dialogue that teaches an admin to dismiss dialogues.
 */

import { useState } from 'react';
import type { ReactElement } from 'react';

import type { ContentAudience } from '../../../../db/types';

import styles from './item.module.css';

/**
 * The audiences in reach order, with what each one means for a reader.
 *
 * `satisfies` binds the values to the vocabulary rather than to a list of its
 * own, so a word this control offers that the column cannot hold does not
 * compile. The order is narrowest first, so widening reads as moving down.
 */
export const AUDIENCES = [
  {
    value: 'granted',
    label: 'Only named investors',
    who: 'Only the investors it is granted to, and an admin.',
  },
  {
    value: 'investor',
    label: 'Every investor',
    who: 'Any investor who has signed in, and an admin.',
  },
  {
    value: 'public',
    label: 'Anyone',
    who: 'Anyone at all, signed in or not.',
  },
] as const satisfies readonly {
  readonly value: ContentAudience;
  readonly label: string;
  readonly who: string;
}[];

/** What the server says a move to a given audience would do (`audienceOptions`). */
export interface AudienceFacts {
  readonly direction: 'wider' | 'narrower' | 'same';
  readonly grantHolders: number;
  readonly cachedFor: number | null;
}

const FAILED = 'Nothing changed. Try again in a moment.';
const LAPSED = 'Your session has ended. Open the page again to sign in.';

function labelOf(value: ContentAudience): string {
  return AUDIENCES.find((entry) => entry.value === value)?.label ?? value;
}

/**
 * What the move gives or takes, as the sentence an admin reads before it happens.
 *
 * Written per destination rather than per pair: `public` is the one an admin can
 * regret in a way no later change undoes, `granted` is the one whose reach
 * depends on data rather than on the word, and `investor` is the ordinary middle.
 */
function consequences(to: ContentAudience, facts: AudienceFacts): readonly string[] {
  const said: string[] = [];

  if (to === 'public') {
    said.push(
      'Anyone will be able to read it, including a competitor. It needs no sign-in, and a public document can be linked to, quoted and indexed by a search engine.',
    );
  } else if (to === 'investor') {
    said.push('Every investor who has signed in will be able to read it. Nobody signed out will.');
  } else if (facts.grantHolders === 0) {
    said.push(
      'Nothing is granted on this item yet, so no investor will be able to read it at all. Grant it to somebody first, or this hides it from everyone.',
    );
  } else {
    said.push(
      `Only the ${facts.grantHolders} ${facts.grantHolders === 1 ? 'investor' : 'investors'} it is granted to will be able to read it. Every other investor loses it.`,
    );
  }

  if (facts.direction === 'narrower') {
    said.push(
      facts.cachedFor === null
        ? 'It takes effect on the next read, and does not recall what has already been served: a page somebody has open stays on their screen.'
        : `It takes effect on the next read, and does not recall what has already been served: a page somebody has open stays on their screen, and a reader who already fetched it while it was public may keep a copy for up to ${Math.round(facts.cachedFor / 60)} minutes.`,
    );
  }

  said.push('The change is recorded against your account.');
  return said;
}

export function AudienceControl({
  itemId,
  audience,
  facts,
}: {
  readonly itemId: string;
  /** The audience the item holds today. */
  readonly audience: ContentAudience;
  /** What each of the other two moves would do, read by the server. */
  readonly facts: Readonly<Record<ContentAudience, AudienceFacts>>;
}): ReactElement {
  const [asking, setAsking] = useState<ContentAudience | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [changed, setChanged] = useState<ContentAudience | null>(null);

  async function change(to: ContentAudience): Promise<void> {
    setBusy(true);
    setFailed(null);

    try {
      const response = await fetch(`/admin/content/${itemId}/audience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience: to }),
      });

      if (response.status === 200) {
        setAsking(null);
        setChanged(to);
      } else if (response.redirected) {
        setFailed(LAPSED);
      } else {
        setFailed(FAILED);
      }
    } catch {
      setFailed(FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.actions} aria-labelledby="audience-heading">
      <h2 id="audience-heading">Who may read it</h2>

      {/* A second change would be confirmed against facts the server read for
          the audience this item no longer has — a cache window that is now real
          and was not, a grant count read before it mattered. So one change is
          offered per load and the page is reloaded for the next, which is what
          publishing does on this screen for the same reason. */}
      {changed !== null ? (
        <p className={styles.done} role="status">
          Changed to {labelOf(changed)}. Reload to see the item as it now stands.
        </p>
      ) : (
        <ul className={styles.audiences}>
          {AUDIENCES.map((entry) => (
            <li key={entry.value}>
              {entry.value === audience ? (
                <p className={styles.audienceNow}>
                  <strong>{entry.label}</strong> — {entry.who}{' '}
                  <span className={styles.quiet}>This is the audience today.</span>
                </p>
              ) : (
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  aria-expanded={asking === entry.value}
                  onClick={() => {
                    setFailed(null);
                    setAsking(entry.value);
                  }}
                >
                  {entry.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {asking === null ? null : (
        <div className={styles.confirm} role="group" aria-labelledby="audience-confirm-heading">
          <h3 id="audience-confirm-heading">
            Change the audience from {labelOf(audience)} to {labelOf(asking)}?
          </h3>
          <ul className={styles.consequences}>
            {consequences(asking, facts[asking]).map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() => void change(asking)}
            >
              {busy
                ? 'Changing…'
                : asking === 'public'
                  ? 'Let anyone read it'
                  : `Change to ${labelOf(asking)}`}
            </button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => setAsking(null)}>
              Leave it as it is
            </button>
          </div>
        </div>
      )}

      {failed === null ? null : (
        <p className={styles.refused} role="alert">
          {failed}
        </p>
      )}
    </section>
  );
}
