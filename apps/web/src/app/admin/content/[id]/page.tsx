import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { audienceOptions } from '../../../../content/audience';
import { deckAudience } from '../../../../content/decks';
import { itemsForConsole } from '../../../../content/items';
import { localeGrid } from '../../../../content/locales';
import { publishConsequences, withdrawReturnsTo } from '../../../../content/publish';
import { reportWithdrawal } from '../../../../content/reports';

import { AudienceControl } from './audience-control';
import { ItemActions } from './item-actions';
import styles from './item.module.css';

export const metadata: Metadata = { title: 'Content item' };

const WHEN = (value: Date): string => value.toISOString().slice(0, 16).replace('T', ' ');

const TYPE_LABEL: Readonly<Record<string, string>> = {
  report: 'Report',
  update: 'Update',
  deck: 'Deck',
};

/**
 * `GET /admin/content/<id>` (`CMS-004/T4`) — one item's own screen: what a
 * reader sees today, who that reader is, and the controls that change either.
 *
 * It is the hub the content list opens, and it leads on rather than duplicating:
 * the editor writes the words, the translation grid handles languages, and this
 * page is where a draft becomes something a reader sees. Publishing is the
 * dangerous direction and carries the confirmation; withdrawing is reversible
 * and carries none (`CMS-004` §3). The audience is the second question and sits
 * above them, because "is it published" and "who may read it" are separate
 * answers and an item is routinely one without the other.
 *
 * Every consequence the confirmations state is read on the server and passed
 * down — what publishing replaces, what withdrawing returns to, what a period
 * becomes, what an audience costs. The screen composes sentences from facts; it
 * never derives one, so no control can describe an outcome the store would not
 * produce.
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

  // Withdrawing a report frees the period as well as moving the pointer, and the
  // two are different sentences (`RPT-002/T5`). `reportWithdrawal` answers `null`
  // for anything that is not a published report, which is every other item here.
  const asReport = item.published ? await reportWithdrawal(id) : null;

  // A deck is the one publish with a named audience, and naming it is the whole
  // difference between publishing and sending (`DECK-002/T5`). Read only when a
  // draft could actually be published, because that is the only state in which
  // the confirmation this feeds is ever shown.
  const asDeck =
    item.type === 'deck' && openDraft !== undefined ? await deckAudience(id) : null;

  // The audience panel offers all three, so all three are read at once.
  const audiences = await audienceOptions(id);

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
        {/* A deck is the one type read in sections, so it is the one type with an
            overview (`DECK-001` §3). The link is absent for the others rather
            than present and refusing, because a destination that answers 404 is
            one somebody tries twice. */}
        {item.type !== 'deck' ? null : (
          <>
            <a href={`/admin/content/${id}/overview`}>Sections</a>
            {' · '}
          </>
        )}
        <a href={`/admin/content/${id}/locales`}>
          Translations ({item.reviewedLocales === 0 ? 'English only' : `${item.reviewedLocales} reviewed`})
        </a>
      </p>

      {/* The item was resolved from the console's own list above, so this read
          of the same row cannot be absent; the check is the type's rather than a
          case the screen has. */}
      {audiences === null ? null : (
        <AudienceControl itemId={id} audience={item.audience} facts={audiences} />
      )}

      <ItemActions
        itemId={id}
        published={item.published}
        withdrawReturnsTo={returnsTo === null ? null : WHEN(returnsTo.publishedAt)}
        asReport={asReport}
        asDeck={
          asDeck === null
            ? null
            : {
                readers: asDeck.readers.map((reader) => ({
                  accountId: reader.accountId,
                  name: reader.name,
                  // The surface asks one question of the state and gets a boolean,
                  // so a fourth account state could never reach it as a raw word.
                  invited: reader.state === 'invited',
                })),
                pinned: asDeck.pinned,
              }
        }
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
