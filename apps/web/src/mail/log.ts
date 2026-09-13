/**
 * Reading the mail log, for the admin view that shows it (`MAIL-002/T6`).
 *
 * The only order this table is read in is the order things happened, and the
 * identity `id` gives that without trusting a clock — two rows written in one
 * transaction share an instant and not an `id`. So newest-first is `id`
 * descending, and the view shows a window rather than the whole log, which grows
 * with every send and is bounded only by the two-year sweep (`MAIL-002/T5`).
 *
 * There is no write here and there never will be: a row is written by the send
 * that made it and moved by that send alone, and a view that could edit one
 * would be a view that could make a message that went look like one that did not
 * (`MAIL-DEC-02` turns on those states).
 *
 * **The body is not stored and is not readable here.** The subject, the
 * recipient and the time answer what the log is asked, and a table of messages
 * about named people with a two-year life is what not storing it avoids
 * (`DATA-R03`).
 *
 * The date filter is a day, inclusive at both ends, because that is the unit
 * somebody asks in — "what went out on the fourth". It is turned into a
 * half-open instant range here, so a row at 23:59 on the closing day is inside
 * it and no row can fall between two adjacent days.
 */

import type { Selectable } from 'kysely';

import { getDb } from '../db/index';
import type { MailLogTable } from '../db/types';

/** One mail-log row, with the recipient's name resolved for the view. */
export interface MailLogRow extends Selectable<MailLogTable> {
  /** The recipient's name. Never their address: the log is keyed by account (`DATA-R02`). */
  readonly recipientName: string;
}

/** The filters the admin view offers, each narrowing and none required. */
export interface MailLogFilter {
  /** The recipient, by account id. */
  accountId?: string;
  /** The first day to include, as `YYYY-MM-DD`. */
  from?: string;
  /** The last day to include, as `YYYY-MM-DD`. */
  to?: string;
}

/** The shape a day takes before it reaches a `timestamptz` comparison. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day as the instant it begins, in UTC, or `null` when the value is not one.
 *
 * `null` for an unusable value rather than a throw: a filter arrives from a
 * query string, and a date somebody mistyped should narrow nothing rather than
 * fail the page — the same way the audit view ignores an action outside its
 * vocabulary. `Date.parse` is checked as well as the shape, because `2026-02-31`
 * matches the shape and is not a day.
 */
export function dayStart(value: string | undefined): Date | null {
  if (value === undefined || !DAY.test(value)) {
    return null;
  }

  const at = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(at.getTime()) || !at.toISOString().startsWith(value) ? null : at;
}

/** The instant the day after `value` begins, which is the exclusive end of that day. */
export function dayEnd(value: string | undefined): Date | null {
  const start = dayStart(value);

  if (start === null) {
    return null;
  }

  const MILLISECONDS_PER_DAY = 86_400_000;

  return new Date(start.getTime() + MILLISECONDS_PER_DAY);
}

/**
 * The most recent rows, newest first, narrowed by whichever filters are given.
 * `limit` bounds the window the view renders; the log itself is not bounded.
 *
 * The join is inner, on the account the row names. That is not a narrowing: the
 * column is `NOT NULL` and cascades with the account, so a row without an
 * account does not exist — erasure takes the rows with the person (`DATA-R03`).
 */
export async function recentMail(filter: MailLogFilter, limit: number): Promise<MailLogRow[]> {
  let query = getDb()
    .selectFrom('mail_log')
    .innerJoin('accounts', 'accounts.id', 'mail_log.account_id')
    .selectAll('mail_log')
    .select('accounts.name as recipientName');

  if (filter.accountId !== undefined) {
    query = query.where('mail_log.account_id', '=', filter.accountId);
  }

  const from = dayStart(filter.from);
  if (from !== null) {
    query = query.where('mail_log.at', '>=', from);
  }

  const to = dayEnd(filter.to);
  if (to !== null) {
    query = query.where('mail_log.at', '<', to);
  }

  return query.orderBy('mail_log.id', 'desc').limit(limit).execute();
}
