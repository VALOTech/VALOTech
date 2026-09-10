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
 */

import { getDb } from '../db/index';
import type { JsonValue } from '../db/types';

import type { ContentRevision } from './items';

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
