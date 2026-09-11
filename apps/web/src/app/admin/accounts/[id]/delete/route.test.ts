/**
 * The delete route against a real PostgreSQL (`ADMIN-001/T4`).
 *
 * Four classes of claim, and the second is why the file exists.
 *
 * **Who is refused.** An investor with a live session gets the `404` the console
 * gives a guess, a caller with no session is sent to sign in, and a cross-origin
 * post is refused before anything else. Each is asserted together with the account
 * still being there, because a refusal that deleted anyway is the failure that
 * looks exactly like a refusal.
 *
 * **That the typed name is checked here and not only in the panel.** The panel
 * leaves its confirm button off until the name matches, which a posted body does
 * not have to respect. So the wrong case, a prefix, another person's name and an
 * empty field are each asserted to answer `400` and to leave the row and the trail
 * untouched — and the name with whitespace around it to be accepted, since that is
 * the same forgiveness the panel's gate gives a paste.
 *
 * **That the guards still hold through the route.** The act is `eraseAccount`, so
 * `ADMIN-DEC-01`'s refusals are in force on this path: an admin cannot delete
 * their own account, and the answer is the `unchanged` a no-op gives rather than an
 * error. A route that reached a different function, or passed the subject where the
 * actor belongs, would pass every other test here.
 *
 * **That the delete is a real delete.** The cascades are read back rather than
 * trusted — the sessions, the invitation, the grant and both kinds of read record —
 * and the `account.delete` row is read back to check it names the admin who posted
 * and not the person who was deleted.
 *
 * It runs on a database of its own. `eraseAccount` counts every active admin in the
 * database (`ADMIN-DEC-01`), so the self and last-admin refusals are deterministic
 * only where this suite owns the whole admin set, and the development database it
 * would otherwise share carries other files minting admins at the same time.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { INVITATION_TTL_SECONDS, issueToken } from '../../../../../auth/invitation';
import { issue } from '../../../../../auth/session';
import { recordDeckRead } from '../../../../../content/decks';
import { addGrant, grantsForAccount } from '../../../../../content/grants';
import { createItem } from '../../../../../content/items';
import { markReportRead } from '../../../../../content/reports';
import { closeDb, getDb } from '../../../../../db/index';
import type { AccountRole, AccountState } from '../../../../../db/types';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_account_delete';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

// Set before anything reads it: `getConfig` caches on first use and `getDb` builds
// its pool from the value, so this is what sends every query below to the isolated
// database, in this file's worker alone.
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

const SUITE_DOMAIN = '@account-delete.test';

/** The subject's name, which is the string the confirmation demands typed. */
const SUBJECT = 'Ada Lovelace';

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

/** An account, and a cookie header presenting a live session for it. */
async function signedIn(
  role: AccountRole,
  state: AccountState = 'active',
): Promise<{ id: string; cookie: string }> {
  const account = await getDb()
    .insertInto('accounts')
    .values({ email: `${crypto.randomUUID()}${SUITE_DOMAIN}`, name: role, role, state })
    .returning('id')
    .executeTakeFirstOrThrow();
  const cookie = await issue(account.id);

  return { id: account.id, cookie: `${cookie.name}=${cookie.value}` };
}

async function newAccount(state: AccountState = 'active'): Promise<string> {
  const account = await getDb()
    .insertInto('accounts')
    .values({
      email: `${crypto.randomUUID()}${SUITE_DOMAIN}`,
      name: SUBJECT,
      role: 'investor',
      state,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return account.id;
}

async function accountExists(accountId: string): Promise<boolean> {
  const row = await getDb()
    .selectFrom('accounts')
    .select('id')
    .where('id', '=', accountId)
    .executeTakeFirst();

  return row !== undefined;
}

async function sessionCount(accountId: string): Promise<number> {
  return (
    await getDb().selectFrom('sessions').select('id').where('account_id', '=', accountId).execute()
  ).length;
}

async function invitationCount(accountId: string): Promise<number> {
  return (
    await getDb()
      .selectFrom('invitations')
      .select('id')
      .where('account_id', '=', accountId)
      .execute()
  ).length;
}

async function deckReadCount(accountId: string): Promise<number> {
  return (
    await getDb()
      .selectFrom('deck_reads')
      .select('deck_id')
      .where('account_id', '=', accountId)
      .execute()
  ).length;
}

async function reportReadCount(accountId: string): Promise<number> {
  return (
    await getDb()
      .selectFrom('report_reads')
      .select('item_id')
      .where('account_id', '=', accountId)
      .execute()
  ).length;
}

async function auditFor(accountId: string) {
  return getDb()
    .selectFrom('audit')
    .select(['action', 'actor_id', 'subject_type'])
    .where('subject_id', '=', accountId)
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

  const request = new Request(`${ORIGIN}/admin/accounts/${accountId}/delete`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  return POST(request, { params: Promise.resolve({ id: accountId }) });
}

describe.skipIf(!HAS_DATABASE)('POST /admin/accounts/<id>/delete', () => {
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
    // One admin and no other account per test, which the last-admin guard needs and
    // only an isolated database allows. Sessions, invitations and read records
    // cascade on account_id; the audit trail is keyed by the fresh ids each test
    // mints, so a row an earlier test wrote is never one a later test reads.
    await getDb().deleteFrom('accounts').execute();
    admin = await signedIn('admin');
  });

  afterAll(async () => {
    await closeDb();
  });

  /** The answer's outcome, for a call expected to have been performed. */
  async function outcomeOf(response: Response): Promise<string | undefined> {
    expect(response.status).toBe(200);

    return ((await response.json()) as { outcome?: string }).outcome;
  }

  describe('who is refused', () => {
    it('answers an investor 404 and deletes nothing', async () => {
      const investor = await signedIn('investor');
      const subject = await newAccount();

      const response = await callPost(subject, { confirmName: SUBJECT }, { cookie: investor.cookie });

      expect(response.status).toBe(404);
      expect(await accountExists(subject)).toBe(true);
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('redirects a caller with no session to sign in, deleting nothing', async () => {
      const subject = await newAccount();

      const response = await callPost(subject, { confirmName: SUBJECT });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in');
      expect(await accountExists(subject)).toBe(true);
    });

    it('refuses a cross-origin post before anything else', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject,
        { confirmName: SUBJECT },
        { cookie: admin.cookie, origin: 'https://evil.example' },
      );

      expect(response.status).toBe(403);
      expect(await accountExists(subject)).toBe(true);
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('accepts a post carrying our own origin', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject,
        { confirmName: SUBJECT },
        { cookie: admin.cookie, origin: ORIGIN },
      );

      expect(await outcomeOf(response)).toBe('changed');
      expect(await accountExists(subject)).toBe(false);
    });
  });

  describe('the typed name', () => {
    it('deletes when the name is typed exactly', async () => {
      const subject = await newAccount();

      expect(await outcomeOf(await callPost(subject, { confirmName: SUBJECT }, { cookie: admin.cookie }))).toBe(
        'changed',
      );
      expect(await accountExists(subject)).toBe(false);
    });

    it('refuses the wrong case, and says which refusal it was', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject,
        { confirmName: SUBJECT.toLowerCase() },
        { cookie: admin.cookie },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'name_mismatch' });
      // The whole point of typing a name shown on the screen is that the person
      // looked at it, so nothing is deleted and nothing is recorded.
      expect(await accountExists(subject)).toBe(true);
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it.each([
      ['an empty field', ''],
      ['a prefix', 'Ada'],
      ['a superset', `${SUBJECT} Byron`],
      ['another person entirely', 'Charles Babbage'],
      ['different inner spacing', 'Ada  Lovelace'],
    ])('refuses %s, deleting nothing', async (_what, confirmName) => {
      const subject = await newAccount();

      expect((await callPost(subject, { confirmName }, { cookie: admin.cookie })).status).toBe(400);
      expect(await accountExists(subject)).toBe(true);
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('forgives whitespace around the name, which a paste carries', async () => {
      const subject = await newAccount();

      // The same forgiveness the panel's own gate gives, because both sides call
      // one matcher: a name that enabled the button must not then be refused here.
      expect(
        await outcomeOf(await callPost(subject, { confirmName: `\n  ${SUBJECT}\t ` }, { cookie: admin.cookie })),
      ).toBe('changed');
      expect(await accountExists(subject)).toBe(false);
    });
  });

  describe('the request shape', () => {
    it('answers 400 for a body that is not a JSON object, deleting nothing', async () => {
      const subject = await newAccount();

      expect((await callPost(subject, 'not json at all', { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject, [], { cookie: admin.cookie })).status).toBe(400);
      expect(await accountExists(subject)).toBe(true);
    });

    it('answers 400 for a confirmName that is absent or is not a string', async () => {
      const subject = await newAccount();

      expect((await callPost(subject, {}, { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject, { confirmName: null }, { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject, { confirmName: 7 }, { cookie: admin.cookie })).status).toBe(400);
      // A body that is true where a string belongs must not reach a matcher that
      // would compare it, which is what a truthiness check instead of a type check
      // would do.
      expect((await callPost(subject, { confirmName: true }, { cookie: admin.cookie })).status).toBe(400);
      expect(await accountExists(subject)).toBe(true);
    });

    it('answers 404 for an id no account holds, and for a segment that is not an id', async () => {
      // The subject is resolved before the name is compared, so an unknown id is a
      // path that names nothing rather than a name that did not match.
      expect(
        (await callPost(crypto.randomUUID(), { confirmName: SUBJECT }, { cookie: admin.cookie })).status,
      ).toBe(404);
      expect((await callPost('latest', { confirmName: SUBJECT }, { cookie: admin.cookie })).status).toBe(404);
    });

    it('tells no cache to keep the answer', async () => {
      const subject = await newAccount();

      const response = await callPost(subject, { confirmName: 'wrong' }, { cookie: admin.cookie });

      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe('the guards still hold through the route (ADMIN-DEC-01)', () => {
    it('refuses the admin deleting their own account, and answers unchanged', async () => {
      const self = await getDb()
        .selectFrom('accounts')
        .select('name')
        .where('id', '=', admin.id)
        .executeTakeFirstOrThrow();

      // The seeded admin is the only one who can sign in, so this is both guards at
      // once — and it is the only shape this route can produce: an actor has to be
      // an active admin to be let in at all, so a subject who is the last active
      // admin is always the actor.
      const response = await callPost(admin.id, { confirmName: self.name }, { cookie: admin.cookie });

      // `unchanged`, not an error: the service answers a refusal and a no-op with
      // one value, and a route inventing a reason would be guessing at which.
      expect(await outcomeOf(response)).toBe('unchanged');
      expect(await accountExists(admin.id)).toBe(true);
      expect(await auditFor(admin.id)).toHaveLength(0);
    });

    it('deletes an admin while another active admin remains', async () => {
      const going = await signedIn('admin');

      expect(await outcomeOf(await callPost(going.id, { confirmName: 'admin' }, { cookie: admin.cookie }))).toBe(
        'changed',
      );
      expect(await accountExists(going.id)).toBe(false);
      expect(await accountExists(admin.id)).toBe(true);
    });
  });

  describe('what the delete removes', () => {
    it('takes the sessions, the invitation, the grant and the read records with it', async () => {
      const subject = await newAccount();
      await issue(subject);
      await issue(subject);
      await issueToken(subject, INVITATION_TTL_SECONDS);

      const deck = await createItem({
        type: 'deck',
        slug: `d-${crypto.randomUUID()}`,
        title: 'A deck',
        audience: 'granted',
      });
      const report = await createItem({
        type: 'report',
        slug: `r-${crypto.randomUUID()}`,
        title: 'Q1',
        period: '2026-Q1',
      });
      await addGrant(deck.id, subject, admin.id);
      await recordDeckRead(subject, deck.id, 1);
      await markReportRead(subject, report.id);

      expect(await sessionCount(subject)).toBe(2);
      expect(await grantsForAccount(subject)).toHaveLength(1);

      expect(await outcomeOf(await callPost(subject, { confirmName: SUBJECT }, { cookie: admin.cookie }))).toBe(
        'changed',
      );

      // The row, and then every row the foreign keys carry it to. Read back rather
      // than trusted: a delete that removed the account and left the reads behind
      // answers exactly what this one answered.
      expect(await accountExists(subject)).toBe(false);
      expect(await sessionCount(subject)).toBe(0);
      expect(await invitationCount(subject)).toBe(0);
      expect(await grantsForAccount(subject)).toHaveLength(0);
      expect(await deckReadCount(subject)).toBe(0);
      expect(await reportReadCount(subject)).toBe(0);
    });

    it('records one act, naming the admin who asked and not the person deleted', async () => {
      const subject = await newAccount();

      await callPost(subject, { confirmName: SUBJECT }, { cookie: admin.cookie });

      // The audit row outlives its own subject: actor_id and subject_id are bare
      // uuids rather than foreign keys, so the record of who deleted whom is not
      // cascaded away with the account it names (`SEC-R04`).
      const trail = await auditFor(subject);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('account.delete');
      expect(trail[0]?.actor_id).toBe(admin.id);
      expect(trail[0]?.subject_type).toBe('account');
    });

    it("leaves the admin's own session alone", async () => {
      const subject = await newAccount();
      await issue(subject);

      await callPost(subject, { confirmName: SUBJECT }, { cookie: admin.cookie });

      // The admin posted with a session of their own; a delete that scoped too
      // widely would have signed them out with their subject.
      expect(await sessionCount(admin.id)).toBe(1);
      expect(await accountExists(admin.id)).toBe(true);
    });

    it('touches no other account', async () => {
      const subject = await newAccount();
      const bystander = await newAccount();
      await issue(bystander);

      await callPost(subject, { confirmName: SUBJECT }, { cookie: admin.cookie });

      // Both subjects carry the same name, which is what makes this worth asserting:
      // a route that resolved the subject by name rather than by the id in the path
      // would delete whichever row it found first.
      expect(await accountExists(bystander)).toBe(true);
      expect(await sessionCount(bystander)).toBe(1);
      expect(await auditFor(bystander)).toHaveLength(0);
    });
  });
});
