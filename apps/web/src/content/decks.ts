/**
 * Reading a deck at the version a reader is entitled to (`DECK-002`, `CMS-R03`).
 *
 * A grantee reads the version their grant pins, or the current published one when
 * it does not pin (`DECK-002/T2`); an admin and a public reader read the current
 * one. Access is the one predicate (`access.ts`'s `visibleTo`) composed here as
 * everywhere, so a reader who may not see the deck gets nothing regardless of any
 * pin, and this read lives in the content module for the reason every content
 * read does (`CMS-006/T5`).
 *
 * A pin keeps resolving after a withdrawal (`DECK-002/T6`): withdrawing moves the
 * item's pointer but never deletes the revision or clears its version, so the
 * revision the pin names is still there to be read.
 *
 * What it returns is the reading view, so a heading's speaker context is stripped
 * from the blocks before they leave here (`DECK-001/T5`): the context is what the
 * presenter says and the investor never reads, and stripping it in this function
 * rather than in a template is what keeps a reading surface from serving it by
 * forgetting to.
 *
 * Once a reader has been shown a version, `recordDeckRead` writes which one and
 * when (`DECK-002/T4`) — the record that answers, later and by somebody with a
 * lawyer, what an investor was actually shown.
 */

import { sql } from 'kysely';

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';

import { visibleTo } from './access';
import { withoutSpeakerContext } from './blocks';
import type { ContentItem, ContentRevision } from './items';

/** A deck, the revision a reader sees, and that revision's published version. */
export interface DeckView {
  readonly item: ContentItem;
  readonly revision: ContentRevision;
  readonly version: number | null;
}

/** The revision's columns, aliased so the join in the current-version path is unambiguous. */
const REVISION_COLUMNS = [
  'content_revisions.id as id',
  'content_revisions.item_id as item_id',
  'content_revisions.blocks as blocks',
  'content_revisions.author_id as author_id',
  'content_revisions.created_at as created_at',
  'content_revisions.published_at as published_at',
  'content_revisions.version as version',
] as const;

/** The pinned version on this reader's grant, or null when there is no grant or no pin. */
async function pinFor(deckId: string, reader: Actor | null): Promise<number | null> {
  if (reader === null) {
    return null;
  }
  const grant = await getDb()
    .selectFrom('content_grants')
    .select('pinned_version')
    .where('item_id', '=', deckId)
    .where('account_id', '=', reader.id)
    .executeTakeFirst();
  return grant?.pinned_version ?? null;
}

export async function deckRevisionFor(deckId: string, reader: Actor | null): Promise<DeckView | null> {
  // Access first, and the same predicate as every other read: a reader who may
  // not see this deck gets nothing, whatever a pin might otherwise resolve to.
  const item = await getDb()
    .selectFrom('content_items')
    .selectAll('content_items')
    .where('content_items.id', '=', deckId)
    .where('content_items.type', '=', 'deck')
    .where(visibleTo(reader))
    .executeTakeFirst();
  if (item === undefined) {
    return null;
  }

  const pin = await pinFor(deckId, reader);

  const row =
    pin === null
      ? await getDb()
          .selectFrom('content_revisions')
          .innerJoin('content_items', 'content_items.current_revision_id', 'content_revisions.id')
          .where('content_items.id', '=', deckId)
          .where('content_revisions.published_at', 'is not', null)
          .select(REVISION_COLUMNS)
          .executeTakeFirst()
      : await getDb()
          .selectFrom('content_revisions')
          .where('item_id', '=', deckId)
          .where('version', '=', pin)
          .where('published_at', 'is not', null)
          .select(REVISION_COLUMNS)
          .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const { version, ...revision } = row;
  // The reading view is the investor's document, so speaker context is stripped
  // here (`DECK-001/T5`) and no reading surface can serve it by omission. The
  // overview and the presenter print read the revision directly, keeping it.
  return { item, revision: { ...revision, blocks: withoutSpeakerContext(revision.blocks) }, version };
}

/**
 * Record that an account opened a version of a deck (`DECK-002/T4`).
 *
 * One row per account per version: the first open sets both timestamps, and each
 * later open moves `last_opened_at` to now while `first_opened_at` stays, so the
 * row answers which version was shown and when it was first and last opened, and
 * nothing more (`DECK-002` §6). The caller records this only once `deckRevisionFor`
 * has confirmed the reader may see the deck and resolved which version they were
 * shown. The timestamps are the database's, never the caller's, so the record is
 * truthful about when without trusting whoever wrote it. The row is deleted with
 * the account (`DATA-002`), and an account that has objected to read-tracking is
 * not recorded at all (`LEGAL-GLOBAL-001/T3`).
 */
export async function recordDeckRead(accountId: string, deckId: string, version: number): Promise<void> {
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
    .insertInto('deck_reads')
    .values({ account_id: accountId, deck_id: deckId, version })
    .onConflict((oc) => oc.columns(['account_id', 'deck_id', 'version']).doUpdateSet({ last_opened_at: sql`now()` }))
    .execute();
}

/** A deck an active investor holds a grant to but has never opened — an item for the admin landing. */
export interface UnopenedDeckGrant {
  readonly deckTitle: string;
  readonly accountName: string;
  readonly grantedAt: Date;
}

/**
 * Every deck grant an active investor has never opened, longest-waiting first
 * (`ADMIN-002/T2`). The console's landing surface reads it to name one thing that
 * needs attention: an investor was given a deck and has not looked at it.
 *
 * A grant counts as opened once any `deck_reads` row exists for the pair, whatever
 * version — seeing the deck is what a read records, and a version the reader was
 * never served is not one they failed to open. Only `active` accounts count: an
 * invited account cannot sign in to open anything and a suspended one may not, so
 * an unopened grant of theirs is expected rather than a thing to act on. Only deck
 * items count; a grant to another type is not a deck a reader opens. It is an
 * admin-wide read, called under the `/admin` gate, and lives in the content module
 * because it reads `content_grants` (`CMS-006/T5`'s access boundary).
 */
export async function decksGrantedButNeverOpened(): Promise<UnopenedDeckGrant[]> {
  const rows = await getDb()
    .selectFrom('content_grants')
    .innerJoin('content_items', 'content_items.id', 'content_grants.item_id')
    .innerJoin('accounts', 'accounts.id', 'content_grants.account_id')
    .leftJoin('deck_reads', (join) =>
      join
        .onRef('deck_reads.deck_id', '=', 'content_grants.item_id')
        .onRef('deck_reads.account_id', '=', 'content_grants.account_id'),
    )
    .where('content_items.type', '=', 'deck')
    .where('accounts.state', '=', 'active')
    .where('deck_reads.account_id', 'is', null)
    .select([
      'content_items.title as deckTitle',
      'accounts.name as accountName',
      'content_grants.granted_at as grantedAt',
    ])
    .orderBy('content_grants.granted_at')
    .execute();

  return rows.map((row) => ({
    deckTitle: row.deckTitle,
    accountName: row.accountName,
    grantedAt: row.grantedAt,
  }));
}
