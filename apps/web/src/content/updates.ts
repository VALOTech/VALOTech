/**
 * Writing an update in one sitting (`POST-001`).
 *
 * The whole design problem of an update is the opposite of a report's. A report
 * is long, periodic and expected, so the work is in making it comparable. An
 * update is short, occasional and unscheduled, so the work is in **making it
 * cheap enough that it actually gets written** — a surface that takes twenty
 * minutes produces four entries a year, which is a room nobody signs in to.
 *
 * That is why this exists at all rather than the composer calling
 * `createItem` and then `saveDraft`. Those two are the generic path: an author
 * names the item, chooses its address, lands in the editor, and writes. Three
 * navigations, and each one is a place to stop. This is one act — the item and
 * its first words are written together, in one transaction, so an update is never
 * a titled shell somebody meant to come back to.
 *
 * **The address is derived and never asked for.** A required address field before
 * any writing is the same thing a required title field is (`POST-001` §3), and
 * the derivation is `slug.ts`'s, shared with the form that does ask. Collisions
 * are suffixed rather than refused, because two updates can honestly begin with
 * the same line.
 *
 * Nothing here publishes. `CMS-004` owns that, with its preview, its audit and
 * its withdraw, and an update goes through it like everything else — `POST-001`
 * §3 is explicit that publishing an update is not special.
 */

import { getDb } from '../db/index';
import type { ContentProductTag, ContentUpdateKind } from '../db/types';

import { syncMediaRefs, validateBlocksToJson, type ContentItem } from './items';
import { nextSlug, slugFrom } from './derive';

/**
 * The address an update gets when its first line yields none.
 *
 * `slugFrom` answers empty for a title with no Latin letters or digits in it, and
 * that is the honest answer rather than a transliteration this code cannot make.
 * The item still needs an address, so it gets a plain one and the suffix sequence
 * distinguishes it. It is deliberately not dated: a date in the address would be
 * a second place the publication date lives, and the one on the row is the one a
 * reader is shown.
 */
const UNTITLED_SLUG = 'update';

/**
 * How many times a compose will re-derive its address before giving up.
 *
 * Each attempt reads the taken addresses and inserts under `ON CONFLICT DO
 * NOTHING`, so a loss means another compose took the same suffix in between. That
 * is a genuine race and it resolves on the next read; it is bounded because a
 * loop that cannot end is worse than an answer an author can act on.
 */
const SLUG_ATTEMPTS = 5;

/** Raised when the address sequence could not be settled against concurrent writers. */
export class SlugContentionError extends Error {
  constructor() {
    super('the address for this update could not be settled; try again');
    this.name = 'SlugContentionError';
  }
}

/** What the composer sends: the kind, what it is about, and the words. */
export interface NewUpdate {
  readonly kind: ContentUpdateKind;
  /** One of the six, or the company, or null — the author did not say. */
  readonly product: ContentProductTag | null;
  readonly title: string;
  readonly blocks: unknown;
  readonly authorId: string;
}

/**
 * Create an update and its first draft as one act.
 *
 * One transaction, so the two states this rules out never exist: an item with a
 * title and no words, which is the drafts folder `POST-001` §6 refuses to build,
 * and words with no item, which cannot be reached at all. A crash between them
 * leaves neither.
 *
 * `current_revision_id` stays null — creating is not publishing, and no reader
 * query consults anything else (`CMS-004`), so what this writes is visible to its
 * author and to no investor until somebody publishes it.
 *
 * The blocks are validated before the transaction opens, so a malformed document
 * costs no lock. `syncMediaRefs` runs inside it for the reason `saveDraft` runs
 * it inside its own: the row that decides whether a file is servable must not
 * disagree with the document that decides it, and a first revision is a document
 * like any other.
 */
export async function composeUpdate(input: NewUpdate): Promise<ContentItem> {
  const validated = validateBlocksToJson(input.blocks);
  const base = slugFrom(input.title) || UNTITLED_SLUG;

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    // Read outside the transaction: it is a snapshot either way, and holding it
    // open across the read would serialise every compose in the room against
    // each other for the sake of a suffix. The unique index is what actually
    // settles the address; this only proposes a likely-free one.
    const taken = await getDb()
      .selectFrom('content_items')
      .select('slug')
      .where((eb) => eb.or([eb('slug', '=', base), eb('slug', 'like', `${base}-%`)]))
      .execute();

    const item = await getDb()
      .transaction()
      .execute(async (trx) => {
        const created = await trx
          .insertInto('content_items')
          .values({
            type: 'update',
            slug: nextSlug(base, taken.map((row) => row.slug)),
            title: input.title,
            kind: input.kind,
            product: input.product,
          })
          .onConflict((oc) => oc.column('slug').doNothing())
          .returningAll()
          .executeTakeFirst();

        // Another compose took this address between the read and here. Nothing
        // was written, so the whole attempt is simply made again against a
        // fresher reading.
        if (created === undefined) {
          return null;
        }

        await trx
          .insertInto('content_revisions')
          .values({ item_id: created.id, blocks: validated, author_id: input.authorId })
          .execute();

        await syncMediaRefs(trx, created.id);

        return created;
      });

    if (item !== null) {
      return item;
    }
  }

  throw new SlugContentionError();
}
