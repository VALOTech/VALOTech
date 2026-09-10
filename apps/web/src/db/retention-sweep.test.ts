/**
 * The retention sweep against a real PostgreSQL (`DATA-002/T4`). It proves the
 * windows the design's §3 table names: an expired session and a consumed or
 * expired invitation go, a live one stays, a mail-log row older than two years
 * goes and a recent one stays, and the audit trail is left entirely alone.
 *
 * The sweep deletes by age across the whole database, not by account, so it runs
 * against a database this file creates for itself rather than the shared
 * development one: a sweep in the shared database would delete rows a parallel
 * suite is mid-test with, and a count here would be skewed by what another suite
 * had written. The client the test hands `sweep` is the isolated one, so the
 * deletion is contained to rows this file seeded.
 *
 * It is pg-native, like the script it tests: `sweep` takes a connected client
 * and runs the three DELETEs, and the test seeds and reads back through the same
 * client rather than through the application's Kysely layer.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sweep } from '../../scripts/retention-sweep.mjs';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_retention_sweep';
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

const DAY_MS = 24 * 60 * 60 * 1000;
const past = (ms: number) => new Date(Date.now() - ms);
const future = (ms: number) => new Date(Date.now() + ms);

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: RAW_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

describe.skipIf(!HAS_DATABASE)('DATA-002/T4 the retention sweep', () => {
  let client: pg.Client;

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
    client = new pg.Client({ connectionString: ISOLATED_DATABASE_URL });
    await client.connect();
  }, 120_000);

  beforeEach(async () => {
    // Deleting the accounts cascades to sessions, invitations and mail_log, so
    // every test starts from an empty universe; the audit trail is append-only
    // and not account-scoped, and the one test that touches it reads its own row.
    await client.query('DELETE FROM accounts');
    await client.query('DELETE FROM audit');
  });

  afterAll(async () => {
    await client.end();
  });

  async function newAccount(): Promise<string> {
    const { rows } = await client.query(
      `INSERT INTO accounts (email, name, role, state)
       VALUES ($1, 'An Investor', 'investor', 'active') RETURNING id`,
      [`${randomUUID()}@retention.test`],
    );
    return rows[0].id as string;
  }

  async function countWhere(table: string, accountId: string): Promise<number> {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE account_id = $1`,
      [accountId],
    );
    return rows[0].n as number;
  }

  it('deletes an expired session and keeps a live one', async () => {
    const account = await newAccount();
    const liveToken = randomUUID();
    await client.query(
      'INSERT INTO sessions (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [account, randomUUID(), past(DAY_MS)],
    );
    await client.query(
      'INSERT INTO sessions (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [account, liveToken, future(DAY_MS)],
    );

    expect(await sweep(client)).toMatchObject({ sessions: 1 });

    // Which row survived, not only how many: one expired, one live, so a sweep
    // that inverted the comparison would also leave exactly one — the wrong one.
    const { rows } = await client.query('SELECT token_hash FROM sessions WHERE account_id = $1', [
      account,
    ]);
    expect(rows.map((r) => r.token_hash)).toEqual([liveToken]);
  });

  it('deletes a consumed or expired invitation and keeps a live outstanding one', async () => {
    const spent = await newAccount();
    // One account holds a consumed row and an expired outstanding one — both are
    // past their window. The partial unique index allows only one outstanding
    // per account, so the live outstanding invitation is a second account's.
    await client.query(
      'INSERT INTO invitations (account_id, token_hash, expires_at, consumed_at) VALUES ($1, $2, $3, now())',
      [spent, randomUUID(), future(DAY_MS)],
    );
    await client.query(
      'INSERT INTO invitations (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [spent, randomUUID(), past(DAY_MS)],
    );
    const live = await newAccount();
    await client.query(
      'INSERT INTO invitations (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [live, randomUUID(), future(7 * DAY_MS)],
    );

    expect(await sweep(client)).toMatchObject({ invitations: 2 });

    expect(await countWhere('invitations', spent)).toBe(0);
    expect(await countWhere('invitations', live)).toBe(1);
  });

  it('deletes a mail-log row past two years and keeps a recent one', async () => {
    const account = await newAccount();
    const insertMail = (at: Date, subject: string) =>
      client.query(
        `INSERT INTO mail_log (account_id, subject, kind, state, at)
         VALUES ($1, $2, 'transactional', 'accepted', $3)`,
        [account, subject, at],
      );
    await insertMail(past(3 * 365 * DAY_MS), 'an old campaign');
    await insertMail(past(30 * DAY_MS), 'a recent campaign');

    expect(await sweep(client)).toMatchObject({ mail_log: 1 });

    // The recent row is the one that stays, not merely one of the two: inverting
    // the age comparison would keep the old row and still leave a count of one.
    const { rows } = await client.query('SELECT subject FROM mail_log WHERE account_id = $1', [
      account,
    ]);
    expect(rows.map((r) => r.subject)).toEqual(['a recent campaign']);
  });

  it('leaves the audit trail untouched, however old the row', async () => {
    const account = await newAccount();
    // The audit insert forces its own timestamp (SEC-002), so the row is "now"
    // rather than old; age is beside the point, because the sweep names no audit
    // DELETE and the append-only trigger would refuse one if it did.
    await client.query(
      `INSERT INTO audit (actor_id, action, subject_type, subject_id)
       VALUES ($1, 'account.create', 'account', $1)`,
      [account],
    );

    await sweep(client);

    const { rows } = await client.query('SELECT count(*)::int AS n FROM audit');
    expect(rows[0].n).toBe(1);
  });
});
