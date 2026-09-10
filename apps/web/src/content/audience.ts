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
 */

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';
import type { ContentAudience } from '../db/types';

import type { ContentItem } from './items';

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
      });

      return updated;
    });
}
