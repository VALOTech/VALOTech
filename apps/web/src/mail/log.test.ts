/**
 * The admin mail log, filtered by recipient and by day (`MAIL-002/T6`).
 *
 * Claims about which rows a filter returns, so they run against a real
 * PostgreSQL on a database of their own with rows planted at known instants.
 *
 * **The day filter is the part worth testing hard.** It is inclusive at both
 * ends, and the boundary is where an off-by-one hides: a row at `00:00:00` on
 * the opening day and one at `23:59:59` on the closing day both belong, and a
 * half-open range computed from the wrong end drops one of them silently. So
 * every test here plants a row at each edge rather than in the middle.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import type { MailLogKind, MailLogState } from '../db/types';

import { dayEnd, dayStart, recentMail } from './log';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_mail_log_view';

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

describe('reading a day off a query string (MAIL-002/T6)', () => {
  it('takes a day as the instant it begins in UTC, and the next day as its end', () => {
    expect(dayStart('2026-03-04')?.toISOString()).toBe('2026-03-04T00:00:00.000Z');
    expect(dayEnd('2026-03-04')?.toISOString()).toBe('2026-03-05T00:00:00.000Z');
  });

  it('narrows nothing for a value that is not a day', () => {
    // A query string is typed by a person and re-sent by a bookmark. A date
    // somebody mistyped narrows nothing rather than failing the page.
    for (const value of [undefined, '', 'yesterday', '2026-3-4', '04/03/2026', '2026-02-31']) {
      expect(dayStart(value)).toBeNull();
      expect(dayEnd(value)).toBeNull();
    }
  });

  it('crosses a month and a year without losing a day', () => {
    expect(dayEnd('2026-01-31')?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(dayEnd('2026-12-31')?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe.skipIf(!HAS_DATABASE)('the mail log an admin reads (MAIL-002/T6)', () => {
  async function account(name: string): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `${randomUUID()}@mail-log.test`, name, role: 'investor', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function logged(
    accountId: string,
    at: string,
    subject: string,
    state: MailLogState = 'accepted',
    kind: MailLogKind = 'bulk',
    error: string | null = null,
  ): Promise<void> {
    await getDb()
      .insertInto('mail_log')
      .values({ account_id: accountId, at: new Date(at), subject, kind, state, error })
      .execute();
  }

  let ada: string;
  let grace: string;

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

    ada = await account('Ada Lovelace');
    grace = await account('Grace Hopper');

    await logged(ada, '2026-03-03T23:59:59.000Z', 'the day before');
    await logged(ada, '2026-03-04T00:00:00.000Z', 'the opening edge');
    await logged(ada, '2026-03-05T23:59:59.000Z', 'the closing edge');
    await logged(ada, '2026-03-06T00:00:00.000Z', 'the day after');
    await logged(grace, '2026-03-04T12:00:00.000Z', 'somebody else', 'failed', 'bulk', '550 refused');
    await logged(grace, '2026-03-04T13:00:00.000Z', 'never answered for', 'queued');
  }, 120_000);

  afterAll(closeDb);

  async function subjects(filter: Parameters<typeof recentMail>[0]): Promise<string[]> {
    return (await recentMail(filter, 100)).map((row) => row.subject);
  }

  it('returns everything, newest first, when nothing narrows it', async () => {
    expect(await subjects({})).toEqual([
      'never answered for',
      'somebody else',
      'the day after',
      'the closing edge',
      'the opening edge',
      'the day before',
    ]);
  });

  it('narrows to one recipient', async () => {
    expect(await subjects({ accountId: grace })).toEqual(['never answered for', 'somebody else']);
  });

  it('includes both edges of the day range and neither day outside it', async () => {
    expect(await subjects({ accountId: ada, from: '2026-03-04', to: '2026-03-05' })).toEqual([
      'the closing edge',
      'the opening edge',
    ]);
  });

  it('takes each end of the range on its own', async () => {
    expect(await subjects({ accountId: ada, from: '2026-03-05' })).toEqual([
      'the day after',
      'the closing edge',
    ]);
    expect(await subjects({ accountId: ada, to: '2026-03-04' })).toEqual([
      'the opening edge',
      'the day before',
    ]);
  });

  it('narrows a single day to that day alone', async () => {
    expect(await subjects({ accountId: ada, from: '2026-03-04', to: '2026-03-04' })).toEqual([
      'the opening edge',
    ]);
  });

  it('carries the state, the reply and the recipient’s name, and never their address', async () => {
    const rows = await recentMail({ accountId: grace }, 100);

    expect(rows.map((row) => [row.state, row.error])).toEqual([
      ['queued', null],
      ['failed', '550 refused'],
    ]);
    expect(rows.every((row) => row.recipientName === 'Grace Hopper')).toBe(true);
    // The log is keyed by account; the address is on the account and is deleted
    // with it (`DATA-R02`), so nothing this view returns can carry one.
    expect(JSON.stringify(rows)).not.toContain('@mail-log.test');
  });

  it('bounds the window it returns', async () => {
    expect(await recentMail({}, 2)).toHaveLength(2);
  });
});
