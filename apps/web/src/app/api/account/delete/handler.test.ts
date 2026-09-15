/**
 * `POST /api/account/delete` — the reader's own erasure (`ADMIN-DEC-06`,
 * `DATA-R03`).
 *
 * **The load-bearing pair is that one refusal travels from the console and one
 * does not.** `eraseAccount` refuses an actor erasing their own account
 * (`ADMIN-DEC-01`), and carrying that rule onto this path would refuse every
 * request this surface exists to serve — a defect that would ship looking
 * exactly like a working guard, because the answer is the same `false` a no-op
 * returns. So one test erases an investor's own account and reads the row, and
 * another erases an admin's own while a second admin remains. The stranding
 * refusal is asserted the other way: the last admin who can sign in presses, and
 * the account is still there afterwards.
 *
 * **It owns its database.** The guard counts every active admin in the database,
 * so a test of "the last one" is deterministic only where this file owns the
 * whole set; the development server it would otherwise share carries suites that
 * create active admins of their own.
 *
 * **A completed erasure is read from the rows and not from the answer.** A
 * handler that answered the sign-out and deleted nothing returns exactly what a
 * correct one returns, so each positive test reads the account row, its sessions
 * and the trail.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import { closeDb, getDb } from '../../../../db/index';
import type { AccountRole } from '../../../../db/types';

import { handleAccountDelete } from './handler';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_self_delete';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'migrations',
);

const ORIGIN = 'http://localhost:3100';
const READER_NAME = 'Ada Lovelace';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
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

describe.skipIf(!HAS_DATABASE)('POST /api/account/delete (ADMIN-DEC-06)', () => {
  interface Reader {
    readonly id: string;
    readonly cookie: string;
  }

  async function signedIn(role: AccountRole = 'investor', name = READER_NAME): Promise<Reader> {
    const row = await getDb()
      .insertInto('accounts')
      .values({
        email: `${randomUUID()}@self-delete.test`,
        name,
        role,
        state: 'active',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(row.id);

    return { id: row.id, cookie: `${cookie.name}=${cookie.value}` };
  }

  function post(
    fields: Record<string, string>,
    options: { cookie?: string; origin?: string } = {},
  ): Request {
    const headers = new Headers();
    if (options.cookie !== undefined) {
      headers.set('Cookie', options.cookie);
    }
    if (options.origin !== undefined) {
      headers.set('Origin', options.origin);
    }

    return new Request(`${ORIGIN}/api/account/delete`, {
      method: 'POST',
      headers,
      body: new URLSearchParams(fields),
    });
  }

  function erase(reader: Reader, confirmName = READER_NAME): Promise<Response> {
    return handleAccountDelete(post({ confirmName }, { cookie: reader.cookie }));
  }

  async function exists(accountId: string): Promise<boolean> {
    return (
      (await getDb()
        .selectFrom('accounts')
        .select('id')
        .where('id', '=', accountId)
        .executeTakeFirst()) !== undefined
    );
  }

  async function auditRows(
    accountId: string,
  ): Promise<{ actor_id: string | null; action: string }[]> {
    return getDb()
      .selectFrom('audit')
      .select(['actor_id', 'action'])
      .where('subject_id', '=', accountId)
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

  // The stranding guard counts every active admin in the database, so each test
  // starts from a set it fully declares rather than from whatever the one before
  // it left behind. Sessions cascade on `account_id`; the trail is append-only
  // and is not cleared, which costs nothing because every assertion about it is
  // keyed by the fresh account id the test just minted (`DATA-R09`).
  beforeEach(async () => {
    await getDb().deleteFrom('accounts').execute();
  });

  afterAll(closeDb);

  it('erases the reader’s own account, which is the whole point of this door', async () => {
    const reader = await signedIn();

    const response = await erase(reader);

    expect(await exists(reader.id)).toBe(false);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('takes the sessions with it, so the cookie in the browser resolves to nobody', async () => {
    const reader = await signedIn();
    await issue(reader.id);

    await erase(reader);

    expect(
      await getDb().selectFrom('sessions').select('id').where('account_id', '=', reader.id).execute(),
    ).toEqual([]);
  });

  it('records the erasure with the reader as both actor and subject', async () => {
    const reader = await signedIn();

    await erase(reader);

    expect(await auditRows(reader.id)).toEqual([
      { actor_id: reader.id, action: 'account.delete' },
    ]);
  });

  it('lets an admin erase their own account while another admin can still sign in', async () => {
    await signedIn('admin', 'Grace Hopper');
    const reader = await signedIn('admin');

    await erase(reader);

    expect(await exists(reader.id)).toBe(false);
  });

  it('refuses the last admin who can sign in, and writes nothing', async () => {
    const reader = await signedIn('admin');

    const response = await erase(reader);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/hall/account?outcome=delete-last-admin');
    expect(await exists(reader.id)).toBe(true);
    expect(await auditRows(reader.id)).toEqual([]);
  });

  it('counts admins who can sign in, so a suspended second admin does not unlock it', async () => {
    const suspended = await signedIn('admin', 'Grace Hopper');
    await getDb()
      .updateTable('accounts')
      .set({ state: 'suspended' })
      .where('id', '=', suspended.id)
      .execute();
    const reader = await signedIn('admin');

    const response = await erase(reader);

    expect(response.headers.get('Location')).toBe('/hall/account?outcome=delete-last-admin');
    expect(await exists(reader.id)).toBe(true);
  });

  it('refuses a typed name that is not the name on the account', async () => {
    const reader = await signedIn();

    const response = await erase(reader, 'ada lovelace');

    expect(response.headers.get('Location')).toBe('/hall/account?outcome=delete-name-mismatch');
    expect(await exists(reader.id)).toBe(true);
  });

  it('forgives surrounding whitespace in the typed name, and nothing else', async () => {
    const reader = await signedIn();

    const response = await erase(reader, `  ${READER_NAME}\n`);

    expect(await exists(reader.id)).toBe(false);
    expect(response.headers.get('Location')).toBe('/');
  });

  it('erases the session’s account and never an id in the body', async () => {
    const stranger = await signedIn('investor', 'Grace Hopper');
    const reader = await signedIn();

    await handleAccountDelete(
      post(
        {
          confirmName: READER_NAME,
          accountId: stranger.id,
          account_id: stranger.id,
          id: stranger.id,
        },
        { cookie: reader.cookie },
      ),
    );

    expect(await exists(reader.id)).toBe(false);
    expect(await exists(stranger.id)).toBe(true);
  });

  it('sends a caller with no session to sign in, and erases nothing', async () => {
    const reader = await signedIn();

    const response = await handleAccountDelete(post({ confirmName: READER_NAME }));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in');
    expect(await exists(reader.id)).toBe(true);
  });

  it('refuses a cross-site post before it reads anything', async () => {
    const reader = await signedIn();

    const response = await handleAccountDelete(
      post(
        { confirmName: READER_NAME },
        { cookie: reader.cookie, origin: 'https://elsewhere.test' },
      ),
    );

    expect(response.status).toBe(403);
    expect(await exists(reader.id)).toBe(true);
  });

  it('answers a body carrying no typed name with a status about the request', async () => {
    const reader = await signedIn();

    const response = await handleAccountDelete(post({}, { cookie: reader.cookie }));

    expect(response.status).toBe(400);
    expect(await exists(reader.id)).toBe(true);
  });
});
