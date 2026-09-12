/**
 * The audit trail against a real PostgreSQL (`SEC-002`).
 *
 * Three properties are the whole feature and none is visible from a single
 * insert: that the audit row commits or rolls back *with* the write it records
 * (`SEC-R04`), that once written it cannot be changed or removed (`DATA-R09`),
 * and that no field a personal value could travel in can reach it at all
 * (`DATA-R02`, `SEC-DEC-01`). So the transaction tests make a write fail after
 * the audit and assert nothing survives, the append-only tests write a row and
 * then try every way to unwrite it, and the allow-list tests read the table
 * itself rather than any one call site.
 *
 * The allow-list tests are pure and always run: what a personal field is does
 * not depend on a database, and the property they hold is one a reader needs
 * answered whether or not a target is configured. The rest need a database —
 * `DATABASE_URL` names a development target; the suite writes audit rows and,
 * where it can, tries and fails to delete them. Rows are keyed by a random
 * `subject_id` per test, so nothing here reads another test's writes or another
 * suite's.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import { AUDIT_ACTIONS, type AuditAction } from '../db/types';
import { recentAudit } from './read';
import { RECORDABLE_FIELDS, recordAudit, UnrecordableFieldError } from './record';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

/**
 * The refusal a rejected call carried, typed. Reading the thrown value is what
 * lets the assertions hold the message to what it may and may not name, which a
 * matcher on the class alone cannot do.
 */
async function refusalOf(attempt: Promise<unknown>): Promise<UnrecordableFieldError> {
  try {
    await attempt;
  } catch (thrown) {
    return thrown as UnrecordableFieldError;
  }
  throw new Error('the call resolved where a refusal was expected');
}

/** Every audit row written for one subject, read back independently of the writer. */
async function rowsFor(subjectId: string) {
  return getDb().selectFrom('audit').selectAll().where('subject_id', '=', subjectId).execute();
}

/** One committed row for a subject, returning its database id. */
async function oneRow(subjectId: string): Promise<void> {
  await getDb()
    .transaction()
    .execute(async (trx) => {
      await recordAudit(trx, {
        actorId: randomUUID(),
        action: 'config.change',
        subjectType: 'config',
        subjectId,
      });
    });
}

/**
 * The allow-list read as a table, with no database and no call site involved.
 *
 * `SEC-DEC-01` puts the personal-data guarantee in one place so it can be
 * checked in one place. These two tests are that check: the first says no action
 * may ever record a person, the second says the table cannot fall behind the
 * vocabulary — a folded-in action with no entry would otherwise be a hole nobody
 * looks in until the first row is written with it.
 */
describe('the recordable-field allow-list (SEC-DEC-01)', () => {
  /** The two fields an account carries that are a person, and never a field value. */
  const PERSONAL_FIELDS = ['name', 'email'] as const;

  it.each(AUDIT_ACTIONS)('names neither name nor email for %s', (action: AuditAction) => {
    for (const personal of PERSONAL_FIELDS) {
      expect(RECORDABLE_FIELDS[action]).not.toContain(personal);
    }
  });

  it('covers the vocabulary exactly, so a folded-in action cannot be missed', () => {
    expect(new Set(Object.keys(RECORDABLE_FIELDS))).toEqual(new Set(AUDIT_ACTIONS));
  });
});

describe.skipIf(!HAS_DATABASE)('SEC-002 audit log', () => {
  beforeAll(async () => {
    await runner({
      databaseUrl: DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
      advisoryLockMode: 'wait',
    });
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  describe('recordAudit writes in the caller transaction (T3)', () => {
    it('commits the row when the transaction commits', async () => {
      const subjectId = randomUUID();

      await getDb()
        .transaction()
        .execute(async (trx) => {
          await recordAudit(trx, {
            actorId: randomUUID(),
            action: 'session.invalidate_all',
            subjectType: 'account',
            subjectId,
          });
        });

      const rows = await rowsFor(subjectId);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('session.invalidate_all');
      // An act whose name is the whole fact records no field on either side, and
      // an omitted side is null rather than an empty document.
      expect(rows[0]?.before).toBeNull();
      expect(rows[0]?.after).toBeNull();
    });

    it('writes nothing when the caller transaction rolls back: the audit is not best-effort', async () => {
      const subjectId = randomUUID();

      await expect(
        getDb()
          .transaction()
          .execute(async (trx) => {
            await recordAudit(trx, {
              actorId: randomUUID(),
              action: 'account.suspend',
              subjectType: 'account',
              subjectId,
            });
            // The privileged write this records then fails; the audit row must
            // leave with it, or the trail claims something happened that did not.
            throw new Error('the privileged write failed after the audit insert');
          }),
      ).rejects.toThrow('the privileged write failed');

      expect(await rowsFor(subjectId)).toHaveLength(0);
    });

    it('rolls the whole transaction back when the audit insert fails: no error is discarded', async () => {
      const subjectId = randomUUID();

      await expect(
        getDb()
          .transaction()
          .execute(async (trx) => {
            // A first, valid audit stands in for the caller's own write.
            await recordAudit(trx, {
              actorId: randomUUID(),
              action: 'account.create',
              subjectType: 'account',
              subjectId,
            });
            // The second insert is refused by the database's closed vocabulary,
            // cast past the type that would otherwise stop it at compile time.
            await recordAudit(trx, {
              actorId: randomUUID(),
              action: 'not.a.real.action' as AuditAction,
              subjectType: 'account',
              subjectId,
            });
          }),
      ).rejects.toThrow();

      // The valid first row rolled back with the failing second: recordAudit
      // discards nothing, so a failed audit takes the caller's write with it.
      expect(await rowsFor(subjectId)).toHaveLength(0);
    });

    it('records at from the database clock, never the caller', async () => {
      const subjectId = randomUUID();
      const before = Date.now();

      await getDb()
        .transaction()
        .execute(async (trx) => {
          await recordAudit(trx, {
            actorId: null,
            action: 'mail.send',
            subjectType: 'account',
            subjectId,
          });
        });

      const [row] = await rowsFor(subjectId);

      expect(row).toBeDefined();
      expect(row!.at.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(row!.at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });
  });

  describe('the allow-list is checked at the insert site (T4)', () => {
    it('refuses a personal field, takes the caller write with it, and names no value', async () => {
      const subjectId = randomUUID();
      const address = 'ada@lovelace.test';

      const refused = getDb()
        .transaction()
        .execute(async (trx) => {
          // A first, valid audit stands in for the caller's own write.
          await recordAudit(trx, {
            actorId: randomUUID(),
            action: 'account.suspend',
            subjectType: 'account',
            subjectId,
          });
          await recordAudit(trx, {
            actorId: randomUUID(),
            action: 'account.create',
            subjectType: 'account',
            subjectId,
            after: { email: address },
          });
        });

      await expect(refused).rejects.toThrow(UnrecordableFieldError);

      const error = await refusalOf(refused);
      expect(error.action).toBe('account.create');
      expect(error.field).toBe('email');
      // The action and the field name are enough to fix the call site. The value
      // is not in the message, because a refusal is reported and what is
      // reported is logged (`DATA-R02`).
      expect(error.message).toContain('account.create');
      expect(error.message).toContain('email');
      expect(error.message).not.toContain(address);
      expect(error.message).not.toContain('@');

      // The refusal rolled the valid first row back with it: a field the list
      // does not name is not dropped quietly, it fails the caller's write.
      expect(await rowsFor(subjectId)).toHaveLength(0);
    });

    it('refuses an unnamed field on the before side too, without echoing what it held', async () => {
      const subjectId = randomUUID();
      const secret = 'a value nothing should repeat';

      const refused = getDb()
        .transaction()
        .execute((trx) =>
          recordAudit(trx, {
            actorId: randomUUID(),
            action: 'account.suspend',
            subjectType: 'account',
            subjectId,
            before: { note: secret },
          }),
        );

      await expect(refused).rejects.toThrow(UnrecordableFieldError);
      await expect(refused).rejects.toThrow(/account\.suspend/);
      const error = await refusalOf(refused);
      expect(error.message).not.toContain(secret);

      expect(await rowsFor(subjectId)).toHaveLength(0);
    });

    it('round-trips the fields an action does name, through the reader the view uses', async () => {
      const actorId = randomUUID();
      const subjectId = randomUUID();

      await getDb()
        .transaction()
        .execute((trx) =>
          recordAudit(trx, {
            actorId,
            action: 'account.role_change',
            subjectType: 'account',
            subjectId,
            before: { role: 'admin' },
            after: { role: 'investor' },
          }),
        );

      const [row] = await recentAudit({ subjectId }, 10);

      expect(row?.before).toEqual({ role: 'admin' });
      expect(row?.after).toEqual({ role: 'investor' });
    });

    it('carries a number and a null through jsonb as themselves', async () => {
      const subjectId = randomUUID();

      await getDb()
        .transaction()
        .execute(async (trx) => {
          await recordAudit(trx, {
            actorId: randomUUID(),
            action: 'mail.send',
            subjectType: 'mail',
            subjectId,
            after: { subject: 'A note', recipient_count: 3 },
          });
          await recordAudit(trx, {
            actorId: randomUUID(),
            action: 'content.publish',
            subjectType: 'content_item',
            subjectId,
            // A first publication replaced nothing, and `null` is the honest
            // record of that rather than an absent side.
            before: { revision_id: null },
            after: { revision_id: subjectId },
          });
        });

      const rows = await recentAudit({ subjectId }, 10);

      expect(rows.map((row) => row.after)).toEqual([
        { revision_id: subjectId },
        { subject: 'A note', recipient_count: 3 },
      ]);
      expect(rows[0]?.before).toEqual({ revision_id: null });
    });
  });

  describe('the trail is append-only and its vocabulary is closed (T1)', () => {
    it('refuses an UPDATE on a written row', async () => {
      const subjectId = randomUUID();
      await oneRow(subjectId);

      await expect(
        getDb()
          .updateTable('audit')
          .set({ action: 'account.delete' })
          .where('subject_id', '=', subjectId)
          .execute(),
      ).rejects.toThrow(/append-only/);
    });

    it('refuses a DELETE on a written row', async () => {
      const subjectId = randomUUID();
      await oneRow(subjectId);

      await expect(
        getDb().deleteFrom('audit').where('subject_id', '=', subjectId).execute(),
      ).rejects.toThrow(/append-only/);
    });

    it('refuses a TRUNCATE, which a row-level trigger never sees', async () => {
      // The one mutation that empties the table without touching a row, and the
      // reason the second, statement-level trigger exists.
      await expect(sql`truncate table audit`.execute(getDb())).rejects.toThrow(/append-only/);
    });

    it('refuses an action the closed vocabulary does not name, in the database', async () => {
      const subjectId = randomUUID();

      // The type stops this at every call site; this is the database backstop
      // for a raw write the type never saw. The uuids are valid, so the only
      // constraint left to fail is the action check.
      await expect(
        sql`insert into audit (actor_id, action, subject_type, subject_id)
            values (${randomUUID()}::uuid, 'not.a.real.action', 'account', ${subjectId}::uuid)`.execute(
          getDb(),
        ),
      ).rejects.toThrow();

      expect(await rowsFor(subjectId)).toHaveLength(0);
    });

    it('overrides a caller-supplied at, so a held INSERT cannot backdate a row', async () => {
      const subjectId = randomUUID();

      // A raw insert that tries to plant an old timestamp: audit_force_now
      // overwrites it with now(), so a compromised application holding INSERT
      // but no UPDATE cannot hide when it acted.
      await sql`insert into audit (actor_id, action, subject_type, subject_id, at)
                values (${randomUUID()}::uuid, 'config.change', 'config', ${subjectId}::uuid, '2000-01-01T00:00:00Z')`.execute(
        getDb(),
      );

      const [row] = await rowsFor(subjectId);

      expect(row).toBeDefined();
      expect(row!.at.getFullYear()).toBeGreaterThan(2020);
    });
  });

  describe('recentAudit reads the trail for the admin view (T5)', () => {
    async function record(actorId: string, action: AuditAction, subjectId: string): Promise<void> {
      await getDb()
        .transaction()
        .execute((trx) => recordAudit(trx, { actorId, action, subjectType: 'account', subjectId }));
    }

    it('returns rows newest first and narrows by actor, action and subject', async () => {
      // A unique actor isolates this test's rows from every other suite's in the
      // shared trail, so the assertions do not depend on what else has run.
      const actor = randomUUID();
      const subjectA = randomUUID();
      const subjectB = randomUUID();
      await record(actor, 'account.create', subjectA);
      await record(actor, 'account.suspend', subjectA);
      await record(actor, 'mail.send', subjectB);

      // Newest first is the identity descending, which is insertion order
      // reversed and does not trust the clock.
      expect((await recentAudit({ actorId: actor }, 100)).map((row) => row.action)).toEqual([
        'mail.send',
        'account.suspend',
        'account.create',
      ]);
      expect((await recentAudit({ actorId: actor, action: 'account.suspend' }, 100)).map((r) => r.action)).toEqual([
        'account.suspend',
      ]);
      expect((await recentAudit({ actorId: actor, subjectId: subjectB }, 100)).map((r) => r.action)).toEqual([
        'mail.send',
      ]);
      expect(await recentAudit({ actorId: actor }, 2)).toHaveLength(2);
    });
  });
});
