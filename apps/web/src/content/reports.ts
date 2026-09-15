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
 * `currentReport` is the report the hall presents as current: the published one of
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
 * withdrawing a report would do to the archive and to what the hall presents as
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
 * The hall's current report: the published report of the greatest period this
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

/** One row of the archive: a period, and the report filling it or nothing. */
export interface ArchiveEntry {
  readonly period: string;
  /** The report, or `null` where the period is a gap. */
  readonly report: ContentItem | null;
  /**
   * When the report was published, or `null` for a gap.
   *
   * The revision's, not the item's `updated_at`: an audience change or a
   * correction moves the row without republishing anything, and a list that
   * dated a report by the last time somebody touched it would say a report from
   * two years ago was published this morning.
   */
  readonly publishedAt: Date | null;
  /** When this reader first opened it, or `null` for unread and for a gap. */
  readonly readAt: Date | null;
}

/** A year of the archive, newest period first. */
export interface ArchiveYear {
  readonly year: string;
  readonly entries: readonly ArchiveEntry[];
}

/** The quarter or month a period names, or `null` when it is neither. */
function slotOf(period: string): { readonly year: string; readonly index: number } | null {
  const match = /^([0-9]{4})-(Q[1-4]|0[1-9]|1[0-2])$/.exec(period);
  if (match === null) {
    return null;
  }

  const [, year, slot] = match;
  return { year: year as string, index: Number((slot as string).replace('Q', '')) };
}

/** Whether a period names a quarter rather than a month. */
function isQuarter(period: string): boolean {
  return /^[0-9]{4}-Q[1-4]$/.test(period);
}

/**
 * How many periods a year holds under the cadence this archive is kept in, or
 * `null` when that cannot be known.
 *
 * The period vocabulary admits a quarter or a month (`RPT-002` §6), so the set a
 * year is missing from cannot be assumed — eleven fabricated gaps is what
 * assuming quarters does to a year reported monthly, and the design calls a gap
 * *information*, which makes a fabricated one the worst kind. The cadence is read
 * from the whole archive rather than per year, because a year holding no reports
 * has no cadence of its own and would otherwise need one invented for it.
 *
 * An archive kept both ways is the one case where the expected set is genuinely
 * unknown, so nothing is asserted: the reports are listed and no gap is drawn.
 */
function expectedSlots(periods: readonly string[]): number | null {
  const quarters = periods.filter(isQuarter).length;
  if (quarters === periods.length) {
    return 4;
  }

  return quarters === 0 ? 12 : null;
}

function periodName(year: string, index: number, quarterly: boolean): string {
  return quarterly ? `${year}-Q${index}` : `${year}-${String(index).padStart(2, '0')}`;
}

export async function reportArchive(reader: Actor | null): Promise<readonly ArchiveYear[]> {
  const reports = await getDb()
    .selectFrom('content_items')
    .innerJoin('content_revisions', 'content_revisions.id', 'content_items.current_revision_id')
    .selectAll('content_items')
    .select('content_revisions.published_at as published_at')
    .where('content_items.type', '=', 'report')
    .where('content_items.period', 'is not', null)
    .where(visibleTo(reader))
    .orderBy('content_items.period', 'desc')
    .execute();

  if (reports.length === 0) {
    return [];
  }

  const readAt = new Map<string, Date>();
  if (reader !== null) {
    const rows = await getDb()
      .selectFrom('report_reads')
      .select(['item_id', 'read_at'])
      .where('account_id', '=', reader.id)
      .execute();
    for (const row of rows) {
      readAt.set(row.item_id, row.read_at);
    }
  }

  const byPeriod = new Map<string, (typeof reports)[number]>();
  for (const report of reports) {
    if (report.period !== null) {
      byPeriod.set(report.period, report);
    }
  }

  const earliest = slotOf(reports[reports.length - 1]?.period ?? '');
  const newest = slotOf(reports[0]?.period ?? '');
  const now = new Date();
  const thisYear = String(now.getUTCFullYear());

  // The years the list spans, newest first. It runs to the period we are in,
  // because one that has arrived with nothing published is the gap an investor
  // most wants to see — and past it when a report is filed for a period still to
  // come, because a list that stopped at today would drop a document the reader
  // may read in order to keep a tidy range.
  const years: string[] = [];
  const endYear = Math.max(Number(thisYear), Number(newest?.year ?? thisYear));
  for (let y = endYear; y >= Number(earliest?.year ?? thisYear); y -= 1) {
    years.push(String(y));
  }

  const everyPeriod = [...byPeriod.keys()];
  const slots = expectedSlots(everyPeriod);
  const quarterly = slots !== 12;

  return years.map((year) => {
    const held = everyPeriod.filter((period) => period.startsWith(`${year}-`));

    // Nothing is drawn past the period we are in, and nothing before the reader's
    // first report: a gap either side of the range is a period the archive never
    // claimed to cover. The exception is a period still to come that already
    // holds a report — it is drawn because it exists, while the empty periods
    // after it are not, since a gap in the future is not a gap at all.
    const heldHere = held.map((period) => slotOf(period)?.index ?? 0);
    const newestHeld = heldHere.length === 0 ? 0 : Math.max(...heldHere);
    const current = quarterly ? Math.floor(now.getUTCMonth() / 3) + 1 : now.getUTCMonth() + 1;
    const last =
      slots === null
        ? 0
        : Number(year) < Number(thisYear)
          ? slots
          : Number(year) > Number(thisYear)
            ? newestHeld
            : Math.max(current, newestHeld);
    const first = slots !== null && year === earliest?.year ? earliest.index : 1;

    const drawn: ArchiveEntry[] = [];
    for (let index = last; index >= first; index -= 1) {
      const period = periodName(year, index, quarterly);
      const report = byPeriod.get(period) ?? null;
      drawn.push({
        period,
        report,
        publishedAt: report?.published_at ?? null,
        readAt: report === null ? null : (readAt.get(report.id) ?? null),
      });
    }

    // An archive kept both ways draws no slots, so the reports that exist are
    // listed and nothing is asserted about what is missing between them.
    const entries =
      slots === null
        ? held
            .sort((a, b) => b.localeCompare(a))
            .map((period) => {
              const report = byPeriod.get(period) ?? null;
              return {
                period,
                report,
                publishedAt: report?.published_at ?? null,
                readAt: report === null ? null : (readAt.get(report.id) ?? null),
              };
            })
        : drawn;

    return { year, entries };
  });
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
  /** The report the hall would present as current afterwards, or `null` for none. */
  readonly becomesCurrent: { readonly period: string; readonly title: string } | null;
}

/**
 * What withdrawing the published report `itemId` would do, or `null` when it is
 * not a published report (`RPT-002/T5`).
 *
 * `RPT-002` §3 asks the confirmation to say two things, because "withdraw" reads
 * as "hide from the list" and is also "the hall now presents a different
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
 * what the hall will present and not what one reader may see; `currentReport`
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

  // A report still holding its period stays the hall's current one, so nothing
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
