/**
 * Publishing and withdrawing, as moves of the pointer a reader consults
 * (`CMS-001`, `CMS-R01`, `SEC-R04`).
 *
 * Publication is not a flag on a revision; it is `content_items.current_revision_id`
 * naming the revision a reader sees. Publishing moves that pointer to a revision
 * and stamps its `published_at`; withdrawing moves the pointer back to the
 * revision published before it, or to nothing. The revision just withdrawn stays
 * on disk with its `published_at` intact — what an investor read is still there
 * to be read again, and re-publishing is moving the pointer forward once more.
 *
 * Both are privileged writes, so both audit — and the audit row and the pointer
 * move commit or roll back together (`SEC-R04`). That atomicity is why the audit
 * is written here, in the same transaction, rather than by the surface that
 * calls these (`CMS-004`): an audit in a second transaction could succeed while
 * the move it records was rolled back, or the reverse. `recordAudit` takes the
 * transaction, so the same-transaction rule is the type rather than a hope.
 */

import { type Transaction, sql } from 'kysely';
import { DatabaseError } from 'pg';

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';
import type { ContentType, Database } from '../db/types';

import { validateBlocks } from './blocks';
import type { ContentItem } from './items';

/** The item's id, pointer and type, locked so two publications of it cannot interleave. */
async function lockItem(trx: Transaction<Database>, itemId: string) {
  return trx
    .selectFrom('content_items')
    .select(['id', 'current_revision_id', 'type'])
    .where('id', '=', itemId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

/**
 * The version a deck revision takes at publication (`DECK-002/T1`): the deck's
 * highest version so far plus one, assigned only to a deck and only the first
 * time a revision is published. A re-publish keeps the version it was shown
 * under, so "the version they read" keeps resolving (`CMS-R01`); a report or an
 * update takes none, so the column stays null and no non-deck publish reads it.
 * The item-row lock `lockItem` holds serialises two publications of one deck, so
 * the maximum is read under it and two revisions cannot take the same number.
 * A withdrawal never clears a version, so a withdrawn one leaves a hole rather
 * than being reused.
 */
async function versionForPublish(
  trx: Transaction<Database>,
  itemId: string,
  revisionId: string,
  type: ContentType,
): Promise<{ version: number } | Record<string, never>> {
  if (type !== 'deck') {
    return {};
  }

  const revision = await trx
    .selectFrom('content_revisions')
    .select('version')
    .where('id', '=', revisionId)
    .executeTakeFirstOrThrow();

  if (revision.version !== null) {
    return {};
  }

  const { next } = await trx
    .selectFrom('content_revisions')
    .select(sql<number>`coalesce(max(version), 0) + 1`.as('next'))
    .where('item_id', '=', itemId)
    .executeTakeFirstOrThrow();

  return { version: next };
}

/**
 * Raised when publishing a report into a period that already holds a published
 * one (`RPT-002/T2`). The partial unique index `one_published_report_per_period`
 * is the race-safe guard (`RPT-002/T1`); this carries what a reader of the error
 * needs to offer the two real choices — withdraw the report named here, or give
 * this one another period — rather than a raw constraint name.
 */
export class PeriodTakenError extends Error {
  constructor(
    readonly period: string,
    readonly heldBy: { id: string; title: string } | null,
  ) {
    super(`period ${period} already holds a published report`);
    this.name = 'PeriodTakenError';
  }
}

/**
 * Publish a revision: stamp its `published_at`, move the item's pointer to it,
 * and record the act. The body is re-validated first — publish is the gate past
 * which a reader sees it, so it does not trust a stored row it never checked (a
 * direct write, or a validator tightened since the draft was saved).
 *
 * A report publish can fail on `one_published_report_per_period`; that violation
 * becomes a `PeriodTakenError` naming the report that holds the period. The whole
 * transaction has rolled back by then, so the period is read again outside it.
 */
export async function publish(itemId: string, revisionId: string, actorId: string): Promise<ContentItem> {
  try {
    return await publishRevision(itemId, revisionId, actorId);
  } catch (error) {
    if (
      error instanceof DatabaseError &&
      error.code === '23505' &&
      error.constraint === 'one_published_report_per_period'
    ) {
      throw await periodTaken(itemId);
    }
    throw error;
  }
}

/**
 * The report that already holds the period this item was published into, read
 * after the failed transaction rolled back so the row being published — whose
 * pointer move did not commit — is excluded rather than named as its own rival.
 */
async function periodTaken(itemId: string): Promise<PeriodTakenError> {
  const item = await getDb()
    .selectFrom('content_items')
    .select('period')
    .where('id', '=', itemId)
    .executeTakeFirstOrThrow();
  const heldBy =
    item.period === null
      ? undefined
      : await getDb()
          .selectFrom('content_items')
          .select(['id', 'title'])
          .where('type', '=', 'report')
          .where('period', '=', item.period)
          .where('current_revision_id', 'is not', null)
          .where('id', '!=', itemId)
          .executeTakeFirst();
  return new PeriodTakenError(item.period ?? '', heldBy ?? null);
}

async function publishRevision(itemId: string, revisionId: string, actorId: string): Promise<ContentItem> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const locked = await lockItem(trx, itemId);

      const revision = await trx
        .selectFrom('content_revisions')
        .select('blocks')
        .where('id', '=', revisionId)
        .where('item_id', '=', itemId)
        .executeTakeFirst();

      if (revision === undefined) {
        throw new Error(`revision ${revisionId} does not belong to item ${itemId}`);
      }

      validateBlocks(revision.blocks);

      const versionSet = await versionForPublish(trx, itemId, revisionId, locked.type);

      await trx
        .updateTable('content_revisions')
        .set({ published_at: sql`now()`, ...versionSet })
        .where('id', '=', revisionId)
        .execute();

      const item = await trx
        .updateTable('content_items')
        .set({ current_revision_id: revisionId })
        .where('id', '=', itemId)
        .returningAll()
        .executeTakeFirstOrThrow();

      await recordAudit(trx, {
        actorId,
        action: 'content.publish',
        subjectType: 'content_item',
        subjectId: itemId,
      });

      return item;
    });
}

/**
 * Withdraw the current publication: move the pointer to the revision published
 * before it, or to nothing if there is none, and record the act. Withdrawing an
 * item that shows nothing is refused — there is no pointer to move back.
 */
export async function withdraw(itemId: string, actorId: string): Promise<ContentItem> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const item = await lockItem(trx, itemId);

      if (item.current_revision_id === null) {
        throw new Error(`item ${itemId} has no published revision to withdraw`);
      }

      const current = await trx
        .selectFrom('content_revisions')
        .select('published_at')
        .where('id', '=', item.current_revision_id)
        .executeTakeFirstOrThrow();

      if (current.published_at === null) {
        throw new Error(`item ${itemId} points at an unpublished revision`);
      }

      const previous = await trx
        .selectFrom('content_revisions')
        .select('id')
        .where('item_id', '=', itemId)
        .where('published_at', 'is not', null)
        .where('published_at', '<', current.published_at)
        .orderBy('published_at', 'desc')
        .executeTakeFirst();

      const updated = await trx
        .updateTable('content_items')
        .set({ current_revision_id: previous?.id ?? null })
        .where('id', '=', itemId)
        .returningAll()
        .executeTakeFirstOrThrow();

      await recordAudit(trx, {
        actorId,
        action: 'content.withdraw',
        subjectType: 'content_item',
        subjectId: itemId,
      });

      return updated;
    });
}
