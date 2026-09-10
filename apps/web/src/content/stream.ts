/**
 * The update stream (`POST-002`, `CMS-R03`, `DATA-R05`).
 *
 * Updates are the one content type with a genuinely public audience, so this is
 * where the room's access model meets the public page. The room's stream
 * (`INV-001`) and the gateway's news (`SITE-005`) are the same query with a
 * different reader — the public page passes a null reader, and the predicate
 * reduces to public-and-published inside `access.ts`'s `visibleTo` rather than in
 * a second, simpler query written for the public page, because a second query is
 * a second place to forget the published check (`POST-002/T4`). Composing that
 * one predicate as the read's own clause is `POST-002/T1`, and it lives in this
 * module for the reason every content read does: it is the one place a content
 * table may be named (`CMS-006/T5`).
 *
 * Paging is by keyset on `(published_at, id)`, never by offset (`POST-002/T2`).
 * With an offset, an update published while a reader is on the first page shifts
 * every later page by one and silently skips an entry — in a reverse-chronological
 * feed, the most recent thing they had not read. The composite cursor also settles
 * ties when two updates share a second. Ordering is by publication, not creation
 * (`POST-002/T3`): an update drafted in March and published in June belongs in
 * June, where the reader looks for it.
 *
 * A page is twenty entries; the query asks for twenty-one so the caller knows a
 * next page exists without a second count query, and the twenty-first becomes the
 * next cursor rather than an entry.
 */

import { sql } from 'kysely';

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import { visibleTo } from './access';
import type { ContentItem } from './items';

/** How many entries a page shows. The query fetches one more to detect a next page. */
export const STREAM_PAGE_SIZE = 20;

/** A keyset cursor: the publication time and id of the last entry a page returned. */
export interface StreamCursor {
  readonly publishedAt: Date;
  readonly id: string;
}

/** One update in the stream, with the publication time the order and cursor use. */
export interface StreamEntry {
  readonly item: ContentItem;
  readonly publishedAt: Date;
}

/** A page of the stream and the cursor for the next, or `null` when this is the last. */
export interface StreamPage {
  readonly entries: StreamEntry[];
  readonly nextCursor: StreamCursor | null;
}

/**
 * The published updates this reader may see, newest publication first, one page
 * at a time. Passing `null` is the gateway's anonymous read; passing the cursor
 * a previous page returned continues from exactly where it ended.
 */
export async function updateStream(reader: Actor | null, cursor?: StreamCursor): Promise<StreamPage> {
  let query = getDb()
    .selectFrom('content_items')
    .innerJoin('content_revisions', (join) =>
      join
        .onRef('content_revisions.id', '=', 'content_items.current_revision_id')
        .onRef('content_revisions.item_id', '=', 'content_items.id'),
    )
    .selectAll('content_items')
    .select('content_revisions.published_at as published_at')
    .where('content_items.type', '=', 'update')
    .where(visibleTo(reader))
    .where('content_revisions.published_at', 'is not', null);

  if (cursor !== undefined) {
    // Row-value keyset: strictly older than the cursor by publication, the id
    // settling a tie. A parameterised comparison, so the cursor is never spliced
    // into SQL as text.
    query = query.where(
      sql<boolean>`(content_revisions.published_at, content_items.id) < (${cursor.publishedAt}, ${cursor.id})`,
    );
  }

  const rows = await query
    .orderBy('content_revisions.published_at', 'desc')
    .orderBy('content_items.id', 'desc')
    .limit(STREAM_PAGE_SIZE + 1)
    .execute();

  const hasNext = rows.length > STREAM_PAGE_SIZE;
  const pageRows = hasNext ? rows.slice(0, STREAM_PAGE_SIZE) : rows;

  const entries = pageRows.map(({ published_at, ...item }) => ({
    item,
    // published_at is non-null: the query selects only rows whose pointer names a
    // published revision, so the column is never null on a returned row.
    publishedAt: published_at as Date,
  }));

  const last = entries[entries.length - 1];
  const nextCursor = hasNext && last !== undefined ? { publishedAt: last.publishedAt, id: last.item.id } : null;

  return { entries, nextCursor };
}
