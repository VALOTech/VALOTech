/**
 * Granting and revoking an account's access to a `granted` item (`CMS-006/T3`).
 *
 * A grant is the row `visibleTo`'s `granted` branch reads: an account with one
 * for an item may read it, and no other investor can. This is the write side of
 * that — an admin surface (`DECK-004`) calls these; the read side is the
 * predicate. The grant is idempotent, because its key is `(item_id, account_id)`
 * and granting twice is the same state as granting once; a second grant is a
 * no-op and records nothing, so the trail carries acts and not re-assertions.
 *
 * Both are privileged writes and both audit, in the same transaction as the
 * write (`SEC-R04`): the audit row and the grant commit or roll back together,
 * which is why `recordAudit` takes the transaction. The subject is the account
 * whose access changed — a grant is a permission on an account, the way a role
 * change is — and which item it was for is a field the trail will record once
 * `SEC-DEC-01` settles what `before`/`after` may hold (`CMS-006/T6`).
 */

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';

/**
 * Grant `accountId` access to `itemId`, optionally pinned to a deck version
 * (`DECK-002/T2`) — `null`, the default, leaves the grantee on the current
 * published version, while an integer holds them to that version whatever is
 * published since. Returns whether a grant was created — `false` when one already
 * existed, in which case nothing is written and nothing is recorded, so
 * re-pinning an existing grant is not this function's job (`DECK-004`).
 */
export async function addGrant(
  itemId: string,
  accountId: string,
  grantedBy: string,
  pinnedVersion: number | null = null,
): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const created = await trx
        .insertInto('content_grants')
        .values({ item_id: itemId, account_id: accountId, granted_by: grantedBy, pinned_version: pinnedVersion })
        .onConflict((oc) => oc.columns(['item_id', 'account_id']).doNothing())
        .returning('account_id')
        .executeTakeFirst();

      if (created === undefined) {
        return false;
      }

      await recordAudit(trx, {
        actorId: grantedBy,
        action: 'grant.add',
        subjectType: 'account',
        subjectId: accountId,
      });
      return true;
    });
}

/**
 * Revoke `accountId`'s access to `itemId`. Returns whether a grant was removed —
 * `false` when none existed, in which case nothing is recorded. A revocation
 * takes effect at the next read: `visibleTo` reads the grant live, so there is
 * no cache of access to invalidate.
 */
export async function removeGrant(itemId: string, accountId: string, actorId: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const removed = await trx
        .deleteFrom('content_grants')
        .where('item_id', '=', itemId)
        .where('account_id', '=', accountId)
        .returning('account_id')
        .executeTakeFirst();

      if (removed === undefined) {
        return false;
      }

      await recordAudit(trx, {
        actorId,
        action: 'grant.remove',
        subjectType: 'account',
        subjectId: accountId,
      });
      return true;
    });
}
