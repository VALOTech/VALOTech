/**
 * `POST /api/unsubscribe` (`MAIL-002/T2`, `MAIL-DEC-05`).
 *
 * **The load-bearing test is that the route offers no `GET`.** The whole reason
 * this endpoint exists apart from the page is that a link in a message is
 * fetched by things that are not the reader — scanners, link-protection
 * rewriters, prefetching clients — and a `GET` that wrote the row would
 * unsubscribe them with nothing in the row to tell it from a press. A mutating
 * `GET` added here later would be caught by the export assertion below and by
 * nothing else, because every other test would go on passing.
 *
 * The second property is that the answer says nothing about the token. A value
 * nobody signed, one naming an account that has gone, and a good one all get the
 * same `303` to the same page — otherwise the endpoint is an oracle for which
 * links are live, answerable by anybody with a list of guesses.
 *
 * On a database of its own, because these are claims about what the list holds.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../../../db/index';
import { unsubscribeToken } from '../../../mail/unsubscribe';

import { handleUnsubscribe } from './handler';
import * as route from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_unsub_route';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'migrations');

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

/** The form the confirmation page posts, as a browser would send it. */
function post(body: BodyInit, options: { origin?: string } = {}): Request {
  const headers = new Headers();
  if (options.origin !== undefined) {
    headers.set('Origin', options.origin);
  }

  return new Request(`${ORIGIN}/api/unsubscribe`, { method: 'POST', headers, body });
}

function form(token: string): URLSearchParams {
  return new URLSearchParams({ token });
}

describe('the unsubscribe endpoint offers no mutating GET (MAIL-DEC-05)', () => {
  it('exports POST and nothing that answers a fetch of the link', () => {
    expect(typeof route.POST).toBe('function');
    // Every method a route file can export, checked by name rather than by
    // counting keys: a `GET` here would be the prefetch-unsubscribes-you defect,
    // and the others would each be a second way to write without a press.
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(route).not.toHaveProperty(method);
    }
  });
});

describe.skipIf(!HAS_DATABASE)('POST /api/unsubscribe (MAIL-002/T2)', () => {
  async function account(): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({
        email: `${randomUUID()}@unsub-route.test`,
        name: 'An Investor',
        role: 'investor',
        state: 'active',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function listRows(accountId: string) {
    return getDb()
      .selectFrom('unsubscribes')
      .select(['source', 'reason'])
      .where('account_id', '=', accountId)
      .execute();
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

  it('stops investor mail and sends the reader back to the page that says so', async () => {
    const id = await account();
    const token = unsubscribeToken(id);

    const response = await handleUnsubscribe(post(form(token), { origin: ORIGIN }));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`/unsubscribe/${token}`);
    expect(await listRows(id)).toEqual([{ source: 'link', reason: null }]);
  });

  it('writes one row and records one act however many times it is pressed', async () => {
    const id = await account();
    const token = unsubscribeToken(id);

    await handleUnsubscribe(post(form(token)));
    await handleUnsubscribe(post(form(token)));
    await handleUnsubscribe(post(form(token)));

    expect(await listRows(id)).toHaveLength(1);
    expect(await auditCount(id)).toBe(1);
  });

  it('answers a token nobody signed exactly as it answers a good one, and writes nothing', async () => {
    const id = await account();
    const forged = `${id}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    const response = await handleUnsubscribe(post(form(forged)));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`/unsubscribe/${encodeURIComponent(forged)}`);
    expect(await listRows(id)).toEqual([]);
  });

  it('answers a signed token whose account has gone the same way', async () => {
    const id = await account();
    const token = unsubscribeToken(id);
    await getDb().deleteFrom('accounts').where('id', '=', id).execute();

    const response = await handleUnsubscribe(post(form(token)));

    expect(response.status).toBe(303);
    expect(await listRows(id)).toEqual([]);
  });

  it('refuses a foreign origin before it reads anything', async () => {
    const id = await account();

    const response = await handleUnsubscribe(
      post(form(unsubscribeToken(id)), { origin: 'https://evil.example' }),
    );

    expect(response.status).toBe(403);
    expect(await listRows(id)).toEqual([]);
  });

  it('keeps the reader on this origin however the token is shaped', async () => {
    // A token shaped like a protocol-relative URL would leave this site if it
    // reached a `Location` unencoded.
    const response = await handleUnsubscribe(post(form('//evil.example/takeover')));

    const location = response.headers.get('Location') ?? '';
    expect(location.startsWith('/unsubscribe/')).toBe(true);
    expect(location.startsWith('//')).toBe(false);
    expect(new URL(location, ORIGIN).origin).toBe(ORIGIN);
  });

  it('refuses a body that is not the form, and one with no token in it', async () => {
    const notAForm = new Request(`${ORIGIN}/api/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"token":"anything"}',
    });

    expect((await handleUnsubscribe(notAForm)).status).toBe(400);
    expect((await handleUnsubscribe(post(new URLSearchParams({ other: 'x' })))).status).toBe(400);
    expect((await handleUnsubscribe(post(form('')))).status).toBe(400);
  });
});
