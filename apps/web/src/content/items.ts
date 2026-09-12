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

import { type Selectable, type Transaction, sql } from 'kysely';

import { getDb } from '../db/index';
import type {
  ContentAudience,
  ContentItemsTable,
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

/** A new content item. `audience` defaults to `investor` in the database. */
export interface NewItem {
  type: ContentType;
  slug: string;
  title: string;
  kind?: ContentUpdateKind | null;
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
      period: input.period ?? null,
      ...(input.audience === undefined ? {} : { audience: input.audience }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
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
async function syncMediaRefs(trx: Transaction<Database>, itemId: string): Promise<void> {
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

function validateBlocksToJson(blocks: unknown) {
  const validated = validateBlocks(blocks);
  return sql<ContentRevision['blocks']>`${JSON.stringify(validated)}::jsonb`;
}
