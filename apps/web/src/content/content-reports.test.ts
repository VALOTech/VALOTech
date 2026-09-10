/**
 * A report's period: its shape at creation (`RPT-001/T1`) and one published
 * report per period (`RPT-002/T1`, `CMS-R01`).
 *
 * A period is a report's identity, so it is fixed at creation and shaped like
 * `YYYY-Qn` or `YYYY-MM` — a malformed one is a document nobody can ask for by
 * name, and the database refuses it rather than trusting the caller. And "the Q3
 * report" must name one document, made true by a partial unique index over
 * `(type, period)` for published reports rather than by a convention that holds
 * until two admins work the same afternoon. Both are claims about what the
 * database refuses, so they run against a real PostgreSQL — and against a database
 * of their own, created fresh, because the check and the index are folded into a
 * shipped migration (`DATA-R07`) node-pg-migrate will not re-apply to the shared
 * development database.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';

import { type Block } from './blocks';
import { createItem, saveDraft } from './items';
import { publish, withdraw } from './publish';
import { DEFAULT_REPORT_STRUCTURE, markReportRead, prefillStructureFor } from './reports';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_reports';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

describe.skipIf(!HAS_DATABASE)('a report against a period (RPT-001/T1, RPT-002/T1)', () => {
  let authorId = '';

  // A distinct, well-formed period per call: a far-future year keeps each one
  // unique so two tests never collide on a period, and the shape passes the
  // format check the suite also exercises. The quarter is fixed; the year varies.
  let periodSeq = 0;
  const aPeriod = (): string => `${4001 + periodSeq++}-Q1`;

  async function publishReport(period: string, text = 'a report'): Promise<string> {
    const item = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: period, period });
    const revision = await saveDraft(item.id, [{ type: 'heading', level: 2, text }], authorId);
    await publish(item.id, revision.id, authorId);
    return item.id;
  }

  async function publishReportWith(period: string, blocks: Block[]): Promise<void> {
    const item = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: period, period });
    const revision = await saveDraft(item.id, blocks, authorId);
    await publish(item.id, revision.id, authorId);
  }

  beforeAll(async () => {
    await recreateIsolatedDatabase();
    await runner({
      databaseUrl: ISOLATED_DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
    });

    const author = await getDb()
      .insertInto('accounts')
      .values({ email: 'reports-author@example.test', name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(closeDb);

  it('refuses a second published report for a period one already holds', async () => {
    const period = aPeriod();
    await publishReport(period);

    const second = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'second', period });
    const secondRev = await saveDraft(second.id, [{ type: 'divider' }], authorId);

    // Rejected by this index by name, not by an incidental error: without the
    // partial unique index the pointer move would succeed and the period would
    // hold two published reports.
    await expect(publish(second.id, secondRev.id, authorId)).rejects.toThrow(/one_published_report_per_period/);
  });

  it('leaves a draft replacement for a live period legitimate — the index is partial on the pointer', async () => {
    const period = aPeriod();
    await publishReport(period);

    const draft = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'draft', period });
    await saveDraft(draft.id, [{ type: 'divider' }], authorId);

    const rows = await getDb().selectFrom('content_items').select('id').where('id', '=', draft.id).execute();
    expect(rows).toHaveLength(1);
  });

  it('re-publishes a corrected revision of the same report without colliding with itself', async () => {
    const period = aPeriod();
    const item = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'q', period });
    const first = await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'first' }], authorId);
    await publish(item.id, first.id, authorId);

    const corrected = await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'corrected' }], authorId);
    const republished = await publish(item.id, corrected.id, authorId);
    expect(republished.current_revision_id).toBe(corrected.id);
  });

  it('allows a published report in each distinct period', async () => {
    const first = await publishReport(aPeriod());
    const second = await publishReport(aPeriod());
    expect(first).not.toBe(second);
  });

  it('frees the period when the published report is withdrawn', async () => {
    const period = aPeriod();
    const held = await publishReport(period);
    await withdraw(held, authorId);

    const next = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'next', period });
    const nextRev = await saveDraft(next.id, [{ type: 'divider' }], authorId);
    const published = await publish(next.id, nextRev.id, authorId);
    expect(published.current_revision_id).toBe(nextRev.id);
  });

  it('creates a report against a well-formed quarterly period, and stores it (RPT-001/T1)', async () => {
    const period = aPeriod();
    const report = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'a quarter', period });
    expect(report.period).toBe(period);
  });

  it('accepts a monthly period (RPT-001/T1)', async () => {
    const report = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'a month', period: '2026-03' });
    expect(report.period).toBe('2026-03');
  });

  it.each([
    ['a quarter past four', '2026-Q5'],
    ['a thirteenth month', '2026-13'],
    ['a zeroth month', '2026-00'],
    ['a one-digit month', '2026-7'],
    ['free text', 'third quarter'],
  ])('refuses a malformed period — %s (RPT-001/T1)', async (_case, period) => {
    await expect(
      createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'malformed', period }),
    ).rejects.toThrow(/content_items_period_format/);
  });

  it('fixes the period at creation: publishing a revision does not change it (RPT-001/T1)', async () => {
    const period = aPeriod();
    const report = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'fixed', period });
    const revision = await saveDraft(report.id, [{ type: 'heading', level: 2, text: 'q' }], authorId);
    await publish(report.id, revision.id, authorId);

    const after = await getDb()
      .selectFrom('content_items')
      .select('period')
      .where('id', '=', report.id)
      .executeTakeFirstOrThrow();
    expect(after.period).toBe(period);
  });

  describe('its opening structure (RPT-001/T2)', () => {
    // authorId is set by the outer beforeAll, so the reader is read at call time.
    const admin = (): Actor => ({ id: authorId, role: 'admin' });

    it('opens a first report with the suggested structure', async () => {
      // Nothing is published below this period, so there is nothing to carry.
      expect(await prefillStructureFor('1000-Q1', admin())).toEqual(DEFAULT_REPORT_STRUCTURE);
    });

    it('carries the previous headings forward, dropping the text and taking the greatest period below', async () => {
      await publishReportWith('5000-Q1', [{ type: 'heading', level: 2, text: 'Earlier' }]);
      await publishReportWith('5000-Q2', [
        { type: 'heading', level: 2, text: 'Recent overview' },
        { type: 'paragraph', text: 'body that should not carry forward', marks: [] },
        { type: 'heading', level: 2, text: 'Recent numbers' },
        { type: 'figure', mediaId: randomUUID(), caption: null, data: ['10'] },
      ]);

      expect(await prefillStructureFor('5000-Q3', admin())).toEqual([
        { type: 'heading', level: 2, text: 'Recent overview' },
        { type: 'heading', level: 2, text: 'Recent numbers' },
      ]);
    });

    it('skips a period with no report, carrying the last that exists', async () => {
      await publishReportWith('6000-Q1', [{ type: 'heading', level: 2, text: 'Sixk' }]);
      // Q2 is a gap; the prefill for Q3 reaches back to Q1 rather than opening blank.
      expect(await prefillStructureFor('6000-Q3', admin())).toEqual([{ type: 'heading', level: 2, text: 'Sixk' }]);
    });

    it('carries forward only a published report, never a draft', async () => {
      await publishReportWith('8000-Q1', [{ type: 'heading', level: 2, text: 'Published' }]);
      const draft = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'draft', period: '8000-Q2' });
      await saveDraft(draft.id, [{ type: 'heading', level: 2, text: 'Draft' }], authorId);

      // 8000-Q2 is the greatest period below 8000-Q3 but is unpublished, so the
      // prefill takes the published 8000-Q1 rather than the draft.
      expect(await prefillStructureFor('8000-Q3', admin())).toEqual([{ type: 'heading', level: 2, text: 'Published' }]);
    });
  });

  describe('the read state (RPT-002/T6)', () => {
    const OLD = new Date('2020-01-01T00:00:00.000Z');

    async function reader(): Promise<string> {
      const row = await getDb()
        .insertInto('accounts')
        .values({ email: `rd-${randomUUID()}@example.test`, name: 'Reader', role: 'investor', state: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    }

    async function aReport(): Promise<string> {
      const item = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'r', period: aPeriod() });
      return item.id;
    }

    async function readsFor(accountId: string) {
      return getDb().selectFrom('report_reads').selectAll().where('account_id', '=', accountId).execute();
    }

    it('records a report as read, once, with a read time', async () => {
      const account = await reader();
      const report = await aReport();
      await markReportRead(account, report);

      const rows = await readsFor(account);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.item_id).toBe(report);
      expect(rows[0]?.read_at).toBeInstanceOf(Date);
    });

    it('is idempotent: a re-read keeps the first read time', async () => {
      const account = await reader();
      const report = await aReport();
      await markReportRead(account, report);
      await getDb()
        .updateTable('report_reads')
        .set({ read_at: OLD })
        .where('account_id', '=', account)
        .where('item_id', '=', report)
        .execute();
      await markReportRead(account, report);

      const rows = await readsFor(account);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.read_at).toEqual(OLD);
    });

    it('keeps a distinct row per report', async () => {
      const account = await reader();
      const a = await aReport();
      const b = await aReport();
      await markReportRead(account, a);
      await markReportRead(account, b);

      expect(await readsFor(account)).toHaveLength(2);
    });

    it('deletes the read state with the account (DATA-002)', async () => {
      const account = await reader();
      const report = await aReport();
      await markReportRead(account, report);

      await getDb().deleteFrom('accounts').where('id', '=', account).execute();
      expect(await readsFor(account)).toHaveLength(0);
    });

    it('records nothing for an account that objected to read-tracking (LEGAL-GLOBAL-001/T3)', async () => {
      const account = await reader();
      const report = await aReport();
      await getDb().updateTable('accounts').set({ read_tracking_objected: true }).where('id', '=', account).execute();

      await markReportRead(account, report);
      expect(await readsFor(account)).toHaveLength(0);
    });
  });
});
