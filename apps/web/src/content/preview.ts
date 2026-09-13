/**
 * What a preview shows, and to whom (`CMS-004/T1`, `CMS-004/T2`).
 *
 * A preview is the reader's own read of a revision nobody has published yet. It
 * differs from the real thing in **exactly one way** — it takes the latest
 * revision instead of the published one — and everything else is the reader's:
 * the same audience rule (`access.ts:audienceAdmits`), the same locale fallback
 * (`locales.ts:localeFor`), and the same renderer (`render.tsx`). Each of those
 * is shared rather than reimplemented, because a preview that decides any of
 * them for itself is a preview that can disagree with what publishes.
 *
 * **The audience is evaluated, never bypassed.** Previewing an investor-only
 * item as a visitor shows what a visitor gets, which is nothing — and that is
 * the answer an admin needs, because the alternative is discovering after
 * publication that the audience was wrong. The role is a *generic* member of its
 * kind: an investor here holds no grants, so a `granted` item admits none of
 * them, and an admin previewing one is told that rather than shown the document.
 *
 * There is no token and no shareable link (`CMS-004/T2`): the preview is a page
 * under `/admin`, reached by an admin's own session, and a token that outlived
 * its preview would be a published draft nobody decided to publish (`CMS-R02`).
 */

import { getDb } from '../db/index';

import { audienceAdmits, type ReadingRole } from './access';
import { validateBlocks, type Block } from './blocks';
import type { ContentItem } from './items';
import { localeFor } from './locales';

export type { ReadingRole };

/** Whether a posted value names one of the roles a preview offers. */
export function isReadingRole(value: string): value is ReadingRole {
  return value === 'admin' || value === 'investor' || value === 'public';
}

/** A revision as the chosen role would read it, or as they would not. */
export interface Preview {
  readonly item: ContentItem;
  readonly revisionId: string;
  /** True when this revision is the one a reader is already being served. */
  readonly published: boolean;
  /** True when the item's audience admits this role at all. */
  readonly admitted: boolean;
  /** The body, or `null` when the role is not admitted and sees nothing. */
  readonly blocks: readonly Block[] | null;
  /** The locale actually rendered — the one asked for, or the authored language. */
  readonly locale: string;
  /** True when the language asked for had no reviewed translation. */
  readonly fellBack: boolean;
}

/**
 * The latest revision of `itemId`, as `role` would read it in `locale`, or
 * `null` when the item does not exist.
 *
 * The revision is the latest whether published or not, which is the one
 * difference a preview carries; `published` says which it is, so the surface can
 * tell an admin whether they are looking at what readers already have.
 *
 * The audience is asked of the database rather than of this process, through the
 * predicate every content read composes, so a preview cannot be admitted by a
 * rule the reader's own query would refuse.
 */
export async function previewFor(
  itemId: string,
  role: ReadingRole,
  locale: string,
): Promise<Preview | null> {
  const item = await getDb()
    .selectFrom('content_items')
    .selectAll()
    .where('id', '=', itemId)
    .executeTakeFirst();

  if (item === undefined) {
    return null;
  }

  const revision = await getDb()
    .selectFrom('content_revisions')
    .select(['id', 'blocks'])
    .where('item_id', '=', itemId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (revision === undefined) {
    return null;
  }

  // Asked of the database through the predicate every content read composes,
  // and in the position it was written for — a `WHERE` over `content_items`, so
  // a preview cannot be admitted by a rule the reader's own query would refuse.
  const admits = await getDb()
    .selectFrom('content_items')
    .select((eb) => eb.lit(1).as('one'))
    .where('id', '=', itemId)
    .where(audienceAdmits(role))
    .executeTakeFirst();

  const admitted = admits !== undefined;
  const served = await localeFor(revision, locale);

  return {
    item,
    revisionId: revision.id,
    published: item.current_revision_id === revision.id,
    admitted,
    blocks: admitted ? validateBlocks(served.blocks) : null,
    locale: served.locale,
    fellBack: served.fellBack,
  };
}
