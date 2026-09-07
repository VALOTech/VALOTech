/**
 * Reading the audit trail, for the admin view that shows it (`SEC-002`).
 *
 * The only order this table is ever read in is the order things happened, and
 * the identity `id` gives that without trusting a clock — a row's `at` is the
 * database's, but two rows in the same transaction share an instant and not an
 * `id`. So newest-first is `id` descending, and the page shows the most recent
 * window rather than the whole trail, which is unbounded and append-only.
 *
 * There is no write here and there never will be: the trail is append-only in
 * the database (`SEC-002/T1`), the view has no edit or delete control, and a
 * control that does not exist cannot be reached by a bug.
 */

import type { Selectable } from 'kysely';

import { getDb } from '../db/index';
import type { AuditAction, AuditTable } from '../db/types';

/** One audit row, as a reader of the trail receives it. */
export type AuditRow = Selectable<AuditTable>;

/** The filters the admin view offers, each narrowing and none required. */
export interface AuditFilter {
  actorId?: string;
  subjectId?: string;
  action?: AuditAction;
}

/**
 * The most recent audit rows, newest first, narrowed by whichever filters are
 * given. `limit` bounds the window the view renders; the trail itself is not
 * bounded.
 */
export async function recentAudit(filter: AuditFilter, limit: number): Promise<AuditRow[]> {
  let query = getDb().selectFrom('audit').selectAll();

  if (filter.actorId !== undefined) {
    query = query.where('actor_id', '=', filter.actorId);
  }
  if (filter.subjectId !== undefined) {
    query = query.where('subject_id', '=', filter.subjectId);
  }
  if (filter.action !== undefined) {
    query = query.where('action', '=', filter.action);
  }

  return query.orderBy('id', 'desc').limit(limit).execute();
}
