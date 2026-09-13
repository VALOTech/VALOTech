/**
 * `POST /api/account/mail` (`MAIL-002/T2`).
 *
 * **The load-bearing test is that the account acted on is the session's.** The
 * form carries an intent and nothing else, and a handler that ever read an id
 * out of the body would be an unsubscribe anybody could aim at anybody. So one
 * test posts another account's id alongside the intent and asserts the other
 * account was untouched — which passes for the handler as written and fails the
 * moment a subject is taken from a request.
 *
 * On a database of its own, because these are claims about what the list holds.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import { closeDb, getDb } from '../../../../db/index';
import { stopInvestorMail } from '../../../../mail/unsubscribe';

import { handleAccountMail } from './handler';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_account_mail';

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

describe.skipIf(!HAS_DATABASE)('POST /api/account/mail (MAIL-002/T2)', () => {
  async function signedIn(): Promise<{ id: string; cookie: string }> {
    const row = await getDb()
      .insertInto('accounts')
      .values({
        email: `${randomUUID()}@account-mail.test`,
        name: 'An Investor',
        role: 'investor',
        state: 'active',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(row.id);

    return { id: row.id, cookie: `${cookie.name}=${cookie.value}` };
  }

  function post(
    fields: Record<string, string>,
    options: { cookie?: string; origin?: string; raw?: BodyInit } = {},
  ): Request {
    const headers = new Headers();
    if (options.cookie !== undefined) {
      headers.set('Cookie', options.cookie);
    }
    if (options.origin !== undefined) {
      headers.set('Origin', options.origin);
    }

    return new Request(`${ORIGIN}/api/account/mail`, {
      method: 'POST',
      headers,
      body: options.raw ?? new URLSearchParams(fields),
    });
  }

  async function stopped(accountId: string): Promise<boolean> {
    return (
      (await getDb()
        .selectFrom('unsubscribes')
        .select('account_id')
        .where('account_id', '=', accountId)
        .executeTakeFirst()) !== undefined
    );
  }

  async function auditCount(accountId: string): Promise<number> {
    return (
      await getDb().selectFrom('audit').select('id').where('subject_id', '=', accountId).execute()
    ).length;
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

  it('stops the reader’s own investor mail and records it against them', async () => {
    const reader = await signedIn();

    const response = await handleAccountMail(
      post({ intent: 'stop' }, { cookie: reader.cookie, origin: ORIGIN }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/account/mail');
    expect(await stopped(reader.id)).toBe(true);
    expect(await auditCount(reader.id)).toBe(1);
  });

  it('starts it again, and records nothing for it', async () => {
    const reader = await signedIn();
    await stopInvestorMail({ by: 'person', accountId: reader.id });

    const response = await handleAccountMail(post({ intent: 'resume' }, { cookie: reader.cookie }));

    expect(response.status).toBe(303);
    expect(await stopped(reader.id)).toBe(false);
    // The stop is recorded; starting again is the person's own preference over
    // their own inbox and the trail has no act that names it (`MAIL-DEC-06`).
    expect(await auditCount(reader.id)).toBe(1);
  });

  it('acts on the session’s account and never on an id in the body', async () => {
    const reader = await signedIn();
    const stranger = await signedIn();

    await handleAccountMail(
      post({ intent: 'stop', accountId: stranger.id, account_id: stranger.id }, { cookie: reader.cookie }),
    );

    expect(await stopped(reader.id)).toBe(true);
    expect(await stopped(stranger.id)).toBe(false);
  });

  it('sends a caller with no session to sign in, and writes nothing', async () => {
    const response = await handleAccountMail(post({ intent: 'stop' }));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in');
  });

  it('refuses a foreign origin before it resolves the session', async () => {
    const reader = await signedIn();

    const response = await handleAccountMail(
      post({ intent: 'stop' }, { cookie: reader.cookie, origin: 'https://evil.example' }),
    );

    expect(response.status).toBe(403);
    expect(await stopped(reader.id)).toBe(false);
  });

  it('refuses an intent it does not offer, and a body that is not the form', async () => {
    const reader = await signedIn();

    expect((await handleAccountMail(post({ intent: 'delete' }, { cookie: reader.cookie }))).status).toBe(
      400,
    );
    expect((await handleAccountMail(post({}, { cookie: reader.cookie }))).status).toBe(400);

    const notAForm = new Request(`${ORIGIN}/api/account/mail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: reader.cookie },
      body: '{"intent":"stop"}',
    });
    expect((await handleAccountMail(notAForm)).status).toBe(400);
    expect(await stopped(reader.id)).toBe(false);
  });
});
