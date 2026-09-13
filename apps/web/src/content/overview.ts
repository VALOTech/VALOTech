/**
 * A deck's overview: its sections as cards, and what it adds up to
 * (`DECK-001/T2`, `DECK-001/T4`).
 *
 * The read is the author's — `forAuthor` — because the overview is where a deck
 * is written rather than where it is read: it shows the latest revision whether
 * or not anything is published, and it shows the speaker context, which reaches
 * no investor at all (`DECK-001` §3). That it composes `visibleTo` and refuses a
 * non-admin is `forAuthor`'s, not a second rule written here (`CMS-R03`).
 *
 * **Only a deck has one.** A report and an update are one document read top to
 * bottom; sections derived from their headings would be a view of something
 * nobody asked to see in parts. So this answers `null` for anything that is not
 * a deck, and the surface offers the link for nothing else — the refusal is here
 * rather than at the page, because a page that decides what it may show is a page
 * the next caller has to be trusted to copy.
 *
 * An identifier that is not one answers `null` too, the same `null` a missing
 * item gets (`CMS-006` §6): `forAuthor` compares against a uuid column, which
 * would raise `22P02` carrying the value supplied (`DATA-R02`).
 */

import type { Actor } from '../auth/gate';

import { validateBlocks } from './blocks';
import { isItemId } from './items';
import { forAuthor } from './read';
import { type DeckTotals, type SectionCard, cardsOf, deriveSections, totalsOf } from './sections';

/** What the overview page renders: the deck it is of, its cards and its totals. */
export interface DeckOverview {
  readonly title: string;
  /** Whether a reader sees anything today, so the page can say what it is showing. */
  readonly published: boolean;
  readonly cards: SectionCard[];
  readonly totals: DeckTotals;
}

/**
 * The overview of the deck `itemId`, or `null` when there is none to show —
 * the item is not there, is not a deck, or this actor may not author it.
 */
export async function overviewFor(itemId: string, actor: Actor): Promise<DeckOverview | null> {
  if (!isItemId(itemId)) {
    return null;
  }

  const view = await forAuthor(itemId, actor);
  if (view === null || view.item.type !== 'deck') {
    return null;
  }

  const sections = deriveSections(validateBlocks(view.revision.blocks));

  return {
    title: view.item.title,
    published: view.item.current_revision_id !== null,
    cards: cardsOf(sections),
    totals: totalsOf(sections),
  };
}
