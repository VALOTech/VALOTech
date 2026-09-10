/**
 * Resolving a mail send's recipients (`MAIL-001/T2`, `MAIL-001/T3`).
 *
 * A selection becomes a confirmed list, and a suspended or unsubscribed account is
 * excluded with the reason. It is a claim about what the database yields for a set
 * of ids, so it runs against a real PostgreSQL — on a database of its own, so the
 * accounts the suite reasons about are only the ones it made.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import type { AccountState } from '../db/types';

import { resolveRecipients } from './recipients';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_mail';

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

describe.skipIf(!HAS_DATABASE)('resolveRecipients (MAIL-001/T2, T3)', () => {
  async function account(name: string, state: AccountState = 'active'): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `${randomUUID()}@example.test`, name, role: 'investor', state })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function unsubscribe(accountId: string): Promise<void> {
    await getDb()
      .insertInto('unsubscribes')
      .values({ account_id: accountId, source: 'admin', reason: 'asked to stop' })
      .execute();
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
  }, 120_000);

  afterAll(closeDb);

  it('resolves selected active accounts into recipients, ordered by name', async () => {
    const beth = await account('Beth');
    const ada = await account('Ada');

    const resolved = await resolveRecipients([beth, ada]);
    expect(resolved.recipients.map((r) => r.name)).toEqual(['Ada', 'Beth']);
    expect(resolved.excluded).toEqual([]);
  });

  it('excludes a suspended account with the reason', async () => {
    const active = await account('Active One');
    const suspended = await account('Suspended One', 'suspended');

    const resolved = await resolveRecipients([active, suspended]);
    expect(resolved.recipients.map((r) => r.id)).toEqual([active]);
    expect(resolved.excluded).toEqual([{ id: suspended, name: 'Suspended One', reason: 'suspended' }]);
  });

  it('excludes an unsubscribed account with the reason', async () => {
    const kept = await account('Kept');
    const unsub = await account('Unsubbed');
    await unsubscribe(unsub);

    const resolved = await resolveRecipients([kept, unsub]);
    expect(resolved.recipients.map((r) => r.id)).toEqual([kept]);
    expect(resolved.excluded).toEqual([{ id: unsub, name: 'Unsubbed', reason: 'unsubscribed' }]);
  });

  it('shows suspended rather than unsubscribed when an account is both', async () => {
    const both = await account('Both', 'suspended');
    await unsubscribe(both);

    const resolved = await resolveRecipients([both]);
    expect(resolved.excluded).toEqual([{ id: both, name: 'Both', reason: 'suspended' }]);
  });

  it('keeps an invited account as a recipient', async () => {
    const invited = await account('Invitee', 'invited');
    const resolved = await resolveRecipients([invited]);
    expect(resolved.recipients.map((r) => r.id)).toEqual([invited]);
  });

  it('resolves only the selected ids, and nothing for an empty selection', async () => {
    const chosen = await account('Chosen');
    await account('Unchosen');

    const resolved = await resolveRecipients([chosen]);
    expect(resolved.recipients.map((r) => r.name)).toEqual(['Chosen']);
    expect(await resolveRecipients([])).toEqual({ recipients: [], excluded: [] });
  });
});
