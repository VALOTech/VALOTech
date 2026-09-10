/**
 * Report-specific reads and read state (`RPT-001`, `RPT-002`).
 *
 * A report is read as a series: an investor files the Q3 report beside the Q2 one
 * and reads the difference. Three functions here serve that, and each composes
 * `visibleTo` like every content read (`CMS-R03`).
 *
 * `prefillStructureFor` opens a new report with the previous report's section
 * headings rather than a blank page (`RPT-001/T2`) — the same shape and none of
 * its text, because a report that keeps last quarter's words until somebody
 * notices is the failure it avoids. "The previous report" is the published one of
 * the greatest period below this, so a gap falls back to the last that exists; the
 * first report, having no predecessor, opens with a suggested structure, and
 * either way the headings are ordinary blocks an author may delete, not a form.
 *
 * `currentReport` is the report the room presents as current: the published one of
 * the greatest period the reader may read (`RPT-002/T4`), by period rather than by
 * publication date. `markReportRead` records that an investor has opened a report
 * (`RPT-002/T6`) — the one piece of behavioural data the archive needs to answer
 * "have I read this", deleted with the account (`DATA-002`).
 */

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import { visibleTo } from './access';
import { type Block, validateBlocks } from './blocks';
import type { ContentItem } from './items';

/**
 * The headings a first report opens with (`RPT-001` §3): a starting point, not a
 * schema. Each is an ordinary level-2 heading, and an author may delete or
 * reorder any of them.
 */
export const DEFAULT_REPORT_STRUCTURE: readonly Block[] = [
  { type: 'heading', level: 2, text: 'The period in one paragraph' },
  { type: 'heading', level: 2, text: 'Where each product stands' },
  { type: 'heading', level: 2, text: 'What shipped' },
  { type: 'heading', level: 2, text: 'Numbers' },
  { type: 'heading', level: 2, text: 'What we are working on next' },
  { type: 'heading', level: 2, text: 'Asks' },
];

/**
 * The heading blocks a new report for `period` opens with: the previous published
 * report's headings, in order and with none of its text, or the suggested
 * structure when there is no previous report.
 */
export async function prefillStructureFor(period: string, reader: Actor | null): Promise<Block[]> {
  const previous = await getDb()
    .selectFrom('content_items')
    .innerJoin('content_revisions', (join) =>
      join
        .onRef('content_revisions.id', '=', 'content_items.current_revision_id')
        .onRef('content_revisions.item_id', '=', 'content_items.id'),
    )
    .select('content_revisions.blocks as blocks')
    .where('content_items.type', '=', 'report')
    .where('content_items.period', '<', period)
    .where('content_revisions.published_at', 'is not', null)
    .where(visibleTo(reader))
    .orderBy('content_items.period', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (previous === undefined) {
    return [...DEFAULT_REPORT_STRUCTURE];
  }

  return validateBlocks(previous.blocks).filter((block) => block.type === 'heading');
}

/**
 * The room's current report: the published report of the greatest period this
 * reader may read (`RPT-002/T4`).
 *
 * By period, not by publication date — the two differ when a late report is
 * published after a newer one, and the period is what an investor means by "the
 * latest" (`RPT-002` §3). It composes `visibleTo` (`CMS-R03`), so a reader who
 * may not see the most recent period gets the most recent they may; the published
 * pointer is required explicitly because an admin's predicate is `TRUE` and would
 * otherwise let a draft be current.
 */
export async function currentReport(reader: Actor | null): Promise<ContentItem | null> {
  const report = await getDb()
    .selectFrom('content_items')
    .selectAll('content_items')
    .where('content_items.type', '=', 'report')
    .where('content_items.current_revision_id', 'is not', null)
    .where(visibleTo(reader))
    .orderBy('content_items.period', 'desc')
    .limit(1)
    .executeTakeFirst();

  return report ?? null;
}

/**
 * Record that an account has opened a report (`RPT-002/T6`).
 *
 * The row is the whole of "have I read this" in the archive, so the first open
 * writes it and a re-open changes nothing — there is one read state, not a visit
 * count, and no last-opened time to keep. The read time is the database's. The
 * caller records this once the reader has been served the report; the row is
 * deleted with the account (`DATA-002`).
 */
export async function markReportRead(accountId: string, itemId: string): Promise<void> {
  await getDb()
    .insertInto('report_reads')
    .values({ account_id: accountId, item_id: itemId })
    .onConflict((oc) => oc.columns(['account_id', 'item_id']).doNothing())
    .execute();
}
