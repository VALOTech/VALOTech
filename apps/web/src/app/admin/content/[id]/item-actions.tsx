'use client';

/**
 * Publishing and withdrawing, from the item's own screen (`CMS-004/T4`).
 *
 * **The two directions are shaped differently on purpose** (`CMS-004` §3).
 * Publishing is the dangerous one and carries the confirmation: it names the
 * draft being published, the version it replaces, and how many languages will be
 * served against how many will read the English. Withdrawing is the reversible
 * one and carries none — the revision never leaves the database and
 * re-publishing moves the pointer forward again — so a mistaken withdraw costs
 * one click. A dialogue on both would train an author through the one that
 * matters.
 *
 * **Withdrawing still says what it will do before it is pressed**, because
 * "returns to the version published in March" and "nothing will be visible to
 * any reader" are different outcomes behind one control. The sentence is the
 * server's (`content/publish.ts:withdrawReturnsTo`), so the control cannot
 * describe an outcome the store would not produce.
 *
 * The revision is posted explicitly rather than as "the latest": the
 * confirmation named a revision, and publishing a different one would make the
 * confirmation a lie (`CMS-004` §3).
 */

import { useState } from 'react';
import type { ReactElement } from 'react';

import styles from './item.module.css';

export interface PublishFacts {
  /** The revision the control would publish, and when it was saved. */
  readonly revisionId: string;
  readonly savedAt: string;
  /** When the version a reader sees today was published, or `null` for none. */
  readonly replacingPublishedAt: string | null;
  readonly reviewedLocales: number;
  readonly fallbackLocales: number;
}

type Outcome =
  | { readonly kind: 'published' }
  | { readonly kind: 'withdrawn'; readonly stillVisible: boolean }
  | { readonly kind: 'refused'; readonly detail: string };

const FAILED = 'Nothing changed. Try again in a moment.';
const LAPSED = 'Your session has ended. Open the page again to sign in.';

export function ItemActions({
  itemId,
  publishable,
  published,
  withdrawReturnsTo,
}: {
  readonly itemId: string;
  /** The draft that can be published, or `null` when there is nothing newer. */
  readonly publishable: PublishFacts | null;
  /** Whether a reader sees anything today; withdrawing is offered only then. */
  readonly published: boolean;
  /** When withdrawing would return a reader to, or `null` for nothing visible. */
  readonly withdrawReturnsTo: string | null;
}): ReactElement {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function act(path: string, body: unknown, done: (payload: unknown) => Outcome): Promise<void> {
    setBusy(true);
    setOutcome(null);

    try {
      const response = await fetch(`/admin/content/${itemId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });

      if (response.status === 200) {
        setAsking(false);
        setOutcome(done(await response.json()));
      } else if (response.redirected) {
        setOutcome({ kind: 'refused', detail: LAPSED });
      } else if (response.status === 422) {
        const payload = (await response.json()) as { detail?: string };
        setOutcome({
          kind: 'refused',
          detail: `This version no longer validates, so the pointer did not move. ${payload.detail ?? ''}`.trim(),
        });
      } else if (response.status === 409) {
        const payload = (await response.json()) as { period?: string; heldBy?: { title?: string } | null };
        setOutcome({
          kind: 'refused',
          detail:
            payload.heldBy?.title === undefined
              ? `${payload.period ?? 'That period'} already holds a published report.`
              : `${payload.period} already holds a published report: ${payload.heldBy.title}. Withdraw that one, or give this report another period.`,
        });
      } else {
        setOutcome({ kind: 'refused', detail: FAILED });
      }
    } catch {
      setOutcome({ kind: 'refused', detail: FAILED });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.actions} aria-labelledby="actions-heading">
      <h2 id="actions-heading">What a reader sees</h2>

      {publishable === null ? (
        <p className={styles.quiet}>
          There is no unpublished draft. Edit the item to make one.
        </p>
      ) : asking ? (
        <div className={styles.confirm} role="group" aria-labelledby="confirm-heading">
          <h3 id="confirm-heading">Publish the draft saved {publishable.savedAt} UTC?</h3>
          <ul className={styles.consequences}>
            <li>
              {publishable.replacingPublishedAt === null
                ? 'Nothing is published yet, so this is the first thing a reader will see.'
                : `It replaces the version published ${publishable.replacingPublishedAt} UTC, which stays readable in the archive.`}
            </li>
            <li>
              {publishable.reviewedLocales === 0
                ? `No translation is reviewed, so all ${publishable.fallbackLocales} other languages will read the English.`
                : `${publishable.reviewedLocales} ${publishable.reviewedLocales === 1 ? 'language is' : 'languages are'} reviewed and will be served; ${publishable.fallbackLocales} will read the English.`}
            </li>
          </ul>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() =>
                void act('publish', { revisionId: publishable.revisionId }, () => ({ kind: 'published' }))
              }
            >
              {busy ? 'Publishing…' : 'Publish'}
            </button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => setAsking(false)}>
              Keep it unpublished
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={() => setAsking(true)}>
            Publish the draft saved {publishable.savedAt} UTC
          </button>
        </div>
      )}

      {published ? (
        <div className={styles.withdraw}>
          <p className={styles.quiet}>
            {withdrawReturnsTo === null
              ? 'Withdrawing leaves nothing visible to any reader. The item and its history stay.'
              : `Withdrawing returns readers to the version published ${withdrawReturnsTo} UTC.`}
          </p>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() =>
              void act('withdraw', {}, (payload) => ({
                kind: 'withdrawn',
                stillVisible: (payload as { published?: boolean }).published === true,
              }))
            }
          >
            {busy ? 'Withdrawing…' : 'Withdraw'}
          </button>
        </div>
      ) : null}

      {outcome === null ? null : outcome.kind === 'refused' ? (
        <p className={styles.refused} role="alert">
          {outcome.detail}
        </p>
      ) : (
        <p className={styles.done} role="status">
          {outcome.kind === 'published'
            ? 'Published. Reload to see the item as it now stands.'
            : outcome.stillVisible
              ? 'Withdrawn. Readers are back on the previous version.'
              : 'Withdrawn. Nothing is visible to any reader now.'}
        </p>
      )}
    </section>
  );
}
