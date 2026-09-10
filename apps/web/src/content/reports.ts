/**
 * The structure a new report opens with (`RPT-001/T2`, `CMS-R04`).
 *
 * A report is read as a series: an investor files the Q3 report beside the Q2 one
 * and reads the difference. So a new report opens with the previous report's
 * section headings rather than a blank page (`RPT-001` §3) — the same shape and
 * none of its text, because a report that keeps last quarter's words until
 * somebody notices is the failure this avoids rather than one to introduce. The
 * first report, having no predecessor, opens with a suggested structure instead;
 * either way the headings are ordinary blocks an author may delete or reorder,
 * not a form.
 *
 * "The previous report" is the published report of the greatest period below this
 * one, so a skipped period falls back to the last that exists rather than to a
 * blank page. The read composes `visibleTo` like every content read (`CMS-R03`) —
 * an admin author sees every report — and the join to the published pointer is
 * what keeps an unpublished draft from being carried forward.
 */

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import { visibleTo } from './access';
import { type Block, validateBlocks } from './blocks';

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
