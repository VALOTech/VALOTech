/**
 * Moving a person between roles, against a real PostgreSQL (`AUTH-DEC-06`,
 * `ADMIN-001/T13`).
 *
 * Four classes of claim, and the first is the one this route exists for.
 *
 * **That a promotion is what it says it is.** A prospect becomes an investor,
 * reads what the hall publishes to investors from that instant, and holds no
 * session from before the change — a privilege change that leaves the old
 * session's claims in place has not happened yet (`SEC-R02`). The audit row
 * carries the role that was replaced beside the one that replaced it.
 *
 * **That every refusal is told apart from every other.** Four different things
 * make a role change write nothing, and a console that reported a refusal as a
 * no-op would send an admin to press the same button again. Each is asserted
 * against its own name and against the record being untouched, because a
 * refusal that still wrote is the failure that looks exactly like a refusal.
 *
 * **That `prospect` cannot be a destination.** Somebody becomes one by
 * registering and confirming their own address and by nothing else, so a post
 * naming it is malformed — a record saying a person registered themselves when
 * an admin invited them is a record that lies about consent.
 *
 * **Who is refused.** An investor with a live session gets the `404` the console
 * gives a guess, a caller with no session is sent to sign in, and a
 * cross-origin post is refused before anything else.
 *
 * On a database of its own: the role CHECK is folded into a shipped migration
 * (`DATA-R07`), which node-pg-migrate will not re-apply to the shared
 * development one.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../../auth/session';
import { closeDb, getDb } from '../../../../../db/index';
import type { AccountRole, AccountState } from '../../../../../db/types';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_role_route';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

// Set before anything reads it: `getConfig` caches on first use and `getDb`
// builds its pool from the value, so this is what sends every query below to
// the isolated database, in this file's worker alone.
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

const SUITE_DOMAIN = '@role-route.test';

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

async function accountOf(role: AccountRole, state: AccountState = 'active'): Promise<string> {
  const row = await getDb()
    .insertInto('accounts')
    .values({ email: `${crypto.randomUUID()}${SUITE_DOMAIN}`, name: role, role, state })
    .returning('id')
    .executeTakeFirstOrThrow();

  return row.id;
}

/** An account, and a cookie header presenting a live session for it. */
async function signedIn(role: AccountRole): Promise<{ id: string; cookie: string }> {
  const id = await accountOf(role);
  const cookie = await issue(id);

  return { id, cookie: `${cookie.name}=${cookie.value}` };
}

/** The whole record, so a write wider than the one column shows up as a failure. */
async function recordOf(accountId: string) {
  return getDb()
    .selectFrom('accounts')
    .select(['name', 'email', 'role', 'state', 'investor_type'])
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
}

async function sessionCount(accountId: string): Promise<number> {
  return (
    await getDb().selectFrom('sessions').select('id').where('account_id', '=', accountId).execute()
  ).length;
}

async function auditFor(accountId: string) {
  return getDb()
    .selectFrom('audit')
    .select(['action', 'actor_id', 'before', 'after'])
    .where('subject_id', '=', accountId)
    .orderBy('id', 'asc')
    .execute();
}

function callPost(
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

  const request = new Request(`${ORIGIN}/admin/accounts/${accountId}/role`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  return POST(request, { params: Promise.resolve({ id: accountId }) });
}

interface Answer {
  readonly outcome?: string;
  readonly error?: string;
}

describe.skipIf(!HAS_DATABASE)('POST /admin/accounts/<id>/role', () => {
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
    // A second admin, so demoting the first is never the last-admin refusal and
    // the guard under test is the one each case names rather than that one.
    await accountOf('admin');
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  describe('promoting somebody who registered themselves', () => {
    it('makes them an investor, ends their sessions, and records what it replaced', async () => {
      const prospect = await signedIn('prospect');
      expect(await sessionCount(prospect.id)).toBe(1);

      const response = await callPost(prospect.id, { role: 'investor' }, { cookie: admin.cookie });
      expect(response.status).toBe(200);
      expect((await response.json()) as Answer).toEqual({ outcome: 'changed' });

      const after = await recordOf(prospect.id);
      expect(after.role).toBe('investor');
      // The one column moved and nothing else did.
      expect(after.investor_type).toBeNull();
      expect(after.state).toBe('active');

      // The session they held is gone: the change reaches somebody signed in
      // right now rather than at their next sign-in.
      expect(await sessionCount(prospect.id)).toBe(0);

      expect(await auditFor(prospect.id)).toEqual([
        {
          action: 'account.role_change',
          actor_id: admin.id,
          before: { role: 'prospect' },
          after: { role: 'investor' },
        },
      ]);
    });

    it('says so rather than reporting a change when they already hold the role', async () => {
      const investor = await accountOf('investor');

      const response = await callPost(investor, { role: 'investor' }, { cookie: admin.cookie });
      expect(response.status).toBe(200);
      expect((await response.json()) as Answer).toEqual({ outcome: 'unchanged' });
      expect(await auditFor(investor)).toEqual([]);
    });
  });

  describe('refusals, each told apart from the others', () => {
    it('refuses an admin changing their own role, and says which refusal it is', async () => {
      const response = await callPost(admin.id, { role: 'investor' }, { cookie: admin.cookie });

      expect((await response.json()) as Answer).toEqual({ outcome: 'refused_self' });
      expect((await recordOf(admin.id)).role).toBe('admin');
      expect(await auditFor(admin.id)).toEqual([]);
    });

    // `refused_last_admin` is not reconstructed here. Producing it needs the
    // subject to be the only admin who can sign in while the caller is a
    // different admin who can -- a contradiction at this layer, since the caller
    // must pass `requireAdmin` and would be a second one. The guard lives in
    // `changeRole` and is asserted there, against the transaction that holds it
    // (`admin/accounts.test.ts`); this route's own claim is that it carries
    // whatever outcome the service names, which the cases around this one prove.

    it('demotes another admin when one is left standing, so the guard is not blanket', async () => {
      const other = await signedIn('admin');

      const response = await callPost(other.id, { role: 'investor' }, { cookie: admin.cookie });

      expect((await response.json()) as Answer).toEqual({ outcome: 'changed' });
      expect((await recordOf(other.id)).role).toBe('investor');
    });

    it('answers no_such_account for an id no account holds, writing nothing', async () => {
      const absent = crypto.randomUUID();
      const response = await callPost(absent, { role: 'investor' }, { cookie: admin.cookie });

      expect(response.status).toBe(404);
      expect((await response.json()) as Answer).toEqual({ error: 'no_such_account' });
    });
  });

  describe('what may be asked for', () => {
    it('refuses `prospect` as a destination, because only a registration produces one', async () => {
      const investor = await accountOf('investor');

      const response = await callPost(investor, { role: 'prospect' }, { cookie: admin.cookie });

      expect(response.status).toBe(400);
      expect((await response.json()) as Answer).toEqual({ error: 'invalid_request' });
      expect((await recordOf(investor)).role).toBe('investor');
      expect(await auditFor(investor)).toEqual([]);
    });

    it('refuses a role the vocabulary does not name', async () => {
      const investor = await accountOf('investor');

      const response = await callPost(investor, { role: 'superadmin' }, { cookie: admin.cookie });

      expect(response.status).toBe(400);
      expect((await recordOf(investor)).role).toBe('investor');
    });

    it('refuses a body that names no role at all', async () => {
      const investor = await accountOf('investor');

      expect((await callPost(investor, {}, { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(investor, 'not json', { cookie: admin.cookie })).status).toBe(400);
      expect((await recordOf(investor)).role).toBe('investor');
    });
  });

  describe('who may ask', () => {
    it('answers an investor 404, which is what a path that does not exist answers', async () => {
      const investor = await signedIn('investor');
      const subject = await accountOf('prospect');

      const response = await callPost(subject, { role: 'investor' }, { cookie: investor.cookie });

      expect(response.status).toBe(404);
      expect((await recordOf(subject)).role).toBe('prospect');
    });

    it('answers a prospect 404 as well, so the console is not confirmed to them', async () => {
      const prospect = await signedIn('prospect');
      const subject = await accountOf('prospect');

      const response = await callPost(subject, { role: 'investor' }, { cookie: prospect.cookie });

      expect(response.status).toBe(404);
      expect((await recordOf(subject)).role).toBe('prospect');
    });

    it('sends a caller with no session to the form, as every gated path does', async () => {
      const subject = await accountOf('prospect');

      const response = await callPost(subject, { role: 'investor' });

      expect(response.status).toBe(303);
      expect((await recordOf(subject)).role).toBe('prospect');
    });

    it('refuses a foreign Origin before it reads anything else', async () => {
      const subject = await accountOf('prospect');

      const response = await callPost(
        subject,
        { role: 'investor' },
        { cookie: admin.cookie, origin: 'https://evil.example' },
      );

      expect(response.status).toBe(403);
      expect((await response.json()) as Answer).toEqual({ error: 'cross_origin' });
      expect((await recordOf(subject)).role).toBe('prospect');
    });
  });
});
