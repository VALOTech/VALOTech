/**
 * Serving a revision in a reader's locale (`CMS-005`). A reviewed translation is
 * served for the reader's language; a machine draft is served to nobody
 * (`CMS-R05`); and when no reviewed translation exists the authored language is
 * served and the reader is told so (`I18N-R04`, `I18N-DEC-01`).
 *
 * The state is a column the serving query filters on — `state = 'reviewed'` is
 * the whole of what "servable" means — never an inference from a null
 * `reviewed_at`, so a machine row cannot reach a reader by any path through here.
 *
 * The reading views (`RPT-003`, `DECK-003`) call this with the revision they got
 * from the access-checked read and the reader's requested locale; `CMS-004` reads
 * the same rows to count what a publish will and will not show.
 *
 * This module also seeds a locale (`CMS-005/T3`). The room runs no translation
 * service (`CMS-DEC-04`), so what a seed produces is the source language under
 * the target's label, in the pre-review state, served to nobody — the thing an
 * admin then translates rather than a translation.
 */

import { sql } from 'kysely';

import { getDb } from '../db/index';
import type { ContentLocaleState, Database, JsonValue } from '../db/types';

import { type Block, validateBlocks } from './blocks';
import type { ContentRevision } from './items';
import { translated } from './translation';

/** Content is authored in English; every other locale is a translation (`I18N-R02`). */
const AUTHORED_LOCALE = 'en';

/** The blocks served to a reader, the locale they are in, and whether that is a fallback. */
export interface ServedLocale {
  readonly blocks: JsonValue;
  /** The locale actually served — the reader's, or `en` when theirs was not ready. */
  readonly locale: string;
  /** True when the reader's language had no reviewed translation, so English was served. */
  readonly fellBack: boolean;
}

/**
 * The blocks to show `requested`, in the design's order: a reviewed row for the
 * exact locale, then a reviewed row for its language without a region, then the
 * authored language. A region is dropped (`fr-CA` falls back to `fr`) but a
 * script is not (`zt` never falls back to `zh`), because a reader who cannot read
 * Simplified cannot read it served as Traditional's fallback.
 */
export async function localeFor(revision: ContentRevision, requested: string): Promise<ServedLocale> {
  // The authored language needs no locale row: the revision's own blocks are it,
  // and asking the table for them would only ever miss.
  if (requested === AUTHORED_LOCALE) {
    return { blocks: revision.blocks, locale: AUTHORED_LOCALE, fellBack: false };
  }

  const language = requested.split('-')[0] ?? requested;
  const candidates = language !== requested ? [requested, language] : [requested];

  const rows = await getDb()
    .selectFrom('content_locales')
    .select(['locale', 'blocks'])
    .where('revision_id', '=', revision.id)
    .where('state', '=', 'reviewed')
    .where('locale', 'in', candidates)
    .execute();

  // Prefer the exact locale over the region-stripped one, so `fr-CA` takes a
  // reviewed `fr-CA` if one exists and only then a reviewed `fr`.
  for (const candidate of candidates) {
    const match = rows.find((row) => row.locale === candidate);
    if (match !== undefined) {
      return { blocks: match.blocks, locale: candidate, fellBack: false };
    }
  }

  return { blocks: revision.blocks, locale: AUTHORED_LOCALE, fellBack: true };
}


/** What seeding a locale did, or why it did nothing. */
export type SeedOutcome =
  | { readonly ok: true; readonly revisionId: string }
  | { readonly ok: false; readonly reason: 'no-revision' | 'already-started' };

/**
 * Start a translation of `locale` by copying the item's latest revision into a
 * `content_locales` row (`CMS-005/T3`, `CMS-DEC-04`).
 *
 * **The latest revision** is the one seeded: the open draft while one is open,
 * and otherwise the newest published. It is the revision an admin is working on
 * — an earlier published one is reachable only by withdrawing back to it, and a
 * translation of it would be a translation of text the room is not showing.
 *
 * The blocks are copied **by the database**, from the revision row into the
 * locale row, so what lands is the source document byte for byte: a `heading`
 * stays a `heading`, a paragraph's marks keep their offsets over the text the
 * reviewer is about to replace, and an image keeps the file it names. Copying
 * through this process would mean re-serialising a document nobody is editing,
 * which is a chance for it to come back different.
 *
 * A locale already started is refused rather than re-seeded, because the row may
 * hold hours of somebody's translation and a second press of the same control
 * would overwrite it with the English it came from. Starting over is a delete
 * this design does not offer; the state is deliberate.
 */
export async function seedLocale(itemId: string, locale: string): Promise<SeedOutcome> {
  return getDb()
    .transaction()
    .execute(async (trx): Promise<SeedOutcome> => {
      const latest = await trx
        .selectFrom('content_revisions')
        .select('id')
        .where('item_id', '=', itemId)
        .orderBy('created_at', 'desc')
        .orderBy('id')
        .limit(1)
        .executeTakeFirst();

      if (latest === undefined) {
        return { ok: false, reason: 'no-revision' };
      }

      const started = await trx
        .selectFrom('content_locales')
        .select('locale')
        .where('revision_id', '=', latest.id)
        .where('locale', '=', locale)
        .executeTakeFirst();

      if (started !== undefined) {
        return { ok: false, reason: 'already-started' };
      }

      await trx
        .insertInto('content_locales')
        .columns(['revision_id', 'locale', 'blocks', 'state'])
        .expression((eb) =>
          eb
            .selectFrom('content_revisions')
            .select((select) => [
              'content_revisions.id as revision_id',
              select.val(locale).as('locale'),
              'content_revisions.blocks as blocks',
              select.val<ContentLocaleState>('machine').as('state'),
            ])
            .where('content_revisions.id', '=', latest.id),
        )
        .execute();

      return { ok: true, revisionId: latest.id };
    });
}

/** A locale's translation beside the source it was made from (`CMS-005/T4`). */
export interface LocaleDraft {
  readonly revisionId: string;
  /** True for a published revision, false for the open draft. */
  readonly published: boolean;
  /** The authored blocks, which the screen shows on the left and never edits. */
  readonly source: readonly Block[];
  /** The locale's blocks: the source on a fresh seed, the translation after that. */
  readonly translation: readonly Block[];
  readonly state: ContentLocaleState;
}

/**
 * The latest revision's translation into `locale`, with the source beside it
 * (`CMS-005/T4`), or `null` when the locale has not been started.
 *
 * The same revision `seedLocale` writes: the open draft while one is open, and
 * otherwise the newest published. Both block arrays are validated on the way out
 * rather than handed over as loose JSON, because the screen pairs them field by
 * field and a value that is not a block would be a blank where a paragraph is.
 */
export async function localeDraft(itemId: string, locale: string): Promise<LocaleDraft | null> {
  const revision = await getDb()
    .selectFrom('content_revisions')
    .select(['id', 'blocks', 'published_at'])
    .where('item_id', '=', itemId)
    .orderBy('created_at', 'desc')
    .orderBy('id')
    .limit(1)
    .executeTakeFirst();

  if (revision === undefined) {
    return null;
  }

  const row = await getDb()
    .selectFrom('content_locales')
    .select(['blocks', 'state'])
    .where('revision_id', '=', revision.id)
    .where('locale', '=', locale)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  return {
    revisionId: revision.id,
    published: revision.published_at !== null,
    source: validateBlocks(revision.blocks),
    translation: validateBlocks(row.blocks),
    state: row.state,
  };
}

/** What marking a locale reviewed did, or why it did nothing. */
export type ReviewOutcome =
  | { readonly ok: true; readonly revisionId: string }
  | { readonly ok: false; readonly reason: 'not-started' };

/**
 * Store the translation and mark the locale reviewed (`CMS-005/T4`).
 *
 * **The caller sends strings, never blocks.** `fields` is one array of values per
 * source block, in `fieldsOf`'s order, and the document is rebuilt here from the
 * source: same blocks, same order, same image naming the same file, with only
 * the words replaced. A caller posting blocks could change the structure of one
 * language — a dropped section, a different picture — and nothing downstream
 * would notice, because no reader compares the two.
 *
 * Marking is one deliberate act on one locale (`CMS-005` section 3): the text a
 * reviewer edited and their approval of it arrive together, so there is no window
 * in which a row is marked reviewed and holds something nobody read. The item row
 * is locked for it, so a save landing at the same moment cannot leave the
 * translation describing text that has already moved.
 *
 * The rebuilt document is validated as well as the source, because rebuilding can
 * produce a block the schema refuses even from a document that passed: emptying an
 * image's alternative text is a valid string edit and an unlabelled image
 * (`A11Y-R02`, `CMS-002/T3`). A translation is held to what every other document
 * is held to, so a language cannot be the one where that rule does not apply.
 */
export async function markReviewed(
  itemId: string,
  locale: string,
  fields: readonly (readonly string[])[],
  actorId: string,
): Promise<ReviewOutcome> {
  return getDb()
    .transaction()
    .execute(async (trx): Promise<ReviewOutcome> => {
      await trx.selectFrom('content_items').select('id').where('id', '=', itemId).forUpdate().execute();

      const revision = await trx
        .selectFrom('content_revisions')
        .select(['id', 'blocks'])
        .where('item_id', '=', itemId)
        .orderBy('created_at', 'desc')
        .orderBy('id')
        .limit(1)
        .executeTakeFirst();

      if (revision === undefined) {
        return { ok: false, reason: 'not-started' };
      }

      const started = await trx
        .selectFrom('content_locales')
        .select('locale')
        .where('revision_id', '=', revision.id)
        .where('locale', '=', locale)
        .executeTakeFirst();

      if (started === undefined) {
        return { ok: false, reason: 'not-started' };
      }

      const blocks = validateBlocks(
        validateBlocks(revision.blocks).map((block, index) => translated(block, fields[index] ?? [])),
      );

      await trx
        .updateTable('content_locales')
        .set({
          blocks: sql<Database['content_locales']['blocks']>`${JSON.stringify(blocks)}::jsonb`,
          state: 'reviewed',
          reviewed_by: actorId,
          reviewed_at: sql`now()`,
        })
        .where('revision_id', '=', revision.id)
        .where('locale', '=', locale)
        .execute();

      return { ok: true, revisionId: revision.id };
    });
}


/** One revision's locale coverage, for the admin grid (`CMS-005/T6`). */
export interface LocaleRevision {
  readonly revisionId: string;
  readonly createdAt: Date;
  /** True for a published revision, false for the open draft. */
  readonly published: boolean;
  /**
   * Locale to state for every locale that holds a row — `machine` or `reviewed`.
   * A locale absent here has no row and is not started; the authored language
   * never holds a row, so it is absent and the grid renders it as authored.
   */
  readonly localeStates: Readonly<Record<string, ContentLocaleState>>;
}

/**
 * Every revision of an item and the locale state of each, newest first, for the
 * admin grid (`CMS-005/T6`).
 *
 * A new revision has no locale rows at all (`CMS-005` §3): its column is the one
 * authored language and nineteen not-started cells, with nothing carried forward
 * from the revision it replaced — the property the grid exists to make visible.
 * The read is two queries rather than a join for exactly that reason: an inner
 * join would drop a revision that holds no locale rows, and that revision is the
 * empty column the grid must show.
 */
export async function localeGrid(itemId: string): Promise<LocaleRevision[]> {
  const revisions = await getDb()
    .selectFrom('content_revisions')
    .select(['id', 'created_at', 'published_at'])
    .where('item_id', '=', itemId)
    .orderBy('created_at', 'desc')
    .orderBy('id')
    .execute();

  if (revisions.length === 0) {
    return [];
  }

  const rows = await getDb()
    .selectFrom('content_locales')
    .select(['revision_id', 'locale', 'state'])
    .where(
      'revision_id',
      'in',
      revisions.map((revision) => revision.id),
    )
    .execute();

  const byRevision = new Map<string, Record<string, ContentLocaleState>>();
  for (const row of rows) {
    const states = byRevision.get(row.revision_id) ?? {};
    states[row.locale] = row.state;
    byRevision.set(row.revision_id, states);
  }

  return revisions.map((revision) => ({
    revisionId: revision.id,
    createdAt: revision.created_at,
    published: revision.published_at !== null,
    localeStates: byRevision.get(revision.id) ?? {},
  }));
}
