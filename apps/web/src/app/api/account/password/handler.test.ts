/**
 * `POST /api/account/password` — the reader's own password change
 * (`ADMIN-DEC-06`).
 *
 * **Three claims here would each pass silently if the implementation were
 * wrong, so each is asserted against the database rather than against a return
 * value.** That the current password is genuinely demanded: a handler that
 * skipped the verification answers exactly what a correct one answers, so the
 * test drives it with a wrong current password and reads the stored hash. That
 * the change reaches the password: the response says nothing about what was
 * written, so the new password is verified against the stored hash and the old
 * one is verified against it too, and has to fail. And that every other session
 * really ended: a handler that wrote the hash and left the sessions standing
 * returns the same `303`, so the rows are counted and the old cookie is offered
 * to the gate, which is what a copied cookie actually meets.
 *
 * **The account acted on is the session's.** One test posts another account's
 * id beside the fields and asserts the other account is untouched, which passes
 * for the handler as written and fails the moment a subject is read out of a
 * request (`DATA-R05`).
 *
 * On a database of its own, because these are claims about what the tables hold.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveSession } from '../../../../auth/gate';
import { hashPassword, verifyPassword } from '../../../../auth/password';
import { MIN_PASSWORD_LENGTH } from '../../../../auth/password-policy';
import { issue, serializeCookie, tokenOfCookie } from '../../../../auth/session';
import { closeDb, getDb } from '../../../../db/index';

import { handleAccountPassword } from './handler';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_self_password';

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

/** Comfortably past `MIN_PASSWORD_LENGTH` and not in the common-password list. */
const OLD_PASSWORD = 'correct horse staple 71';
const NEW_PASSWORD = 'trombone marmalade 4412';

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

describe.skipIf(!HAS_DATABASE)('POST /api/account/password (ADMIN-DEC-06)', () => {
  interface Reader {
    readonly id: string;
    readonly cookie: string;
  }

  async function signedIn(password: string | null = OLD_PASSWORD): Promise<Reader> {
    const row = await getDb()
      .insertInto('accounts')
      .values({
        email: `${randomUUID()}@self-password.test`,
        name: 'An Investor',
        role: 'investor',
        state: 'active',
        password_hash: password === null ? null : await hashPassword(password),
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

    return new Request(`${ORIGIN}/api/account/password`, {
      method: 'POST',
      headers,
      body: new URLSearchParams(fields),
    });
  }

  function change(reader: Reader, current: string, next: string): Promise<Response> {
    return handleAccountPassword(
      post({ currentPassword: current, newPassword: next }, { cookie: reader.cookie }),
    );
  }

  async function storedHash(accountId: string): Promise<string | null> {
    const row = await getDb()
      .selectFrom('accounts')
      .select('password_hash')
      .where('id', '=', accountId)
      .executeTakeFirstOrThrow();

    return row.password_hash;
  }

  async function sessionCount(accountId: string): Promise<number> {
    return (
      await getDb().selectFrom('sessions').select('id').where('account_id', '=', accountId).execute()
    ).length;
  }

  async function auditRows(accountId: string): Promise<{ actor_id: string | null; action: string }[]> {
    return getDb()
      .selectFrom('audit')
      .select(['actor_id', 'action'])
      .where('subject_id', '=', accountId)
      .execute();
  }

  /** The token inside a `Set-Cookie` the handler wrote, or `null` when it wrote none. */
  function issuedToken(response: Response): string | null {
    const header = response.headers.get('Set-Cookie');
    if (header === null) {
      return null;
    }

    const pair = header.split(';')[0] ?? '';

    return tokenOfCookie(pair.slice(pair.indexOf('=') + 1));
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

  it('replaces the password, so the new one verifies and the old one no longer does', async () => {
    const reader = await signedIn();

    const response = await change(reader, OLD_PASSWORD, NEW_PASSWORD);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/hall/account?outcome=password-changed');

    const stored = await storedHash(reader.id);
    expect(await verifyPassword(stored, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(stored, OLD_PASSWORD)).toBe(false);
  });

  it('refuses without the current password and leaves the stored hash where it was', async () => {
    const reader = await signedIn();
    const before = await storedHash(reader.id);

    const response = await change(reader, 'not the password', NEW_PASSWORD);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/hall/account?outcome=password-refused');
    expect(await storedHash(reader.id)).toBe(before);
    expect(await verifyPassword(await storedHash(reader.id), OLD_PASSWORD)).toBe(true);
  });

  it('refuses an account that holds no password at all', async () => {
    const reader = await signedIn(null);

    const response = await change(reader, OLD_PASSWORD, NEW_PASSWORD);

    expect(response.headers.get('Location')).toBe('/hall/account?outcome=password-refused');
    expect(await storedHash(reader.id)).toBeNull();
  });

  it('ends every session the account held, including the one that asked', async () => {
    const reader = await signedIn();
    await issue(reader.id);
    await issue(reader.id);
    expect(await sessionCount(reader.id)).toBe(3);

    const response = await change(reader, OLD_PASSWORD, NEW_PASSWORD);

    // One row, and it is the session this response issued rather than any that
    // stood before it: the old cookie is offered to the gate, which is what a
    // copied cookie actually meets.
    expect(await sessionCount(reader.id)).toBe(1);
    const presented = reader.cookie.slice(reader.cookie.indexOf('=') + 1);
    expect(await resolveSession(tokenOfCookie(presented))).toBeNull();

    const issued = issuedToken(response);
    expect(issued).not.toBeNull();
    expect(await resolveSession(issued)).toEqual({ id: reader.id, role: 'investor' });
  });

  it('records the invalidation against the account itself', async () => {
    const reader = await signedIn();

    await change(reader, OLD_PASSWORD, NEW_PASSWORD);

    expect(await auditRows(reader.id)).toEqual([
      { actor_id: reader.id, action: 'session.invalidate_all' },
    ]);
  });

  it('writes nothing and records nothing when the current password is wrong', async () => {
    const reader = await signedIn();
    await issue(reader.id);

    await change(reader, 'not the password', NEW_PASSWORD);

    expect(await sessionCount(reader.id)).toBe(2);
    expect(await auditRows(reader.id)).toEqual([]);
  });

  it('refuses a new password the policy refuses, before anything is written', async () => {
    const reader = await signedIn();
    const before = await storedHash(reader.id);

    const short = await change(reader, OLD_PASSWORD, 'a'.repeat(MIN_PASSWORD_LENGTH - 1));
    const long = await change(reader, OLD_PASSWORD, 'a'.repeat(1000));
    // Past the floor, so what refuses it is the common list and not the length.
    const common = await change(reader, OLD_PASSWORD, 'passwordpassword');

    expect(short.headers.get('Location')).toBe('/hall/account?outcome=password-too-short');
    expect(long.headers.get('Location')).toBe('/hall/account?outcome=password-too-long');
    expect(common.headers.get('Location')).toBe('/hall/account?outcome=password-too-common');
    expect(await storedHash(reader.id)).toBe(before);
  });

  it('acts on the session’s account and never on an id in the body', async () => {
    const reader = await signedIn();
    const stranger = await signedIn();
    const strangerBefore = await storedHash(stranger.id);

    await handleAccountPassword(
      post(
        {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
          accountId: stranger.id,
          account_id: stranger.id,
          id: stranger.id,
        },
        { cookie: reader.cookie },
      ),
    );

    expect(await verifyPassword(await storedHash(reader.id), NEW_PASSWORD)).toBe(true);
    expect(await storedHash(stranger.id)).toBe(strangerBefore);
    expect(await sessionCount(stranger.id)).toBe(1);
  });

  it('sends a caller with no session to sign in, and writes nothing', async () => {
    const reader = await signedIn();
    const before = await storedHash(reader.id);

    const response = await handleAccountPassword(
      post({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in');
    expect(await storedHash(reader.id)).toBe(before);
  });

  it('refuses a cross-site post before it reads anything', async () => {
    const reader = await signedIn();
    const before = await storedHash(reader.id);

    const response = await handleAccountPassword(
      post(
        { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
        { cookie: reader.cookie, origin: 'https://elsewhere.test' },
      ),
    );

    expect(response.status).toBe(403);
    expect(await storedHash(reader.id)).toBe(before);
  });

  it('answers a body that is not two strings with a status about the request', async () => {
    const reader = await signedIn();

    const response = await handleAccountPassword(
      post({ currentPassword: OLD_PASSWORD }, { cookie: reader.cookie }),
    );

    expect(response.status).toBe(400);
    expect(await verifyPassword(await storedHash(reader.id), OLD_PASSWORD)).toBe(true);
  });

  it('stops guessing at the current password once the limit is spent', async () => {
    const reader = await signedIn();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const refused = await change(reader, 'not the password', NEW_PASSWORD);
      expect(refused.headers.get('Location')).toBe('/hall/account?outcome=password-refused');
    }

    // The right password now, so what refuses it is the limit and nothing else.
    const limited = await change(reader, OLD_PASSWORD, NEW_PASSWORD);

    expect(limited.headers.get('Location')).toBe('/hall/account?outcome=password-too-many');
    expect(await verifyPassword(await storedHash(reader.id), OLD_PASSWORD)).toBe(true);
  });
});
