/**
 * The content model: an item, its revisions, and the open draft (`CMS-001`).
 *
 * `content_items` names a thing; `content_revisions` holds every version of its
 * body; `content_items.current_revision_id` names the one a reader sees, and
 * publishing (`CMS-004`, later) moves that pointer. Nothing is edited in place
 * once published and nothing is soft-deleted — the pointer is the state, and the
 * archive is the side effect of never overwriting (`CMS-R01`, enforced by the
 * `content_revisions` immutability trigger the schema carries).
 *
 * This file is the write side an author reaches through: create an item, and
 * save drafts against it. Publishing, withdrawing and the reader-scoped reads
 * are their own tasks.
 *
 * It also owns `media_refs` (`CMS-003` section 4): a block names a file, and
 * only the function that saves a revision knows which blocks the item carries
 * now and which it dropped, so only it can end a reference as well as begin one.
 */

import { type RawBuilder, type Selectable, type Transaction, sql } from 'kysely';

import { getDb } from '../db/index';
import type {
  ContentAudience,
  ContentItemsTable,
  ContentProductTag,
  ContentRevisionsTable,
  ContentType,
  ContentUpdateKind,
  Database,
} from '../db/types';

import { validateBlocks } from './blocks';

export type ContentItem = Selectable<ContentItemsTable>;
// `search` is a database-internal full-text index (`CMS-007`), matched in raw
// SQL by the search query; `version` is a deck's publication number (`DECK-002`)
// that `publish` sets and only a deck read consults. Both are on the table for
// the schema gate but are not values a general caller holds, so the revision a
// caller reads omits them until a reader that needs `version` (`DECK-003`) adds it.
export type ContentRevision = Omit<Selectable<ContentRevisionsTable>, 'search' | 'version'>;

/**
 * The shape an item's identifier takes, checked before a value reaches the uuid
 * column it would be compared against.
 *
 * PostgreSQL raises `22P02` on a value that is not one, and that error arrives
 * with the supplied value repeated in its message — so it cannot be reported or
 * logged without carrying the input with it (`DATA-R02`), and it reaches a
 * caller as a `500` describing an invariant rather than an answer about an item.
 * Asking the shape first turns both into the one refusal a caller can act on:
 * a garbage path is answered exactly as a missing item is (`CMS-006` §6).
 */
const ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether this string could name a content item at all. */
export function isItemId(value: string): boolean {
  return ITEM_ID.test(value);
}

/** A new content item. `audience` defaults to `investor` in the database. */
export interface NewItem {
  type: ContentType;
  slug: string;
  title: string;
  kind?: ContentUpdateKind | null;
  /** What an update is about (`POST-001/T3`); null is the author not having said. */
  product?: ContentProductTag | null;
  period?: string | null;
  audience?: ContentAudience;
}

/**
 * Create an item with no published revision yet: `current_revision_id` is null,
 * so a reader query — which consults only that pointer — returns nothing until a
 * draft is published. The database enforces the type's own shape (an update
 * carries a `kind`, a report a `period`), so an ill-formed combination is
 * refused here rather than stored.
 */
export async function createItem(input: NewItem): Promise<ContentItem> {
  return getDb()
    .insertInto('content_items')
    .values({
      type: input.type,
      slug: input.slug,
      title: input.title,
      kind: input.kind ?? null,
      product: input.product ?? null,
      period: input.period ?? null,
      ...(input.audience === undefined ? {} : { audience: input.audience }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** One item as the console lists it (`CMS-002/T8`). */
export interface ConsoleItem {
  readonly id: string;
  readonly type: ContentType;
  readonly title: string;
  readonly slug: string;
  readonly audience: ContentAudience;
  readonly kind: ContentUpdateKind | null;
  readonly period: string | null;
  /** True when a reader would see something today. */
  readonly published: boolean;
  /** True when later work exists that no reader has been shown. */
  readonly hasOpenDraft: boolean;
  /** Languages reviewed on the latest revision — the number a reader can be served. */
  readonly reviewedLocales: number;
  readonly changedAt: Date;
}

/**
 * Everything an admin has written, most recently changed first (`CMS-002/T8`).
 *
 * A staff read, and deliberately not a reader-scoped one: the question is what
 * the hall holds rather than what any one person may see, so it composes no
 * audience predicate and only the console reaches it, behind the admin gate
 * (`ADMIN-002/T1`). Every read that answers a *reader* still takes that reader
 * and composes `visibleTo` (`CMS-001/T6`).
 *
 * **Published and drafted are two facts, not one word.** An item can be published
 * and carry later work nobody has seen, and that is exactly the state an author
 * needs to find; a single status column would have to choose one of them and
 * would hide the other.
 *
 * The order is performed here rather than by the page, as the account list's is:
 * the most recently changed row is what somebody came back for. `changed_at` is
 * the newest revision's, falling back to the item's own `updated_at` for an item
 * with nothing written yet, so a fresh item does not sort as if it were ancient.
 */
export async function itemsForConsole(): Promise<ConsoleItem[]> {
  const rows = await getDb()
    .selectFrom('content_items')
    .select((eb) => [
      'content_items.id',
      'content_items.type',
      'content_items.title',
      'content_items.slug',
      'content_items.audience',
      'content_items.kind',
      'content_items.period',
      'content_items.current_revision_id',
      sql<Date>`greatest(
        content_items.updated_at,
        coalesce(
          (select max(r.created_at) from content_revisions r where r.item_id = content_items.id),
          content_items.updated_at
        )
      )`.as('changed_at'),
      eb
        .exists(
          eb
            .selectFrom('content_revisions')
            .select((revision) => revision.lit(1).as('one'))
            .whereRef('content_revisions.item_id', '=', 'content_items.id')
            .where('content_revisions.published_at', 'is', null),
        )
        .as('has_open_draft'),
      sql<number>`(
        select count(*) from content_locales l
        where l.state = 'reviewed'
          and l.revision_id = (
            select r.id from content_revisions r
            where r.item_id = content_items.id
            order by r.created_at desc, r.id
            limit 1
          )
      )`.as('reviewed_locales'),
    ])
    .orderBy('changed_at', 'desc')
    .orderBy('content_items.id')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    audience: row.audience,
    kind: row.kind,
    period: row.period,
    published: row.current_revision_id !== null,
    // Kysely types an EXISTS as `number | boolean` because a driver may hand back
    // either; PostgreSQL answers a real boolean here.
    hasOpenDraft: row.has_open_draft === true,
    reviewedLocales: Number(row.reviewed_locales ?? 0),
    changedAt: row.changed_at,
  }));
}

/**
 * Save a draft of an item's body, validating the blocks first so an invalid
 * document is refused rather than stored (`CMS-R04`).
 *
 * It replaces the open draft rather than accumulating a revision per save: a
 * revision is an editing session, not a keystroke, and the archive people care
 * about is the published one. The item row is locked first so two saves racing
 * cannot each miss the other's open draft and both insert — the one-open-draft
 * invariant (`CMS-001` §6) made to hold rather than assumed.
 *
 * The blocks are cast `text::jsonb` from the validated value's JSON, so the
 * parameter reaches the column as a parsed document rather than a JSON string
 * stored whole, and a raw array parameter is never sent where PostgreSQL would
 * read it as an array literal.
 *
 * The save also brings two dependants into step with the document, in the same
 * transaction and under the same lock: `media_refs`, so the row that decides
 * whether a file is servable and whether it may be deleted cannot disagree with
 * the document that decides it, and the revision's translations, which do not
 * outlive the words they were made from (`CMS-005` section 3).
 */
export async function saveDraft(
  itemId: string,
  blocks: unknown,
  authorId: string,
): Promise<ContentRevision> {
  const validated = validateBlocksToJson(blocks);

  return getDb()
    .transaction()
    .execute(async (trx) => {
      await trx.selectFrom('content_items').select('id').where('id', '=', itemId).forUpdate().execute();

      const open = await trx
        .selectFrom('content_revisions')
        .select('id')
        .where('item_id', '=', itemId)
        .where('published_at', 'is', null)
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      const revision =
        open === undefined
          ? await trx
              .insertInto('content_revisions')
              .values({ item_id: itemId, blocks: validated, author_id: authorId })
              .returningAll()
              .executeTakeFirstOrThrow()
          : await trx
              .updateTable('content_revisions')
              .set({ blocks: validated, author_id: authorId })
              .where('id', '=', open.id)
              .returningAll()
              .executeTakeFirstOrThrow();

      await syncMediaRefs(trx, itemId);
      await dropTranslations(trx, revision.id);

      return revision;
    });
}


/**
 * Raised when an item's stored draft cannot be read back.
 *
 * Distinct from `BlockValidationError` because the two name different documents
 * and ask different people to act. That one means the blocks a caller just
 * handed over are wrong, and the caller can fix them. This one means the
 * document already in the database no longer satisfies the validator — a rule
 * tightened since it was written — and the person holding the fragment can do
 * nothing about it, because they cannot see the document and may not own it.
 * Answering them `blocks[7].marks[0]: ...` would point at a block they have not
 * got.
 */
export class UnreadableDraftError extends Error {
  constructor() {
    super('that item\u2019s draft cannot be read back; open it in the editor');
    this.name = 'UnreadableDraftError';
  }
}

/**
 * Add blocks to the end of an item's open draft, keeping what is already there
 * (`POST-001/T5`).
 *
 * `saveDraft` replaces a draft with what an editor is holding, because an editor
 * *is* holding the whole document. This one is handed a fragment by a surface that
 * has never seen the rest — the update composer, moving text that got long
 * enough to be a report section — so replacing would delete a report to file a
 * paragraph.
 *
 * The read and the write are one transaction under the item's own lock, the same
 * lock `saveDraft` takes, which is what makes "keeping what is already there"
 * true under concurrency: two appends racing both land, in some order, and
 * neither overwrites the other. A read-then-write outside a lock would let the
 * second read the pre-append document and write back a version missing the first.
 *
 * Null when the item has no open draft. That is not a failure and not a place to
 * create one: an item whose latest revision is published is an item nobody is
 * writing, and quietly opening a draft on it would put an author's paragraph into
 * a document somebody had finished.
 *
 * The combined document is validated whole rather than the fragment alone, so a
 * block vocabulary that has moved on since the draft was written is caught here
 * rather than on the next save — and the two validations raise different errors
 * on purpose, because the fragment is the caller's and the stored draft is not.
 *
 * Media refs are brought into step exactly as a save brings them. **Translations
 * are dropped, and a caller has to say so.** `CMS-005` will not carry a
 * translation from one text to the next, and appending changes the text, so the
 * drop is right — but `saveDraft` justifies its own silence by the author being
 * in the editor where the grid shows the loss, and that reasoning does not reach
 * here: this is reached by a second person, from a third surface, acting on a
 * draft they may not own. The count comes back so the surface can tell them.
 *
 * `author_id` is deliberately **not** written. A save is handed the whole
 * document by the person who now owns those words; this is handed a fragment by
 * somebody who has never seen the rest, and taking authorship of the draft would
 * move a number `grants.ts:erasureContentCounts` reports to an admin who is
 * about to delete somebody's data.
 */
/** What an append did: the revision it wrote, and the translations it cost. */
export interface Appended {
  readonly revision: ContentRevision;
  /** Reviewed or seeded locale rows the change discarded (`CMS-005` section 3). */
  readonly translationsDropped: number;
}

export async function appendToDraft(itemId: string, blocks: unknown): Promise<Appended | null> {
  const added = validateBlocks(blocks);

  return getDb()
    .transaction()
    .execute(async (trx) => {
      await trx.selectFrom('content_items').select('id').where('id', '=', itemId).forUpdate().execute();

      const open = await trx
        .selectFrom('content_revisions')
        .select(['id', 'blocks'])
        .where('item_id', '=', itemId)
        .where('published_at', 'is', null)
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      if (open === undefined) {
        return null;
      }

      let held;
      try {
        held = validateBlocks(open.blocks);
      } catch {
        throw new UnreadableDraftError();
      }

      const combined = validateBlocksToJson([...held, ...added]);
      const revision = await trx
        .updateTable('content_revisions')
        .set({ blocks: combined })
        .where('id', '=', open.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await syncMediaRefs(trx, itemId);

      const dropped = await trx
        .deleteFrom('content_locales')
        .where('revision_id', '=', revision.id)
        .executeTakeFirst();

      return { revision, translationsDropped: Number(dropped.numDeletedRows) };
    });
}

/**
 * Drop the revision's translations, because the text under them just changed
 * (`CMS-005` section 3).
 *
 * `CMS-005` refuses to carry a translation from one revision to the next, on the
 * ground that a translation of the previous text is a translation of something
 * the reader is no longer shown. An open draft is the same event wearing a
 * different hat: this function replaces that draft rather than adding a revision,
 * so the words move and the row keeps its revision id and its `reviewed` state —
 * and a reviewed row is served (`CMS-R05`). The stale translation would reach a
 * reader on the next publish, silently, in a language nobody here reads back.
 *
 * It runs on every save rather than on a save that changed something, because an
 * author reaches this function by pressing save and the cheap wrong answer is the
 * dangerous one: keeping a translation that might be stale costs a reader the
 * truth, while dropping one that was still current costs a re-seed. The grid
 * shows the loss immediately (`CMS-005/T6`), so it is never silent in the
 * direction that matters.
 */
async function dropTranslations(trx: Transaction<Database>, revisionId: string): Promise<void> {
  await trx.deleteFrom('content_locales').where('revision_id', '=', revisionId).execute();
}


/**
 * Raised when a block names a file the library does not hold, which is the one
 * way a save can be refused for a reason the block validator cannot see: it is
 * pure and synchronous, so it can say a `mediaId` is a string and never whether
 * anything is stored under it.
 *
 * The refusal is deliberate rather than the foreign key's accident. A block
 * pointing at nothing renders nothing, and the author is the only person who can
 * still fix it — by the time a reader meets the gap, the document is published
 * and the mistake is a blank where a chart should be.
 */
export class UnknownMediaError extends Error {
  /** The ids no file answers to, in the order the document names them. */
  readonly mediaIds: readonly string[];

  constructor(mediaIds: readonly string[]) {
    super(`no file is stored under ${mediaIds.join(', ')}`);
    this.name = 'UnknownMediaError';
    this.mediaIds = mediaIds;
  }
}

/**
 * Every file a block array names, lower-cased and de-duplicated.
 *
 * Read defensively rather than through `validateBlocks`, because this runs over
 * revisions written before now: a document that was valid when it was stored is
 * not re-validated to be counted, and a validator that grew stricter since would
 * otherwise make an old revision impossible to save alongside.
 *
 * A `mediaId` is lower-cased because a uuid has one canonical spelling and the
 * author types it by hand (`CMS-002`); an empty one is skipped because it names
 * nothing — a draft is work in progress, and a block whose file is not chosen
 * yet is not a block pointing at the wrong file.
 */
function mediaIdsIn(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const named = new Set<string>();
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) {
      continue;
    }
    const { mediaId } = block as { mediaId?: unknown };
    if (typeof mediaId === 'string' && mediaId.trim() !== '') {
      named.add(mediaId.trim().toLowerCase());
    }
  }

  return [...named];
}

/**
 * Make `media_refs` say what this item's revisions name (`CMS-001/T7`).
 *
 * The set is taken over **every** revision, not over the draft just written,
 * because a revision is never deleted and `withdraw` can make an earlier
 * published one current again (`CMS-004`): a file dropped from today's draft is
 * still the file that document would show if it came back. What does leave is a
 * file named only by the draft that was just replaced — `saveDraft` overwrites
 * the open draft rather than adding a revision, so that naming is gone from the
 * item entirely, and the file becomes deletable again (`CMS-003/T7`).
 */
export async function syncMediaRefs(trx: Transaction<Database>, itemId: string): Promise<void> {
  const revisions = await trx
    .selectFrom('content_revisions')
    .select('blocks')
    .where('item_id', '=', itemId)
    .execute();

  const named = [...new Set(revisions.flatMap((revision) => mediaIdsIn(revision.blocks)))];

  await refuseUnstored(trx, named);

  await trx
    .deleteFrom('media_refs')
    .where('item_id', '=', itemId)
    .$if(named.length > 0, (query) => query.where('media_id', 'not in', named))
    .execute();

  if (named.length > 0) {
    await trx
      .insertInto('media_refs')
      .values(named.map((mediaId) => ({ media_id: mediaId, item_id: itemId })))
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  }
}

/**
 * Refuse the save when any named file is absent, before a reference to it is
 * written.
 *
 * The comparison is on `id::text` rather than on the column's own type: a
 * `mediaId` is whatever an author typed, and a value that is not a uuid would
 * raise on the cast instead of simply matching nothing — turning a document the
 * author can fix into a database error nobody can read.
 */
async function refuseUnstored(trx: Transaction<Database>, mediaIds: readonly string[]): Promise<void> {
  if (mediaIds.length === 0) {
    return;
  }

  const stored = await trx
    .selectFrom('media')
    .select((eb) => eb.ref('id').$castTo<string>().as('id'))
    .where(sql<string>`media.id::text`, 'in', mediaIds)
    .execute();

  const held = new Set(stored.map((row) => row.id));
  const missing = mediaIds.filter((mediaId) => !held.has(mediaId));

  if (missing.length > 0) {
    throw new UnknownMediaError(missing);
  }
}

export function validateBlocksToJson(blocks: unknown): RawBuilder<ContentRevision['blocks']> {
  const validated = validateBlocks(blocks);
  return sql<ContentRevision['blocks']>`${JSON.stringify(validated)}::jsonb`;
}
