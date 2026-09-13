/**
 * Report-specific reads and read state (`RPT-001`, `RPT-002`).
 *
 * A report is read as a series: an investor files the Q3 report beside the Q2 one
 * and reads the difference. The reads that answer a reader serve that, and each
 * composes `visibleTo` like every content read (`CMS-R03`).
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
 *
 * `draftReport` is the other staff read: the report of the greatest period with
 * an unpublished revision, which is what an author means by "the report I am
 * writing". It composes no audience predicate where `currentReport` does,
 * because a draft reaches no reader at all and asking who may see one is a
 * question with no answer (`POST-001/T5`).
 *
 * `reportWithdrawal` is the exception and is a staff read: it answers what
 * withdrawing a report would do to the archive and to what the room presents as
 * current (`RPT-002/T5`), and the question has no reader in it — an admin is
 * asking what everyone will see, not what they themselves may.
 */

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import { visibleTo } from './access';
import { type Block, validateBlocks } from './blocks';
import type { ContentItem } from './items';
import { withdrawReturnsTo } from './publish';
import { DEFAULT_REPORT_STRUCTURE } from './report-structure';

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
 * The report an author is currently drafting: the one of the greatest period that
 * has an unpublished revision open (`POST-001/T5`).
 *
 * A **staff** read, like `reportWithdrawal` and unlike `currentReport`, and the
 * difference is the question rather than the caller. `currentReport` asks what a
 * reader is shown and therefore composes `visibleTo`; this asks what is being
 * written, which is not a thing any reader is shown at all — a draft reaches
 * nobody until it is published (`CMS-004`). Composing an audience predicate here
 * would be asking who may read the unpublished, which is a question with no
 * answer.
 *
 * Null when no report has an open draft, and that is an ordinary state rather
 * than an error: between publishing one report and starting the next there is
 * nothing being drafted. The caller offers no move then and says so, because a
 * control that appears and does nothing is worse than one that is honestly
 * absent.
 *
 * By period rather than by when the draft was touched, for `currentReport`'s
 * reason: the period is what a person means by "the report I am writing", and a
 * late report drafted after a newer one is still the older period's.
 */
export async function draftReport(): Promise<ContentItem | null> {
  const report = await getDb()
    .selectFrom('content_items')
    .selectAll('content_items')
    .where('content_items.type', '=', 'report')
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('content_revisions')
          .select('content_revisions.id')
          .whereRef('content_revisions.item_id', '=', 'content_items.id')
          .where('content_revisions.published_at', 'is', null),
      ),
    )
    .orderBy('content_items.period', 'desc')
    .limit(1)
    .executeTakeFirst();

  return report ?? null;
}

/** What withdrawing this report would do to the archive and to what is current. */
export interface ReportWithdrawal {
  /** The period this report holds. */
  readonly period: string;
  /** Whether the period is left with no published report at all. */
  readonly becomesGap: boolean;
  /** The report the room would present as current afterwards, or `null` for none. */
  readonly becomesCurrent: { readonly period: string; readonly title: string } | null;
}

/**
 * What withdrawing the published report `itemId` would do, or `null` when it is
 * not a published report (`RPT-002/T5`).
 *
 * `RPT-002` §3 asks the confirmation to say two things, because "withdraw" reads
 * as "hide from the list" and is also "the room now presents a different
 * document as current". Both are read here rather than assembled at the surface,
 * so the sentence cannot describe an outcome the store would not produce.
 *
 * **The period is not always a gap, and the design's sentence assumes it is.**
 * Withdrawing moves the pointer to the revision published before this one
 * (`CMS-004/T5`), so a report on its second published revision stays published
 * on its first: the archive still holds that period and only the words change
 * back. The gap is the case where nothing earlier was published, which is what
 * `withdrawReturnsTo` answering `null` means — so it is asked rather than
 * assumed, and a confirmation promising a gap that will not appear is not
 * written.
 *
 * What becomes current is read with an admin's reach, because the question is
 * what the room will present and not what one reader may see; `currentReport`
 * would otherwise need a reader nobody is asking about. It is taken after
 * excluding this item, since this is the one being withdrawn.
 */
export async function reportWithdrawal(itemId: string): Promise<ReportWithdrawal | null> {
  const item = await getDb()
    .selectFrom('content_items')
    .select(['period', 'type', 'current_revision_id'])
    .where('id', '=', itemId)
    .executeTakeFirst();

  if (item === undefined || item.type !== 'report' || item.period === null) {
    return null;
  }
  if (item.current_revision_id === null) {
    return null;
  }

  const becomesGap = (await withdrawReturnsTo(itemId)) === null;

  // A report still holding its period stays the room's current one, so nothing
  // takes its place and there is no second document to name.
  const successor = becomesGap
    ? await getDb()
        .selectFrom('content_items')
        .innerJoin('content_revisions', (join) =>
          join
            .onRef('content_revisions.id', '=', 'content_items.current_revision_id')
            .onRef('content_revisions.item_id', '=', 'content_items.id'),
        )
        .select(['content_items.period as period', 'content_items.title as title'])
        .where('content_items.type', '=', 'report')
        .where('content_items.id', '!=', itemId)
        .where('content_items.current_revision_id', 'is not', null)
        .orderBy('content_items.period', 'desc')
        .limit(1)
        .executeTakeFirst()
    : undefined;

  return {
    period: item.period,
    becomesGap,
    becomesCurrent:
      successor === undefined || successor.period === null
        ? null
        : { period: successor.period, title: successor.title },
  };
}

/**
 * Record that an account has opened a report (`RPT-002/T6`).
 *
 * The row is the whole of "have I read this" in the archive, so the first open
 * writes it and a re-open changes nothing — there is one read state, not a visit
 * count, and no last-opened time to keep. The read time is the database's. The
 * caller records this once the reader has been served the report; the row is
 * deleted with the account (`DATA-002`), and an account that has objected to
 * read-tracking is not recorded at all (`LEGAL-GLOBAL-001/T3`).
 */
export async function markReportRead(accountId: string, itemId: string): Promise<void> {
  const db = getDb();

  // Honour a read-tracking objection: the account asked not to be tracked, so
  // there is nothing to record (`LEGAL-GLOBAL-001/T3`, `DATA-R03`).
  const account = await db
    .selectFrom('accounts')
    .select('read_tracking_objected')
    .where('id', '=', accountId)
    .executeTakeFirst();
  if (account?.read_tracking_objected) {
    return;
  }

  await db
    .insertInto('report_reads')
    .values({ account_id: accountId, item_id: itemId })
    .onConflict((oc) => oc.columns(['account_id', 'item_id']).doNothing())
    .execute();
}
