/**
 * Full-text search over the room's published content (`CMS-007`, `CMS-R03`, `DATA-R05`).
 *
 * Search is the classic way a gated document leaks: an index built outside the
 * access model answers with a title and a first sentence to somebody who may not
 * read the document, quietly, in a feature nobody thinks of as a boundary. So the
 * query composes the one predicate (`access.ts`'s `visibleTo`) as its first
 * clause — the same function every read uses, not a copy — and lives in this
 * module for the same reason the reads do: it is the one place a content table
 * may be named (`CMS-006/T5`).
 *
 * It matches only the **published** revision, reached through the item's
 * published pointer. That join is what keeps a draft unfindable, including by its
 * author (`CMS-007/T4`): `visibleTo` answers an admin `TRUE`, unpublished items
 * included, because the author surfaces rely on it, so the predicate alone would
 * surface an admin's own drafts. The pointer join excludes them — the newest,
 * unpublished revision of an item is not the one `current_revision_id` names — and
 * the author finds their draft in the admin console instead.
 *
 * Matching is **prefix-based**, which is what a person typing three letters of a
 * product name wants and is why the query is `to_tsquery` over terms suffixed
 * `:*` rather than `websearch_to_tsquery`, which matches whole lexemes only. The
 * terms are the query split on whitespace and stripped to letters and digits, so
 * only a valid query — never the raw input — reaches `to_tsquery`, and a query
 * with no word in it matches nothing rather than becoming one that matches
 * everything. The tokeniser is `simple` rather than a stemmer, because the
 * content is in twenty possible languages and a stemmer for the wrong one is
 * worse than none. Results are ordered by recency, not by a relevance score: in a
 * room of updates the newest match is nearly always the wanted one.
 */

import { sql } from 'kysely';

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import { visibleTo } from './access';
import type { ContentItem } from './items';

/**
 * The `to_tsquery` prefix query for a reader's input: each whitespace-separated
 * term stripped to letters and digits and suffixed `:*`, joined with `&`. Only
 * these characters reach `to_tsquery`, so an input carrying its own operators
 * cannot become a syntax error or a different query than the reader meant. An
 * input with no word in it yields the empty string, which the caller reads as
 * "match nothing".
 */
export function toPrefixQuery(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((term) => term.length > 0)
    .map((term) => `${term}:*`)
    .join(' & ');
}

/**
 * The items a reader may read whose published body matches the query, newest
 * first. An empty query, or one with no searchable word in it, matches nothing —
 * the caller renders the room's default rather than every item.
 */
export async function search(query: string, reader: Actor | null): Promise<ContentItem[]> {
  const prefixQuery = toPrefixQuery(query);
  if (prefixQuery === '') {
    return [];
  }

  return getDb()
    .selectFrom('content_items')
    .innerJoin('content_revisions', (join) =>
      join
        .onRef('content_revisions.id', '=', 'content_items.current_revision_id')
        .onRef('content_revisions.item_id', '=', 'content_items.id'),
    )
    .selectAll('content_items')
    .where(visibleTo(reader))
    .where('content_revisions.published_at', 'is not', null)
    .where(sql<boolean>`content_revisions.search @@ to_tsquery('simple', ${prefixQuery})`)
    .orderBy('content_revisions.published_at', 'desc')
    .orderBy('content_items.id', 'desc')
    .execute();
}
