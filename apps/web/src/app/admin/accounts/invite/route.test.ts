/**
 * The invite route against a real PostgreSQL (`ADMIN-001/T6`).
 *
 * Three classes of claim. **Who is refused** — an investor with a live session
 * gets the `404` the console gives a guess, a caller with no session is sent to
 * sign in, and a cross-origin post is refused before anything else; each asserted
 * together with no account having been created, because a refusal that created one
 * anyway is the failure that looks like a refusal. **That a valid invite is the
 * whole act** — an `invited` account with the posted name and role, one live
 * invitation whose returned link consumes to exactly that account, and one
 * `account.create` row naming the admin who posted. **That the malformed are
 * turned away** — an unknown role, a missing name, an address with no `@`, and a
 * second invite of a taken address, none of which writes a second account.
 *
 * On a database of its own: the account set has to be exactly what this suite
 * creates for the created/duplicate counts to be deterministic, and the shared
 * development database carries other files minting accounts at the same time.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { consumeToken } from '../../../../auth/invitation';
import { issue } from '../../../../auth/session';
import { closeDb, getDb } from '../../../../db/index';
import type { AccountRole } from '../../../../db/types';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_account_invite';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'migrations');

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);

const SUITE_DOMAIN = '@account-invite.test';

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

async function signedIn(role: AccountRole): Promise<{ id: string; cookie: string }> {
  const account = await getDb()
    .insertInto('accounts')
    .values({ email: `${crypto.randomUUID()}${SUITE_DOMAIN}`, name: role, role, state: 'active' })
    .returning('id')
    .executeTakeFirstOrThrow();
  const cookie = await issue(account.id);

  return { id: account.id, cookie: `${cookie.name}=${cookie.value}` };
}

async function accountByEmail(email: string) {
  return getDb()
    .selectFrom('accounts')
    .select(['id', 'name', 'role', 'state'])
    .where('email', '=', email)
    .execute();
}

async function auditFor(accountId: string) {
  return getDb()
    .selectFrom('audit')
    .select(['action', 'actor_id'])
    .where('subject_id', '=', accountId)
    .execute();
}

function callPost(body: unknown, options: { cookie?: string; origin?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.cookie !== undefined) {
    headers['Cookie'] = options.cookie;
  }
  if (options.origin !== undefined) {
    headers['Origin'] = options.origin;
  }

  return POST(
    new Request(`${ORIGIN}/admin/accounts/invite`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

describe.skipIf(!HAS_DATABASE)('POST /admin/accounts/invite', () => {
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
  }, 120_000);

  beforeEach(async () => {
    await getDb().deleteFrom('accounts').execute();
    admin = await signedIn('admin');
  });

  afterAll(closeDb);

  const invitee = (): string => `${crypto.randomUUID()}${SUITE_DOMAIN}`;

  describe('who is refused', () => {
    it('answers an investor 404 and creates nothing', async () => {
      const investor = await signedIn('investor');
      const email = invitee();

      const response = await callPost({ name: 'Ada', email, role: 'investor' }, { cookie: investor.cookie, origin: ORIGIN });

      expect(response.status).toBe(404);
      expect(await accountByEmail(email)).toHaveLength(0);
    });

    it('sends a caller with no session to sign in', async () => {
      const response = await callPost({ name: 'Ada', email: invitee(), role: 'investor' }, { origin: ORIGIN });
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/sign-in');
    });

    it('refuses a cross-origin post before anything else', async () => {
      const email = invitee();
      const response = await callPost(
        { name: 'Ada', email, role: 'investor' },
        { cookie: admin.cookie, origin: 'https://evil.test' },
      );
      expect(response.status).toBe(403);
      expect(await accountByEmail(email)).toHaveLength(0);
    });
  });

  describe('a valid invite', () => {
    it('creates an invited account with the name and role, and returns a link that consumes to it', async () => {
      const email = invitee();

      const response = await callPost({ name: '  Ada Lovelace  ', email, role: 'investor' }, { cookie: admin.cookie, origin: ORIGIN });
      expect(response.status).toBe(200);
      const answer = (await response.json()) as { accountId: string; link: string; deliverByHand: string };

      const rows = await accountByEmail(email);
      expect(rows).toEqual([{ id: answer.accountId, name: 'Ada Lovelace', role: 'investor', state: 'invited' }]);
      expect(answer.deliverByHand.length).toBeGreaterThan(0);

      // The returned link is a real, single-use invitation to that account.
      const token = answer.link.split('/invite/')[1] ?? '';
      expect(await consumeToken(token)).toBe(answer.accountId);

      // The creation is audited to the admin who posted, not to the new account.
      expect(await auditFor(answer.accountId)).toEqual([{ action: 'account.create', actor_id: admin.id }]);
    });

    it('creates an admin when that role is chosen', async () => {
      const email = invitee();
      const response = await callPost({ name: 'Grace', email, role: 'admin' }, { cookie: admin.cookie, origin: ORIGIN });
      expect(response.status).toBe(200);
      expect((await accountByEmail(email))[0]?.role).toBe('admin');
    });
  });

  describe('the malformed are turned away', () => {
    it('refuses an unknown role and creates nothing', async () => {
      const email = invitee();
      const response = await callPost({ name: 'Ada', email, role: 'superuser' }, { cookie: admin.cookie, origin: ORIGIN });
      expect(response.status).toBe(400);
      expect(await accountByEmail(email)).toHaveLength(0);
    });

    it('refuses a blank name and an address with no @', async () => {
      const blankName = await callPost({ name: '   ', email: invitee(), role: 'investor' }, { cookie: admin.cookie, origin: ORIGIN });
      expect(blankName.status).toBe(400);

      const badEmail = await callPost({ name: 'Ada', email: 'not-an-address', role: 'investor' }, { cookie: admin.cookie, origin: ORIGIN });
      expect(badEmail.status).toBe(400);
    });

    it('refuses a second invite of a taken address, leaving one account', async () => {
      const email = invitee();
      const first = await callPost({ name: 'Ada', email, role: 'investor' }, { cookie: admin.cookie, origin: ORIGIN });
      expect(first.status).toBe(200);

      const second = await callPost({ name: 'Someone Else', email, role: 'admin' }, { cookie: admin.cookie, origin: ORIGIN });
      expect(second.status).toBe(409);

      const rows = await accountByEmail(email);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('Ada');
      expect(rows[0]?.role).toBe('investor');
    });
  });
});
