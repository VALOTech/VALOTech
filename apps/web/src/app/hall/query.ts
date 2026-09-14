import {
  CONTENT_TYPES,
  CONTENT_UPDATE_KINDS,
  type ContentProductTag,
  type ContentType,
  type ContentUpdateKind,
  PORTFOLIO_PRODUCTS,
} from '../../db/types';

/** What the reader has narrowed the hall by, read from the URL. */
export interface HallQuery {
  readonly q: string;
  readonly kind: ContentUpdateKind | null;
  readonly product: ContentProductTag | null;
  readonly period: string | null;
  readonly type: ContentType | null;
}

/** The four narrowings a reader can drop, named as the form names them. */
export type Narrowing = 'period' | 'product' | 'kind' | 'type' | 'q';

/** A URL carries strings, arrays, or nothing; only a single non-empty string is a value. */
function one(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.trim() : '';
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * The reader's narrowing, as the URL states it (`CMS-007/T3`).
 *
 * **A value outside its vocabulary is read as absent, never passed through.**
 * The filters name database enums, and a hand-edited query string is the one
 * path by which a value the column cannot hold reaches a query — which would be
 * an error page where the honest answer is that nothing was filtered. The period
 * has no closed vocabulary and is passed as typed; it reaches the statement as a
 * bound parameter like every other value.
 */
export function readHallQuery(params: Record<string, string | string[] | undefined>): HallQuery {
  const period = one(params.period);
  return {
    q: one(params.q),
    kind: oneOf(one(params.kind), CONTENT_UPDATE_KINDS),
    product: oneOf(one(params.product), PORTFOLIO_PRODUCTS),
    period: period === '' ? null : period,
    type: oneOf(one(params.type), CONTENT_TYPES),
  };
}

/**
 * The narrowing an empty result should offer to drop (`CMS-007/T5`).
 *
 * **Narrowest means excludes the most, and the order is fixed rather than
 * computed.** A period names one quarter of one year; a product one of six; a
 * kind and a type one of three; the words are the reader's own and are offered
 * last, because dropping them turns a search into a browse and the reader
 * usually meant the words and mistrusted a filter. Computing which actually
 * excluded the most would mean running the query once per narrowing to find out,
 * which is four more statements to answer a question about an empty screen.
 */
export function narrowest(query: HallQuery): Narrowing | null {
  if (query.period !== null) return 'period';
  if (query.product !== null) return 'product';
  if (query.kind !== null) return 'kind';
  if (query.type !== null) return 'type';
  if (query.q !== '') return 'q';
  return null;
}

/**
 * The hall's own address with one narrowing removed, so the offer to widen is a
 * link rather than a second form. Absent values are left out entirely, which
 * keeps a widened URL as short as the reader's remaining choices.
 */
export function withoutNarrowing(query: HallQuery, drop: Narrowing): string {
  const params = new URLSearchParams();
  const keep = (name: Narrowing, value: string | null): void => {
    if (name !== drop && value !== null && value !== '') {
      params.set(name, value);
    }
  };
  keep('q', query.q);
  keep('type', query.type);
  keep('kind', query.kind);
  keep('product', query.product);
  keep('period', query.period);

  const search = params.toString();
  return search === '' ? '/hall' : `/hall?${search}`;
}
