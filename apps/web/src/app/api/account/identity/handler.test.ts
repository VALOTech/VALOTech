/**
 * `POST /api/account/identity` — the reader's own name and address
 * (`ADMIN-DEC-06`).
 *
 * **The act is `correctIdentity`, so what is tested here is the reader's door to
 * it rather than the act's own refusals**, which `ADMIN-001/T10`'s suite already
 * pins from the console side. Three things are this door's alone and are
 * asserted against the rows: that the account corrected is the session's and
 * never an id in the body (`DATA-R05`); that the audit row names the reader as
 * the actor and holds neither of the two values it moved (`SEC-DEC-01`); and
 * that an address another account holds is refused without the answer saying so,
 * because an investor cannot read the account list an admin can and an answer
 * naming the condition would turn this form into a test for whether a named
 * person holds an account here.
 *
 * On a database of its own, because these are claims about what the tables hold.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import { closeDb, getDb } from '../../../../db/index';
import type { Json } from '../../../../db/types';

import { handleAccountIdentity } from './handler';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_self_identity';

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
const MAX_ATTEMPTS = 4;

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.AUTH_MAX_ATTEMPTS = String(MAX_ATTEMPTS);

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

describe.skipIf(!HAS_DATABASE)('POST /api/account/identity (ADMIN-DEC-06)', () => {
  interface Reader {
    readonly id: string;
    readonly email: string;
    readonly cookie: string;
  }

  async function signedIn(name = 'Ada Lovelace'): Promise<Reader> {
    const email = `${randomUUID()}@self-identity.test`;
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name, role: 'investor', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(row.id);

    return { id: row.id, email, cookie: `${cookie.name}=${cookie.value}` };
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

    return new Request(`${ORIGIN}/api/account/identity`, {
      method: 'POST',
      headers,
      body: new URLSearchParams(fields),
    });
  }

  function correct(reader: Reader, name: string, email: string): Promise<Response> {
    return handleAccountIdentity(post({ name, email }, { cookie: reader.cookie }));
  }

  async function held(accountId: string): Promise<{ name: string; email: string }> {
    return getDb()
      .selectFrom('accounts')
      .select(['name', 'email'])
      .where('id', '=', accountId)
      .executeTakeFirstOrThrow();
  }

  async function auditRows(
    accountId: string,
  ): Promise<{ actor_id: string | null; action: string; before: Json; after: Json }[]> {
    return getDb()
      .selectFrom('audit')
      .select(['actor_id', 'action', 'before', 'after'])
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

  afterAll(closeDb);

  it('saves the reader’s own name and address', async () => {
    const reader = await signedIn();
    const wanted = `${randomUUID()}@self-identity.test`;

    const response = await correct(reader, 'Ada Byron', wanted);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/hall/account?outcome=identity-changed');
    expect(await held(reader.id)).toEqual({ name: 'Ada Byron', email: wanted });
  });

  it('says nothing changed when the row already holds what was asked for', async () => {
    const reader = await signedIn();

    const response = await correct(reader, 'Ada Lovelace', reader.email.toUpperCase());

    expect(response.headers.get('Location')).toBe('/hall/account?outcome=identity-unchanged');
    expect(await held(reader.id)).toEqual({ name: 'Ada Lovelace', email: reader.email });
    expect(await auditRows(reader.id)).toEqual([]);
  });

  it('records the act against the reader and neither of the values it moved', async () => {
    const reader = await signedIn();
    const wanted = `${randomUUID()}@self-identity.test`;

    await correct(reader, 'Ada Byron', wanted);

    const rows = await auditRows(reader.id);
    expect(rows).toEqual([
      {
        actor_id: reader.id,
        action: 'account.correct',
        before: null,
        after: { fields: 'name,email' },
      },
    ]);
    // Read whole rather than field by field: a value leaking into a column this
    // assertion did not name would pass a check that only looked where it
    // expected one.
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain(wanted);
    expect(serialised).not.toContain(reader.email);
    expect(serialised).not.toContain('Ada');
  });

  it('refuses an address another account holds, without saying that is why', async () => {
    const reader = await signedIn();
    const stranger = await signedIn();

    const response = await correct(reader, 'Ada Lovelace', stranger.email);

    expect(response.headers.get('Location')).toBe(
      '/hall/account?outcome=identity-email-unavailable',
    );
    expect(await held(reader.id)).toEqual({ name: 'Ada Lovelace', email: reader.email });
    expect(await held(stranger.id)).toEqual({ name: 'Ada Lovelace', email: stranger.email });
    expect(await auditRows(reader.id)).toEqual([]);
  });

  it('refuses a blank name and an address the column cannot take, each by name', async () => {
    const reader = await signedIn();

    const blank = await correct(reader, '   ', reader.email);
    const malformed = await correct(reader, 'Ada Lovelace', 'not-an-address');

    expect(blank.headers.get('Location')).toBe('/hall/account?outcome=identity-name-needed');
    expect(malformed.headers.get('Location')).toBe('/hall/account?outcome=identity-email-invalid');
    expect(await held(reader.id)).toEqual({ name: 'Ada Lovelace', email: reader.email });
  });

  it('stops an invitation the reader had not used when the address moves, and says so', async () => {
    const reader = await signedIn();
    await getDb()
      .insertInto('invitations')
      .values({
        account_id: reader.id,
        token_hash: randomUUID(),
        expires_at: new Date(Date.now() + 3_600_000),
      })
      .execute();

    const response = await correct(reader, 'Ada Lovelace', `${randomUUID()}@self-identity.test`);

    expect(response.headers.get('Location')).toBe(
      '/hall/account?outcome=identity-changed-invitation-ended',
    );
    expect(
      await getDb()
        .selectFrom('invitations')
        .select('id')
        .where('account_id', '=', reader.id)
        .execute(),
    ).toEqual([]);
  });

  it('leaves every live session standing, because access has not moved', async () => {
    const reader = await signedIn();
    await issue(reader.id);

    await correct(reader, 'Ada Byron', `${randomUUID()}@self-identity.test`);

    expect(
      await getDb().selectFrom('sessions').select('id').where('account_id', '=', reader.id).execute(),
    ).toHaveLength(2);
  });

  it('acts on the session’s account and never on an id in the body', async () => {
    const reader = await signedIn();
    const stranger = await signedIn('Grace Hopper');
    const wanted = `${randomUUID()}@self-identity.test`;

    await handleAccountIdentity(
      post(
        {
          name: 'Ada Byron',
          email: wanted,
          accountId: stranger.id,
          account_id: stranger.id,
          id: stranger.id,
        },
        { cookie: reader.cookie },
      ),
    );

    expect(await held(reader.id)).toEqual({ name: 'Ada Byron', email: wanted });
    expect(await held(stranger.id)).toEqual({ name: 'Grace Hopper', email: stranger.email });
  });

  it('sends a caller with no session to sign in, and writes nothing', async () => {
    const reader = await signedIn();

    const response = await handleAccountIdentity(
      post({ name: 'Somebody Else', email: `${randomUUID()}@self-identity.test` }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in');
    expect(await held(reader.id)).toEqual({ name: 'Ada Lovelace', email: reader.email });
  });

  it('refuses a cross-site post before it reads anything', async () => {
    const reader = await signedIn();

    const response = await handleAccountIdentity(
      post(
        { name: 'Somebody Else', email: `${randomUUID()}@self-identity.test` },
        { cookie: reader.cookie, origin: 'https://elsewhere.test' },
      ),
    );

    expect(response.status).toBe(403);
    expect(await held(reader.id)).toEqual({ name: 'Ada Lovelace', email: reader.email });
  });

  it('answers a body missing a field with a status about the request', async () => {
    const reader = await signedIn();

    const response = await handleAccountIdentity(
      post({ name: 'Ada Byron' }, { cookie: reader.cookie }),
    );

    expect(response.status).toBe(400);
    expect(await held(reader.id)).toEqual({ name: 'Ada Lovelace', email: reader.email });
  });

  it('stops addresses being tried one after another once the limit is spent', async () => {
    const reader = await signedIn();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const tried = await correct(reader, 'Ada Lovelace', `${randomUUID()}@self-identity.test`);
      expect(tried.headers.get('Location')).toBe('/hall/account?outcome=identity-changed');
    }

    const limited = await correct(reader, 'Ada Lovelace', `${randomUUID()}@self-identity.test`);

    expect(limited.headers.get('Location')).toBe('/hall/account?outcome=identity-too-many');
  });
});
