/**
 * `POST /admin/accounts/<id>/mail` (`MAIL-002/T4`).
 *
 * The act is a person doing what a webhook would: SMTP reports no bounce, so an
 * admin who finds a delivery-status notice in the send mailbox stops investor
 * mail to that person by hand, and the reason they type is the only record of
 * why. These are claims about what the list and the trail hold afterwards, so
 * they run against a real PostgreSQL on a database of their own.
 *
 * **A reason is required and is refused rather than trimmed to fit.** A stop
 * with no reason, or with a sentence cut at five hundred characters, is one
 * nobody can undo with confidence a year later — and the column will not hold
 * the first of those either, so a handler that let it through would fail at the
 * database as a 500 rather than as the refusal it is.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../../auth/session';
import { closeDb, getDb } from '../../../../../db/index';
import type { AccountRole } from '../../../../../db/types';
import { MAX_REASON_LENGTH } from '../../../../../mail/unsubscribe';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_person_mail';

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

describe.skipIf(!HAS_DATABASE)('POST /admin/accounts/<id>/mail (MAIL-002/T4)', () => {
  async function newAccount(role: AccountRole = 'investor'): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({
        email: `${randomUUID()}@person-mail.test`,
        name: role === 'admin' ? 'An Admin' : 'An Investor',
        role,
        state: 'active',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function signedIn(role: AccountRole): Promise<{ id: string; cookie: string }> {
    const id = await newAccount(role);
    const cookie = await issue(id);
    return { id, cookie: `${cookie.name}=${cookie.value}` };
  }

  function call(
    accountId: string,
    body: unknown,
    options: { cookie?: string; origin?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.cookie !== undefined) {
      headers['Cookie'] = options.cookie;
    }
    if (options.origin !== undefined) {
      headers['Origin'] = options.origin;
    }

    const request = new Request(`${ORIGIN}/admin/accounts/${accountId}/mail`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

    return POST(request, { params: Promise.resolve({ id: accountId }) });
  }

  async function listRow(accountId: string) {
    return getDb()
      .selectFrom('unsubscribes')
      .select(['source', 'token', 'reason'])
      .where('account_id', '=', accountId)
      .executeTakeFirst();
  }

  async function trailFor(accountId: string) {
    return getDb()
      .selectFrom('audit')
      .select(['action', 'actor_id'])
      .where('subject_id', '=', accountId)
      .execute();
  }

  let admin: { id: string; cookie: string };

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
    admin = await signedIn('admin');
  }, 120_000);

  afterAll(closeDb);

  it('stops investor mail, keeps the reason in the row, and records the admin', async () => {
    const subject = await newAccount();

    const response = await call(
      subject,
      { reason: 'a bounce notice said the mailbox does not exist' },
      { cookie: admin.cookie, origin: ORIGIN },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: 'changed' });
    expect(await listRow(subject)).toEqual({
      source: 'admin',
      token: null,
      reason: 'a bounce notice said the mailbox does not exist',
    });
    expect(await trailFor(subject)).toEqual([{ action: 'mail.unsubscribe', actor_id: admin.id }]);
  });

  it('changes nothing when the person is already on the list', async () => {
    const subject = await newAccount();
    await call(subject, { reason: 'first' }, { cookie: admin.cookie });

    const response = await call(subject, { reason: 'second' }, { cookie: admin.cookie });

    expect(await response.json()).toEqual({ outcome: 'unchanged' });
    expect((await listRow(subject))?.reason).toBe('first');
    expect(await trailFor(subject)).toHaveLength(1);
  });

  it('answers an investor the 404 the console gives a guess, and writes nothing', async () => {
    const investor = await signedIn('investor');
    const subject = await newAccount();

    const response = await call(subject, { reason: 'bounced' }, { cookie: investor.cookie });

    expect(response.status).toBe(404);
    expect(await listRow(subject)).toBeUndefined();
  });

  it('sends a caller with no session to sign in, and writes nothing', async () => {
    const subject = await newAccount();

    const response = await call(subject, { reason: 'bounced' });

    expect(response.status).toBe(303);
    expect(await listRow(subject)).toBeUndefined();
  });

  it('refuses a foreign origin before it resolves the caller', async () => {
    const subject = await newAccount();

    const response = await call(
      subject,
      { reason: 'bounced' },
      { cookie: admin.cookie, origin: 'https://evil.example' },
    );

    expect(response.status).toBe(403);
    expect(await listRow(subject)).toBeUndefined();
  });

  it('refuses a reason that is missing, blank, or longer than the column should keep', async () => {
    const subject = await newAccount();

    expect((await call(subject, {}, { cookie: admin.cookie })).status).toBe(400);
    expect((await call(subject, { reason: 42 }, { cookie: admin.cookie })).status).toBe(400);
    expect((await call(subject, 'not json at all', { cookie: admin.cookie })).status).toBe(400);

    const blank = await call(subject, { reason: '   ' }, { cookie: admin.cookie });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: 'invalid_reason' });

    const tooLong = await call(
      subject,
      { reason: 'x'.repeat(MAX_REASON_LENGTH + 1) },
      { cookie: admin.cookie },
    );
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: 'invalid_reason' });

    expect(await listRow(subject)).toBeUndefined();
  });

  it('answers an id no account holds with the same 404 a path that names nothing gives', async () => {
    expect((await call(randomUUID(), { reason: 'bounced' }, { cookie: admin.cookie })).status).toBe(404);
    expect((await call('latest', { reason: 'bounced' }, { cookie: admin.cookie })).status).toBe(404);
  });
});
