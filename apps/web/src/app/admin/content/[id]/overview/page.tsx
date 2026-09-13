import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { requireAdminPage } from '../../../../../auth/page-guard';
import { overviewFor } from '../../../../../content/overview';

import { SectionList } from './section-list';
import styles from './overview.module.css';

export const metadata: Metadata = { title: 'Deck overview' };

/**
 * `GET /admin/content/<id>/overview` — a deck seen as its sections
 * (`DECK-001/T2`, `DECK-001/T3`, `DECK-001/T4`).
 *
 * The editor writes a deck as one document, because that is what it is
 * (`DECK-001` §3). This is the other view of the same object: the cards are
 * derived from the block array rather than stored beside it, so there is nothing
 * here that can fall out of step with the words — and reordering a card rewrites
 * that array and saves it down the editor's own write path.
 *
 * **The count is the point of the page, so it leads.** A deck of thirty sections
 * is a document, and the number is how its author finds that out before an
 * investor does — which is why it sits above the cards rather than under them,
 * where a long deck would bury it.
 *
 * The `/admin` segment layout has already resolved the admin, and the actor is
 * asked for again here because `overviewFor` reads as that person: the author
 * read is the one that returns an unpublished revision and the speaker context,
 * and it takes the reader rather than trusting the segment (`CMS-001/T6`).
 * Anything that is not a deck this admin may author is the same `404`.
 */
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const actor = await requireAdminPage();

  const overview = await overviewFor(id, actor);
  if (overview === null) {
    notFound();
  }

  const { totals } = overview;

  return (
    <>
      <a className={styles.crumb} href={`/admin/content/${id}`}>
        ← {overview.title}
      </a>
      <h1>Overview</h1>

      <p className={styles.tally}>
        <strong>{totals.sections}</strong> {totals.sections === 1 ? 'section' : 'sections'}
        {' · '}
        <strong>{totals.words.toLocaleString('en')}</strong>{' '}
        {totals.words === 1 ? 'word' : 'words'}
        {' · '}
        <strong>{totals.figures}</strong> {totals.figures === 1 ? 'figure' : 'figures'}
      </p>
      <p className={styles.quiet}>
        {overview.published
          ? 'Showing the latest saved version, which may be newer than the one a reader sees.'
          : 'Nothing is published yet, so no reader sees any of this.'}
      </p>

      {overview.cards.length === 0 ? (
        <p className={styles.empty}>
          This deck has nothing written in it yet. <a href={`/admin/content/${id}/edit`}>Write the first section</a>,
          and it appears here as a card.
        </p>
      ) : (
        <SectionList itemId={id} blocks={overview.blocks} cards={overview.cards} />
      )}
    </>
  );
}
