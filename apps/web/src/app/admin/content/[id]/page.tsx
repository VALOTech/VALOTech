import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { itemsForConsole } from '../../../../content/items';
import { localeGrid } from '../../../../content/locales';
import { publishConsequences, withdrawReturnsTo } from '../../../../content/publish';

import { ItemActions } from './item-actions';
import styles from './item.module.css';

export const metadata: Metadata = { title: 'Content item' };

const WHEN = (value: Date): string => value.toISOString().slice(0, 16).replace('T', ' ');

const TYPE_LABEL: Readonly<Record<string, string>> = {
  report: 'Report',
  update: 'Update',
  deck: 'Deck',
};

const AUDIENCE_LABEL: Readonly<Record<string, string>> = {
  public: 'Anyone, including a visitor who has not signed in',
  investor: 'Every investor',
  granted: 'Only investors it is granted to',
};

/**
 * `GET /admin/content/<id>` (`CMS-004/T4`) — one item's own screen: what a
 * reader sees today, what is waiting, and the two controls that move between
 * them.
 *
 * It is the hub the content list opens, and it leads on rather than duplicating:
 * the editor writes the words, the translation grid handles languages, and this
 * page is where a draft becomes something a reader sees. Publishing is the
 * dangerous direction and carries the confirmation; withdrawing is reversible
 * and carries none (`CMS-004` §3).
 *
 * The item's row comes from the console's own list read, filtered here rather
 * than fetched by a second query of the same shape: the room holds a few dozen
 * items, and two reads answering the same question are two chances for the
 * screen and the list to disagree.
 *
 * The `/admin` segment layout has already resolved the admin (`ADMIN-002/T1`),
 * and every read here is a staff read composing no audience predicate.
 */
export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;

  const item = (await itemsForConsole()).find((entry) => entry.id === id);
  if (item === undefined) {
    notFound();
  }

  const revisions = await localeGrid(id);
  const openDraft = revisions.find((revision) => !revision.published);
  const published = revisions.find((revision) => revision.published);

  const consequences = openDraft === undefined ? null : await publishConsequences(id, openDraft.revisionId);
  const returnsTo = item.published ? await withdrawReturnsTo(id) : null;

  return (
    <>
      <a className={styles.crumb} href="/admin/content">
        ← Content
      </a>
      <h1>{item.title}</h1>

      <dl className={styles.facts}>
        <div>
          <dt>Type</dt>
          <dd>
            {TYPE_LABEL[item.type] ?? item.type}
            {item.period === null ? '' : ` · ${item.period}`}
            {item.kind === null ? '' : ` · ${item.kind}`}
          </dd>
        </div>
        <div>
          <dt>Readable by</dt>
          <dd>{AUDIENCE_LABEL[item.audience] ?? item.audience}</dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd className={styles.slug}>{item.slug}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>
            {published === undefined || !item.published
              ? 'Nothing — no reader sees this yet'
              : `The version saved ${WHEN(published.createdAt)} UTC`}
          </dd>
        </div>
      </dl>

      <p className={styles.onward}>
        <a href={`/admin/content/${id}/edit`}>Edit the words</a>
        {' · '}
        <a href={`/admin/content/${id}/preview`}>Preview</a>
        {' · '}
        <a href={`/admin/content/${id}/locales`}>
          Translations ({item.reviewedLocales === 0 ? 'English only' : `${item.reviewedLocales} reviewed`})
        </a>
      </p>

      <ItemActions
        itemId={id}
        published={item.published}
        withdrawReturnsTo={returnsTo === null ? null : WHEN(returnsTo.publishedAt)}
        publishable={
          openDraft === undefined || consequences === null
            ? null
            : {
                revisionId: openDraft.revisionId,
                savedAt: WHEN(openDraft.createdAt),
                replacingPublishedAt:
                  consequences.replacing === null ? null : WHEN(consequences.replacing.publishedAt),
                reviewedLocales: consequences.reviewedLocales,
                fallbackLocales: consequences.fallbackLocales,
              }
        }
      />
    </>
  );
}
