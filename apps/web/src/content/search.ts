/**
 * Full-text search over the hall's published content (`CMS-007`, `CMS-R03`, `DATA-R05`).
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
 * hall of updates the newest match is nearly always the wanted one.
 *
 * **The filters are clauses on the same statement, not a pass over its rows.**
 * Kind, product, period and type compose with each other and with the words, and
 * a filter applied after the fetch would page wrongly — the second page of a
 * filtered list would be the second page of the unfiltered one with rows
 * missing, which reads to the person scrolling as content that vanished.
 *
 * **The search runs against the authored text, not the locale variants.** A
 * reader searching in Vietnamese for an English-authored report finds it by the
 * product name and the numbers rather than by its prose, which is a limitation
 * the field's own placeholder states rather than one the reader has to infer
 * from an empty result.
 */

import { sql } from 'kysely';

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import type { ContentProductTag, ContentType, ContentUpdateKind } from '../db/types';

import { visibleTo } from './access';
import type { ContentItem } from './items';

/**
 * What a reader has narrowed the hall by, beyond the words they typed.
 *
 * Every field is optional and `null` means the same as absent, because these
 * arrive from a query string where "not chosen" and "chosen as nothing" are the
 * same gesture and separating them would be a distinction only the code sees.
 */
export interface SearchFilters {
  readonly kind?: ContentUpdateKind | null;
  readonly product?: ContentProductTag | null;
  readonly period?: string | null;
  readonly type?: ContentType | null;
}

/**
 * Whether the reader has narrowed the hall at all.
 *
 * The hall shows its own stream until something narrows it, so this is the test
 * that decides which of the two a request is asking for. A query with no
 * searchable word in it does not count: typing a space is not a search.
 */
export function isNarrowed(query: string, filters: SearchFilters = {}): boolean {
  return (
    toPrefixQuery(query) !== '' ||
    [filters.kind, filters.product, filters.period, filters.type].some(
      (value) => value !== undefined && value !== null && value !== '',
    )
  );
}

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
 * the caller renders the hall's default rather than every item.
 */
export async function search(
  query: string,
  reader: Actor | null,
  filters: SearchFilters = {},
): Promise<ContentItem[]> {
  if (!isNarrowed(query, filters)) {
    return [];
  }

  let statement = getDb()
    .selectFrom('content_items')
    .innerJoin('content_revisions', (join) =>
      join
        .onRef('content_revisions.id', '=', 'content_items.current_revision_id')
        .onRef('content_revisions.item_id', '=', 'content_items.id'),
    )
    .selectAll('content_items')
    .where(visibleTo(reader))
    .where('content_revisions.published_at', 'is not', null);

  // Every narrowing is a clause on the one statement, never a pass over the rows
  // it returned. A filter applied after the fetch pages wrongly: the second page
  // of a filtered list would be the second page of the unfiltered one with rows
  // missing, which reads to the person scrolling as content that vanished.
  const prefixQuery = toPrefixQuery(query);
  if (prefixQuery !== '') {
    statement = statement.where(
      sql<boolean>`content_revisions.search @@ to_tsquery('simple', ${prefixQuery})`,
    );
  }
  // A filter with no words beside it narrows on its own: choosing a product and
  // typing nothing is a question ("what has happened to this one?"), and
  // answering it with the empty result an absent query gives would be a control
  // that does nothing until it is accompanied.
  if (filters.kind) {
    statement = statement.where('content_items.kind', '=', filters.kind);
  }
  if (filters.product) {
    statement = statement.where('content_items.product', '=', filters.product);
  }
  if (filters.period) {
    statement = statement.where('content_items.period', '=', filters.period);
  }
  if (filters.type) {
    statement = statement.where('content_items.type', '=', filters.type);
  }

  return statement
    .orderBy('content_revisions.published_at', 'desc')
    .orderBy('content_items.id', 'desc')
    .execute();
}
