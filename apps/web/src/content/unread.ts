/**
 * How many published updates a reader has not opened (`INV-001/T1`).
 *
 * The hall's landing surface leads with this number because it is the question
 * the reader arrived with — what has happened since I last looked (`INV-001` §3).
 *
 * It counts against the per-account read state `RPT-002` defines rather than a
 * second table of its own, which is what `POST-002` §3 asks for: `report_reads`
 * is keyed by account and content item, and a content item is an update as
 * readily as a report, so an update somebody has opened is a row there like any
 * other. A second table would be a second place for the stream and the badge
 * above it to disagree about what has been read.
 *
 * **A reader who objected to read-tracking sees everything as new, and that is
 * the intended behaviour rather than an oversight.** Objection deletes their
 * rows and stops new ones being written (`LEGAL-GLOBAL-001/T3`), so nothing is
 * ever marked read and the count stands at everything they may see.
 * `LEGAL-GLOBAL-001` §3 settles this deliberately: the hall keeps working and
 * the unread marking degrades, which is the worse experience the person chose.
 * No branch here detects the flag — a count that quietly went silent for them
 * would be a second, unstated rule about who gets the feature.
 *
 * The visibility predicate is composed rather than rewritten (`CMS-006`,
 * `DATA-R05`), so the number and the stream it labels cannot disagree about
 * which updates this reader may see — a badge promising four when the list can
 * show three is the defect a second query would produce.
 */

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import { visibleTo } from './access';

/**
 * The published updates this reader may see and has not opened. `null` for an
 * anonymous reader, who has no read state at all: the gateway's public news
 * carries no unread of anybody's, and `0` would claim it did and found nothing.
 */
export async function unreadUpdateCount(reader: Actor | null): Promise<number | null> {
  if (reader === null) {
    return null;
  }

  // The left join is made an anti-join by the null check: an update carrying no
  // row for this account is one they have not opened. Counted in the database
  // rather than by fetching ids and subtracting, because this runs on every
  // landing render and only the number crosses the connection.
  const row = await getDb()
    .selectFrom('content_items')
    .innerJoin('content_revisions', (join) =>
      join
        .onRef('content_revisions.id', '=', 'content_items.current_revision_id')
        .onRef('content_revisions.item_id', '=', 'content_items.id'),
    )
    .leftJoin('report_reads', (join) =>
      join
        .onRef('report_reads.item_id', '=', 'content_items.id')
        .on('report_reads.account_id', '=', reader.id),
    )
    .where('content_items.type', '=', 'update')
    .where(visibleTo(reader))
    .where('content_revisions.published_at', 'is not', null)
    .where('report_reads.account_id', 'is', null)
    .select((eb) => eb.fn.countAll<string | number | bigint>().as('unread'))
    .executeTakeFirst();

  return row === undefined ? 0 : Number(row.unread);
}

/**
 * Whether this reader has opened one particular item (`INV-001/T1`).
 *
 * The hall's landing surface says of the current report whether it has been
 * read, which is one row rather than the count above — a reader with nothing
 * outstanding still wants to know they have seen this quarter's.
 *
 * A reader who objected to read-tracking is always answered `false`, and that
 * follows from the same choice the count follows: their rows are deleted and
 * none is written, so nothing has been opened as far as anything can tell
 * (`LEGAL-GLOBAL-001` §3). No branch detects the flag here either, for the same
 * reason it detects none there.
 */
export async function hasOpened(accountId: string, itemId: string): Promise<boolean> {
  const row = await getDb()
    .selectFrom('report_reads')
    .select('item_id')
    .where('account_id', '=', accountId)
    .where('item_id', '=', itemId)
    .executeTakeFirst();

  return row !== undefined;
}
