/**
 * Granting and revoking an account's access to a `granted` item (`CMS-006/T3`).
 *
 * A grant is the row `visibleTo`'s `granted` branch reads: an account with one
 * for an item may read it, and no other investor can. This is the write side of
 * that — an admin surface (`DECK-004`) calls these; the read side for a reader is
 * the predicate. `grantsForAccount` is the other read — which decks one account
 * holds, for an admin export and the from-the-account view — asking about the
 * grants rather than through them. `erasureContentCounts` is the third, and the
 * only one that looks past the grant: a delete confirmation has to say how much
 * content an account takes with it and how much stays behind, and both halves of
 * that answer live in tables this module is the one place to read (`ADMIN-001/T4`).
 * The grant is idempotent, because its key is `(item_id, account_id)`
 * and granting twice is the same state as granting once; a second grant is a
 * no-op and records nothing, so the trail carries acts and not re-assertions.
 *
 * Both are privileged writes and both audit, in the same transaction as the
 * write (`SEC-R04`): the audit row and the grant commit or roll back together,
 * which is why `recordAudit` takes the transaction. The subject is the account
 * whose access changed — a grant is a permission on an account, the way a role
 * change is — and the row does not say which item it was for: `SEC-DEC-01`
 * settled the allow-list without a field for it, so a revocation is recorded as
 * having happened and the item it took away is readable only from the
 * `content_grants` row the revocation deletes. Whether the trail should name the
 * item is `SEC-DEC-04`.
 */

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';

/** One grant held by an account: which item, when it was granted, and any pinned version. */
export interface AccountGrant {
  readonly itemId: string;
  readonly grantedAt: Date;
  readonly pinnedVersion: number | null;
}

/**
 * Every grant an account holds, oldest first (`LEGAL-GLOBAL-001/T2`, `DECK-004/T5`).
 *
 * It reads `content_grants`, the table the audience predicate owns, so it lives in
 * this module rather than in the admin surface that composes it (`CMS-R03`'s access
 * boundary is a module boundary). It is scoped to the one account (`DATA-R05`) — an
 * admin export of a person and the from-the-account view of who may read what both
 * ask the same question of one account's rows.
 */
export async function grantsForAccount(accountId: string): Promise<AccountGrant[]> {
  const rows = await getDb()
    .selectFrom('content_grants')
    .select(['item_id', 'granted_at', 'pinned_version'])
    .where('account_id', '=', accountId)
    .orderBy('granted_at')
    .execute();

  return rows.map((row) => ({
    itemId: row.item_id,
    grantedAt: row.granted_at,
    pinnedVersion: row.pinned_version,
  }));
}

/** The content half of what an account's erasure removes and what it leaves. */
export interface ErasureContentCounts {
  /** Grants of access held by the account, removed with it. */
  readonly grants: number;
  /** Revisions the account authored, which survive with a null author. */
  readonly authoredRevisions: number;
}

/**
 * How much content an account's erasure removes, and how much it leaves behind
 * (`ADMIN-001/T4`, `DATA-002`).
 *
 * The two counts sit on opposite sides of the erasure manifest's split. A grant is
 * about the person — it is access they held — so it goes with them. A revision they
 * wrote is the company's document, so it stays and only its author is forgotten
 * (`DATA-002/T5`). The delete confirmation states both, because an admin should
 * not be surprised afterwards by either half.
 *
 * Counts, not rows: what the confirmation needs is a number and a kind, and a
 * preview naming the documents would be reading content to justify removing an
 * account (`DATA-R01`).
 *
 * Every grant is counted rather than only the decks. Any item type can be
 * audience-`granted`, so a row the delete removes that the preview did not count
 * is exactly the surprise the confirmation exists to prevent — where
 * `grantedDecksForAccount` narrows to decks because it is listing what somebody
 * can open.
 *
 * It lives here because it names the two tables, as every read of them does
 * (`CMS-006`), and it is scoped to the one account (`DATA-R05`).
 */
export async function erasureContentCounts(accountId: string): Promise<ErasureContentCounts> {
  const db = getDb();

  // `count(*)` is an `int8`, which the driver hands back as a string rather than
  // rounding a value a JavaScript number cannot hold exactly.
  const [granted, authored] = await Promise.all([
    db
      .selectFrom('content_grants')
      .select((eb) => eb.fn.countAll<string>().as('rows'))
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('content_revisions')
      .select((eb) => eb.fn.countAll<string>().as('rows'))
      .where('author_id', '=', accountId)
      .executeTakeFirstOrThrow(),
  ]);

  return { grants: Number(granted.rows), authoredRevisions: Number(authored.rows) };
}

/**
 * Grant `accountId` access to `itemId`, optionally pinned to a deck version
 * (`DECK-002/T2`) — `null`, the default, leaves the grantee on the current
 * published version, while an integer holds them to that version whatever is
 * published since. Returns whether a grant was created — `false` when one already
 * existed, in which case nothing is written and nothing is recorded, so
 * re-pinning an existing grant is not this function's job (`DECK-004`).
 *
 * A grant to a suspended account throws rather than returns (`DECK-004/T3`): it
 * is a refusal, not a no-op, so an admin is told the grant did not take. A grant
 * to an invited account is allowed.
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
      // A grant to a suspended account is refused, with the reason (`DECK-004/T3`):
      // a grant that silently does nothing is one an admin believes is working.
      // An invited account is allowed — access begins when they accept. The
      // account row is locked so a suspension racing this grant is serialised
      // against it: either it runs first and this refuses, or this runs first and
      // the suspension revokes what it granted. A non-existent id is left to the
      // insert's foreign key, as before.
      const account = await trx
        .selectFrom('accounts')
        .select('state')
        .where('id', '=', accountId)
        .forUpdate()
        .executeTakeFirst();
      if (account?.state === 'suspended') {
        throw new Error('cannot grant access to a suspended account');
      }

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
