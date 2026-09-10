/**
 * Reading a deck at the version a reader is entitled to (`DECK-002`, `CMS-R03`).
 *
 * A grantee reads the version their grant pins, or the current published one when
 * it does not pin (`DECK-002/T2`); an admin and a public reader read the current
 * one. Access is the one predicate (`access.ts`'s `visibleTo`) composed here as
 * everywhere, so a reader who may not see the deck gets nothing regardless of any
 * pin, and this read lives in the content module for the reason every content
 * read does (`CMS-006/T5`).
 *
 * A pin keeps resolving after a withdrawal (`DECK-002/T6`): withdrawing moves the
 * item's pointer but never deletes the revision or clears its version, so the
 * revision the pin names is still there to be read.
 *
 * What it returns is the reading view, so a heading's speaker context is stripped
 * from the blocks before they leave here (`DECK-001/T5`): the context is what the
 * presenter says and the investor never reads, and stripping it in this function
 * rather than in a template is what keeps a reading surface from serving it by
 * forgetting to.
 */

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import { visibleTo } from './access';
import { withoutSpeakerContext } from './blocks';
import type { ContentItem, ContentRevision } from './items';

/** A deck, the revision a reader sees, and that revision's published version. */
export interface DeckView {
  readonly item: ContentItem;
  readonly revision: ContentRevision;
  readonly version: number | null;
}

/** The revision's columns, aliased so the join in the current-version path is unambiguous. */
const REVISION_COLUMNS = [
  'content_revisions.id as id',
  'content_revisions.item_id as item_id',
  'content_revisions.blocks as blocks',
  'content_revisions.author_id as author_id',
  'content_revisions.created_at as created_at',
  'content_revisions.published_at as published_at',
  'content_revisions.version as version',
] as const;

/** The pinned version on this reader's grant, or null when there is no grant or no pin. */
async function pinFor(deckId: string, reader: Actor | null): Promise<number | null> {
  if (reader === null) {
    return null;
  }
  const grant = await getDb()
    .selectFrom('content_grants')
    .select('pinned_version')
    .where('item_id', '=', deckId)
    .where('account_id', '=', reader.id)
    .executeTakeFirst();
  return grant?.pinned_version ?? null;
}

export async function deckRevisionFor(deckId: string, reader: Actor | null): Promise<DeckView | null> {
  // Access first, and the same predicate as every other read: a reader who may
  // not see this deck gets nothing, whatever a pin might otherwise resolve to.
  const item = await getDb()
    .selectFrom('content_items')
    .selectAll('content_items')
    .where('content_items.id', '=', deckId)
    .where('content_items.type', '=', 'deck')
    .where(visibleTo(reader))
    .executeTakeFirst();
  if (item === undefined) {
    return null;
  }

  const pin = await pinFor(deckId, reader);

  const row =
    pin === null
      ? await getDb()
          .selectFrom('content_revisions')
          .innerJoin('content_items', 'content_items.current_revision_id', 'content_revisions.id')
          .where('content_items.id', '=', deckId)
          .where('content_revisions.published_at', 'is not', null)
          .select(REVISION_COLUMNS)
          .executeTakeFirst()
      : await getDb()
          .selectFrom('content_revisions')
          .where('item_id', '=', deckId)
          .where('version', '=', pin)
          .where('published_at', 'is not', null)
          .select(REVISION_COLUMNS)
          .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const { version, ...revision } = row;
  // The reading view is the investor's document, so speaker context is stripped
  // here (`DECK-001/T5`) and no reading surface can serve it by omission. The
  // overview and the presenter print read the revision directly, keeping it.
  return { item, revision: { ...revision, blocks: withoutSpeakerContext(revision.blocks) }, version };
}
