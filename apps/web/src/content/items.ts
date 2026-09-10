/**
 * The content model: an item, its revisions, and the open draft (`CMS-001`).
 *
 * `content_items` names a thing; `content_revisions` holds every version of its
 * body; `content_items.current_revision_id` names the one a reader sees, and
 * publishing (`CMS-004`, later) moves that pointer. Nothing is edited in place
 * once published and nothing is soft-deleted — the pointer is the state, and the
 * archive is the side effect of never overwriting (`CMS-R01`, enforced by the
 * `content_revisions` immutability trigger the schema carries).
 *
 * This file is the write side an author reaches through: create an item, and
 * save drafts against it. Publishing, withdrawing and the reader-scoped reads
 * are their own tasks.
 */

import { type Selectable, sql } from 'kysely';

import { getDb } from '../db/index';
import type {
  ContentAudience,
  ContentItemsTable,
  ContentRevisionsTable,
  ContentType,
  ContentUpdateKind,
} from '../db/types';

import { validateBlocks } from './blocks';

export type ContentItem = Selectable<ContentItemsTable>;
// `search` is a database-internal full-text index (`CMS-007`): part of the table
// for the schema gate and matched in raw SQL by the search query, but never a
// value a caller reads, so the revision a caller holds omits it.
export type ContentRevision = Omit<Selectable<ContentRevisionsTable>, 'search'>;

/** A new content item. `audience` defaults to `investor` in the database. */
export interface NewItem {
  type: ContentType;
  slug: string;
  title: string;
  kind?: ContentUpdateKind | null;
  period?: string | null;
  audience?: ContentAudience;
}

/**
 * Create an item with no published revision yet: `current_revision_id` is null,
 * so a reader query — which consults only that pointer — returns nothing until a
 * draft is published. The database enforces the type's own shape (an update
 * carries a `kind`, a report a `period`), so an ill-formed combination is
 * refused here rather than stored.
 */
export async function createItem(input: NewItem): Promise<ContentItem> {
  return getDb()
    .insertInto('content_items')
    .values({
      type: input.type,
      slug: input.slug,
      title: input.title,
      kind: input.kind ?? null,
      period: input.period ?? null,
      ...(input.audience === undefined ? {} : { audience: input.audience }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Save a draft of an item's body, validating the blocks first so an invalid
 * document is refused rather than stored (`CMS-R04`).
 *
 * It replaces the open draft rather than accumulating a revision per save: a
 * revision is an editing session, not a keystroke, and the archive people care
 * about is the published one. The item row is locked first so two saves racing
 * cannot each miss the other's open draft and both insert — the one-open-draft
 * invariant (`CMS-001` §6) made to hold rather than assumed.
 *
 * The blocks are cast `text::jsonb` from the validated value's JSON, so the
 * parameter reaches the column as a parsed document rather than a JSON string
 * stored whole, and a raw array parameter is never sent where PostgreSQL would
 * read it as an array literal.
 */
export async function saveDraft(
  itemId: string,
  blocks: unknown,
  authorId: string,
): Promise<ContentRevision> {
  const validated = validateBlocksToJson(blocks);

  return getDb()
    .transaction()
    .execute(async (trx) => {
      await trx.selectFrom('content_items').select('id').where('id', '=', itemId).forUpdate().execute();

      const open = await trx
        .selectFrom('content_revisions')
        .select('id')
        .where('item_id', '=', itemId)
        .where('published_at', 'is', null)
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      if (open !== undefined) {
        return trx
          .updateTable('content_revisions')
          .set({ blocks: validated, author_id: authorId })
          .where('id', '=', open.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      return trx
        .insertInto('content_revisions')
        .values({ item_id: itemId, blocks: validated, author_id: authorId })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
}

function validateBlocksToJson(blocks: unknown) {
  const validated = validateBlocks(blocks);
  return sql<ContentRevision['blocks']>`${JSON.stringify(validated)}::jsonb`;
}
