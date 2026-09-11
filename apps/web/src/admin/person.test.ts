/**
 * What the person page reads and the one act it adds (`ADMIN-001/T2`), against a
 * real PostgreSQL.
 *
 * Three claims are asserted here that no return value shows on its own. The first
 * is that each read answers about exactly one person: an identity, the sessions
 * that account holds, and nothing belonging to the account beside it (`DATA-R05`).
 * The second is that each read is no wider than the section it feeds — both are
 * asserted key for key, because a password hash or a token hash reaching an admin
 * surface would pass an assertion on named fields. The third is that ending every
 * session is one act: the rows go, one audit row is written, and a failure at the
 * last write takes the deletes back with it.
 *
 * The rollback is forced by handing the act an actor id the `audit` table's `uuid`
 * column cannot parse. That is a real database refusal at the last write, with
 * nothing mocked, landing after the delete has already run — which is exactly
 * where a rollback has something to undo.
 *
 * It runs against a database of its own, created and migrated here and cleared
 * between tests. `liveSessionsForAccount` and the session count the act turns on
 * are claims about whole tables for one account, and the development server the
 * suite would otherwise share carries other files writing accounts and sessions of
 * their own at the same time. The redirection lives in this file's worker alone.
 */

import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { issue, liveSessionsForAccount } from '../auth/session';
import { closeDb, getDb } from '../db/index';
import type { AccountRole, AccountState } from '../db/types';

import { endAllSessions, personIdentity } from './accounts';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_admin_person';

/** The same connection string, pointed at another database on the same server. */
function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

// Point the application's one environment reader at this suite's own database
// before anything reads it: `getConfig` caches on first use and `getDb` builds its
// pool from the value, so setting it at module load — and only in this file's
// worker — is what sends every query below to the isolated database.
if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

const TTL_SECONDS = 3600;

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SESSION_TTL_SECONDS = String(TTL_SECONDS);

const SUITE_DOMAIN = '@admin-person.test';

/**
 * An actor id the `audit` table's `uuid` column refuses, which is how a failure is
 * injected at the last write of the transaction with nothing mocked.
 */
const UNPARSEABLE_ACTOR = 'not-a-uuid';

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

async function newAccount(
  state: AccountState = 'active',
  role: AccountRole = 'investor',
): Promise<string> {
  const account = await getDb()
    .insertInto('accounts')
    .values({ email: `${randomUUID()}${SUITE_DOMAIN}`, name: 'An Investor', role, state })
    .returning('id')
    .executeTakeFirstOrThrow();

  return account.id;
}

/** A session row with its clocks chosen, which is what an order and a lapse need. */
async function sessionAt(accountId: string, lastSeen: Date, expires: Date): Promise<void> {
  await getDb()
    .insertInto('sessions')
    .values({
      account_id: accountId,
      token_hash: createHash('sha256').update(randomUUID()).digest('hex'),
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      last_seen_at: lastSeen,
      expires_at: expires,
    })
    .execute();
}

async function sessionCount(accountId: string): Promise<number> {
  const rows = await getDb()
    .selectFrom('sessions')
    .select('id')
    .where('account_id', '=', accountId)
    .execute();

  return rows.length;
}

/** Every audit row written about one account, read back independently of the writer. */
async function auditFor(accountId: string) {
  return getDb().selectFrom('audit').selectAll().where('subject_id', '=', accountId).execute();
}

async function stateOf(accountId: string): Promise<AccountState> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('state')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();

  return account.state;
}

/**
 * As many established connections as a race is about to need, before it starts.
 * The pool opens one only when none is idle, and that handshake dwarfs the
 * statement, so two calls begun against a single idle connection run one after the
 * other — and a concurrency test that never had two statements in flight proves
 * nothing about the lock it meant to exercise.
 */
async function warmConnections(count: number): Promise<void> {
  await Promise.all(Array.from({ length: count }, () => sql`select 1`.execute(getDb())));
}

describe.skipIf(!HAS_DATABASE)('the person page reads and acts (ADMIN-001/T2)', () => {
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
    // Sessions and invitations cascade on account_id; the audit trail is keyed by
    // the fresh account id each test mints, so a row an earlier test wrote is
    // never one a later test reads.
    await getDb().deleteFrom('accounts').execute();
  });

  afterAll(async () => {
    // Only `closeDb`: the database is recreated at setup, so there is nothing to
    // drop here, and the pool must be closed or the worker's event loop never
    // drains.
    await closeDb();
  });

  describe('personIdentity', () => {
    it('carries the seven things the identity section states, and nothing else about the person', async () => {
      const signedIn = new Date('2026-04-05T06:07:08.000Z');
      const account = await getDb()
        .insertInto('accounts')
        .values({
          email: `one${SUITE_DOMAIN}`,
          name: 'Ada Lovelace',
          role: 'admin',
          state: 'suspended',
          last_sign_in: signedIn,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      // The whole object, key for key: a password hash, a read-tracking flag or
      // the row's own `updated_at` reaching an admin surface would be the read
      // widening past what DATA-R01 admits, and an assertion on named fields
      // alone would not notice.
      expect(await personIdentity(account.id)).toEqual({
        id: account.id,
        email: `one${SUITE_DOMAIN}`,
        name: 'Ada Lovelace',
        role: 'admin',
        state: 'suspended',
        createdAt: expect.any(Date),
        lastSignIn: signedIn,
      });
    });

    it('says never signed in as a null rather than inventing a moment', async () => {
      expect((await personIdentity(await newAccount('invited')))?.lastSignIn).toBeNull();
    });

    it('is null for an id no account holds', async () => {
      expect(await personIdentity(randomUUID())).toBeNull();
    });

    it('is null for a segment that is not an id at all, rather than raising', async () => {
      // The value arrives from a URL. Without the shape check each of these would
      // reach a uuid column and the page would answer 500 where the honest answer
      // is that no account holds it.
      for (const notAnId of ['', 'latest', '../../etc/passwd', '1 or 1=1', `${randomUUID()}x`]) {
        expect(await personIdentity(notAnId), notAnId).toBeNull();
      }
    });

    it('answers about the one account asked for', async () => {
      const mine = await newAccount();
      const theirs = await newAccount();

      expect((await personIdentity(mine))?.id).toBe(mine);
      expect((await personIdentity(theirs))?.id).toBe(theirs);
    });
  });

  describe('liveSessionsForAccount', () => {
    it('carries the id and the three clocks, and never the token hash', async () => {
      const id = await newAccount();
      await issue(id);

      const sessions = await liveSessionsForAccount(id);

      expect(sessions).toHaveLength(1);
      // Key for key again, and for a sharper reason: `token_hash` is what a
      // session is presented with, and a surface has no use for it.
      expect(sessions[0]).toEqual({
        id: expect.any(String),
        createdAt: expect.any(Date),
        lastSeenAt: expect.any(Date),
        expiresAt: expect.any(Date),
      });
    });

    it('leaves out a session that has lapsed, which the gate would refuse anyway', async () => {
      const id = await newAccount();
      await sessionAt(id, new Date('2026-02-02T00:00:00.000Z'), new Date('2026-02-03T00:00:00.000Z'));
      await issue(id);

      // Two rows, one session: the lapsed row stays in the table for the
      // retention sweep and is not a way in any more.
      expect(await sessionCount(id)).toBe(2);
      expect(await liveSessionsForAccount(id)).toHaveLength(1);
    });

    it('lists the most recently used first', async () => {
      const id = await newAccount();
      const ahead = new Date(Date.now() + TTL_SECONDS * 1000);
      const older = new Date('2026-03-01T00:00:00.000Z');
      const newer = new Date('2026-03-09T00:00:00.000Z');
      // Inserted oldest-first, so an order that echoed insertion would come back
      // exactly reversed from the one asserted.
      await sessionAt(id, older, ahead);
      await sessionAt(id, newer, ahead);

      expect((await liveSessionsForAccount(id)).map((session) => session.lastSeenAt)).toEqual([
        newer,
        older,
      ]);
    });

    it('is the one account, and empty for an account holding none', async () => {
      const mine = await newAccount();
      const theirs = await newAccount();
      await issue(theirs);
      await issue(theirs);

      expect(await liveSessionsForAccount(mine)).toEqual([]);
      expect(await liveSessionsForAccount(theirs)).toHaveLength(2);
    });
  });

  describe('endAllSessions', () => {
    it('deletes every session, records one act, and leaves the account able to sign in', async () => {
      const actor = randomUUID();
      const id = await newAccount();
      await issue(id);
      await issue(id);

      expect(await endAllSessions(id, actor)).toBe(true);

      // The rows, not the answer: an act that recorded itself and left the
      // sessions standing returns exactly what this one returned.
      expect(await sessionCount(id)).toBe(0);
      // And the account is untouched — this revokes the ways in, not the access.
      expect(await stateOf(id)).toBe('active');

      const trail = await auditFor(id);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('session.invalidate_all');
      expect(trail[0]?.actor_id).toBe(actor);
      expect(trail[0]?.subject_type).toBe('account');
    });

    it('records nothing when there is no live session to end', async () => {
      const id = await newAccount();

      expect(await endAllSessions(id, randomUUID())).toBe(false);
      expect(await auditFor(id)).toHaveLength(0);
    });

    it('records nothing for an account whose only session has lapsed', async () => {
      const id = await newAccount();
      await sessionAt(id, new Date('2026-02-02T00:00:00.000Z'), new Date('2026-02-03T00:00:00.000Z'));

      // There is nothing to revoke: the gate would refuse that row already, and a
      // trail entry here would record a revocation that revoked nothing.
      expect(await endAllSessions(id, randomUUID())).toBe(false);
      expect(await auditFor(id)).toHaveLength(0);
      expect(await sessionCount(id)).toBe(1);
    });

    it('answers false for an id no account holds, writing nothing', async () => {
      const absent = randomUUID();

      expect(await endAllSessions(absent, randomUUID())).toBe(false);
      expect(await auditFor(absent)).toHaveLength(0);
    });

    it('rolls the deletes back when the audit cannot be written', async () => {
      const id = await newAccount();
      await issue(id);
      await issue(id);

      // The audit insert is the last write and refuses this actor id, so the
      // delete has already run when the failure arrives. What the assertion reads
      // is whether the transaction took it back — which it can only do if the
      // delete and the audit were one transaction.
      await expect(endAllSessions(id, UNPARSEABLE_ACTOR)).rejects.toThrow(
        /invalid input syntax for type uuid/,
      );

      expect(await sessionCount(id)).toBe(2);
      expect(await auditFor(id)).toHaveLength(0);
    });

    it('records exactly one act when two admins end the sessions at once', async () => {
      const id = await newAccount();
      await issue(id);
      await issue(id);
      await warmConnections(2);

      // The second transaction blocks on the first's row locks and then, seeing
      // the rows deleted, finds nothing to end. Without the lock both would count
      // two sessions and the trail would carry two revocations of one account.
      const answers = await Promise.all([
        endAllSessions(id, randomUUID()),
        endAllSessions(id, randomUUID()),
      ]);

      expect(answers.filter(Boolean)).toHaveLength(1);
      expect(await sessionCount(id)).toBe(0);
      expect(await auditFor(id)).toHaveLength(1);
    });

    it('touches no other account', async () => {
      const mine = await newAccount();
      const theirs = await newAccount();
      await issue(mine);
      await issue(theirs);

      await endAllSessions(mine, randomUUID());

      expect(await sessionCount(theirs)).toBe(1);
      expect(await auditFor(theirs)).toHaveLength(0);
    });
  });
});
