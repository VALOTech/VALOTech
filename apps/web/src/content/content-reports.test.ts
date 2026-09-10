/**
 * One published report per period (`RPT-002/T1`, `CMS-R01`).
 *
 * "The Q3 report" must name one document, and the design makes that true in the
 * database rather than in a convention that holds until two admins work the same
 * afternoon: a partial unique index over `(type, period)` for published reports.
 * The property is a claim about what the database refuses, so it runs against a
 * real PostgreSQL — and against a database of its own, created fresh, because the
 * index is folded into a shipped migration (`DATA-R07`) that node-pg-migrate will
 * not re-apply to the shared development database.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';

import { createItem, saveDraft } from './items';
import { publish, withdraw } from './publish';

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

describe.skipIf(!HAS_DATABASE)('one published report per period (RPT-002/T1)', () => {
  let authorId = '';

  // Unique per call, so the constraint is exercised against this suite's own
  // reports and never a period a fixture elsewhere happens to publish.
  const aPeriod = (): string => `p-${randomUUID()}`;

  async function publishReport(period: string, text = 'a report'): Promise<string> {
    const item = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: period, period });
    const revision = await saveDraft(item.id, [{ type: 'heading', level: 2, text }], authorId);
    await publish(item.id, revision.id, authorId);
    return item.id;
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
});
