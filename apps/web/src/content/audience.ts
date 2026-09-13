/**
 * Changing an item's audience, as an audited move (`CMS-006/T6`, `CMS-R03`, `SEC-R04`).
 *
 * The audience is a column on the item, and the read predicate
 * (`access.ts`'s `visibleTo`) is what turns it into who may see the item.
 * Narrowing it — `public` to `investor`, `investor` to `granted` — takes effect
 * immediately for the next read, but it does not un-send what a reader already
 * holds: a page open in a browser stays rendered, and a shared cache may hold a
 * public copy until the short lifetime the serve route (`CMS-006/T4`) sets on it
 * elapses. So the change is recorded rather than assumed away — one
 * `content.audience_change` row, written in the same transaction as the column
 * write so the trail and the change commit or roll back together (`SEC-R04`).
 * `recordAudit` takes the transaction, so that sameness is the type and not the
 * caller's care.
 *
 * A change to the audience the item already has records nothing and writes
 * nothing: an audience change is a change, and a trail that logged a write which
 * altered nothing would record an act that did not happen. The row is locked
 * first so two changes racing for one item settle in an order rather than both
 * reading the same prior value.
 *
 * The row carries both audiences (`SEC-DEC-01`). One alone cannot tell a
 * narrowing from a widening, and which of the two it was is the whole question
 * this act is read for — a public report moved to `granted` is a mistake being
 * contained, and the reverse is a disclosure.
 */

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';
import type { ContentAudience } from '../db/types';

import type { ContentItem } from './items';

/**
 * How long a reader's own browser may keep a copy of a public document
 * (`CMS-006/T6`).
 *
 * The audience is what makes this number true: a public item is served
 * `public, max-age=600` and everything else `private, no-store`, so widening to
 * public is what makes a copy cacheable at all, and narrowing away from it is
 * what leaves one behind. The constant lives beside the audience rather than at
 * the route because the confirmation an admin reads before narrowing states this
 * window, and a sentence naming a different number than the header serves is a
 * sentence that drifts the first time either is changed alone.
 *
 * Whether a publication or a withdrawal should reach that copy sooner than it
 * expires is [`CMS-DEC-07`](../../../../docs/decisions-log.md#CMS-DEC-07); this
 * is the bound that holds while it is open.
 */
export const PUBLIC_CACHE_SECONDS = 600;

/**
 * The shape an item's id takes. A value that is not one never reaches the uuid
 * column, where PostgreSQL would raise `22P02` — an error whose message repeats
 * the value supplied (`DATA-R02`) and which a caller receives as a `500`
 * describing an invariant rather than an answer about an item.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How far each audience reaches, so a move between two of them has a direction. */
const REACH: Readonly<Record<ContentAudience, number>> = {
  granted: 0,
  investor: 1,
  public: 2,
};

/** What changing an item's audience would do, as the facts a confirmation states. */
export interface AudienceChange {
  readonly from: ContentAudience;
  readonly to: ContentAudience;
  /** `wider` lets more people read it, `narrower` fewer, `same` nobody new. */
  readonly direction: 'wider' | 'narrower' | 'same';
  /** Accounts holding a grant on this item — who still reads it under `granted`. */
  readonly grantHolders: number;
  /**
   * Seconds a reader who already fetched this item may keep it, or `null` when
   * it is not public today and so nothing cacheable exists to be left behind.
   */
  readonly cachedFor: number | null;
}

/**
 * What each audience would do to this item, or `null` for an item that is not
 * there — which is the same `null` an identifier that is not one gets, so a
 * caller answers a garbage path exactly as it answers a missing item
 * (`CMS-006/T4`).
 *
 * The surface states consequences rather than asking an admin to hold the rules
 * in their head, and the consequences are read here rather than assembled at the
 * page, so the confirmation cannot describe an outcome the store would not
 * produce (`POST-002/T5`, `RPT-001/T5`).
 *
 * **The grant count is the one that changes an answer rather than decorating
 * it.** Narrowing to `granted` with no grants written makes a document that
 * every investor could read into one nobody can, and an admin reading "only the
 * investors it is granted to" has no way to know that is nobody.
 *
 * All three are answered at once because they come from the same two reads and
 * the screen offers all three: asking per audience would be the same row read
 * three times to produce one panel, and the count would be taken three times
 * with it.
 */
export async function audienceOptions(
  itemId: string,
): Promise<Readonly<Record<ContentAudience, AudienceChange>> | null> {
  if (!UUID.test(itemId)) {
    return null;
  }

  const item = await getDb()
    .selectFrom('content_items')
    .select('audience')
    .where('id', '=', itemId)
    .executeTakeFirst();

  if (item === undefined) {
    return null;
  }

  const holders = await getDb()
    .selectFrom('content_grants')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('item_id', '=', itemId)
    .executeTakeFirst();

  const from = item.audience;
  const grantHolders = Number(holders?.count ?? 0);
  const cachedFor = from === 'public' ? PUBLIC_CACHE_SECONDS : null;

  const moves = {} as Record<ContentAudience, AudienceChange>;
  for (const to of Object.keys(REACH) as ContentAudience[]) {
    moves[to] = {
      from,
      to,
      direction: REACH[to] === REACH[from] ? 'same' : REACH[to] > REACH[from] ? 'wider' : 'narrower',
      grantHolders,
      cachedFor,
    };
  }

  return moves;
}

/**
 * Set an item's audience, auditing a real change. Returns the item unchanged
 * when the audience is already the one asked for, and the updated item otherwise.
 */
export async function changeAudience(
  itemId: string,
  audience: ContentAudience,
  actorId: string,
): Promise<ContentItem> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const current = await trx
        .selectFrom('content_items')
        .selectAll()
        .where('id', '=', itemId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (current.audience === audience) {
        return current;
      }

      const updated = await trx
        .updateTable('content_items')
        .set({ audience })
        .where('id', '=', itemId)
        .returningAll()
        .executeTakeFirstOrThrow();

      await recordAudit(trx, {
        actorId,
        action: 'content.audience_change',
        subjectType: 'content_item',
        subjectId: itemId,
        before: { audience: current.audience },
        after: { audience },
      });

      return updated;
    });
}
