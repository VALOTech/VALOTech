/**
 * The room's current report (`RPT-002/T4`).
 *
 * The current report is the published report of the greatest period the reader
 * may read — by period, not by publication date, because the period is what an
 * investor means by "the latest" and the two differ when a late report is
 * published after a newer one. The claim is about which row a query returns
 * across the whole table, so it runs against a real PostgreSQL and on a database
 * of its own, kept empty of other suites' reports so that "the greatest period"
 * is a fact this suite controls.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';

import type { ContentAudience } from '../db/types';
import { createItem, saveDraft } from './items';
import { publish } from './publish';
import { currentReport } from './reports';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_report_current';

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

describe.skipIf(!HAS_DATABASE)('the room current report (RPT-002/T4)', () => {
  let authorId = '';
  const admin = (): Actor => ({ id: authorId, role: 'admin' });

  async function publishReport(period: string, audience: ContentAudience = 'investor'): Promise<string> {
    const item = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: period, period, audience });
    const revision = await saveDraft(item.id, [{ type: 'heading', level: 2, text: period }], authorId);
    await publish(item.id, revision.id, authorId);
    return item.id;
  }

  async function investor(): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `inv-${randomUUID()}@example.test`, name: 'An investor', role: 'investor', state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
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
      .values({ email: 'current-author@example.test', name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(closeDb);

  it('is null when no report has been published', async () => {
    // First, on the empty database: no report exists to be current.
    expect(await currentReport(admin())).toBeNull();
  });

  it('is the greatest period, not the most recent publication', async () => {
    await publishReport('3000-Q2');
    await publishReport('3000-Q1'); // published later, but an earlier period
    const current = await currentReport(admin());
    expect(current?.period).toBe('3000-Q2');
  });

  it('is the greatest period the reader may see, skipping one they may not', async () => {
    await publishReport('4000-Q1', 'investor');
    await publishReport('4000-Q2', 'granted'); // no grant to the investor below
    const reader = await investor();

    expect((await currentReport(reader))?.period).toBe('4000-Q1');
    expect((await currentReport(admin()))?.period).toBe('4000-Q2');
  });

  it('ignores a draft, taking the greatest published period', async () => {
    await publishReport('5000-Q1');
    await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'draft', period: '5000-Q2' });

    expect((await currentReport(admin()))?.period).toBe('5000-Q1');
  });
});
