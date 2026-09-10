/**
 * Suspension and role change against a real PostgreSQL (`ADMIN-001/T3`,
 * `ADMIN-001/T7`).
 *
 * Two things are asserted here that no return value can show. The first is that
 * each operation's writes are one transaction: a suspension that changed the
 * state and left the sessions standing returns exactly what a correct one
 * returns, so every positive test reads the rows, and the rollback tests make
 * the last write fail and assert that everything before it went back. The
 * second is that a revoked session is really revoked — asked of the gate, which
 * is what a copied cookie actually meets, and of the `sessions` row, which is
 * what proves the delete rather than the account's state.
 *
 * The rollback is forced by handing the operation an actor id the `audit`
 * table's `uuid` column cannot parse. That is a real database refusal at the
 * last write of the transaction, with nothing mocked and no trigger installed
 * on a table the other suites are using at the same time — and it lands after
 * the state change, the session delete and the invitation delete have all run,
 * which is exactly where a rollback has something to undo.
 *
 * It needs a database, and it runs against one of its own. The guard that
 * refuses to strand the room reads every active admin in the database
 * (`isLastActiveAdmin`), so a test of "the last one" is deterministic only when
 * this suite owns the whole set — and the development server it would otherwise
 * share carries other suites that create active admins of their own. So
 * `DATABASE_URL` is redirected to a database this file creates and migrates for
 * itself and clears between tests: nothing another worker writes can reach it,
 * and nothing it writes can reach another worker. The redirection lives in this
 * file's worker alone.
 */

import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resolveSession } from '../auth/gate';
import {
  consumeToken,
  INVITATION_TTL_SECONDS,
  issueToken,
  SuspendedAccountError,
} from '../auth/invitation';
import { issue } from '../auth/session';
import { closeDb, getDb } from '../db/index';
import type { AccountRole, AccountState } from '../db/types';
import {
  changeRole,
  eraseAccount,
  listAccounts,
  reinstateAccount,
  suspendAccount,
} from './accounts';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

/**
 * The database this suite creates, migrates and clears for itself. Isolation is
 * not tidiness here but correctness: `isLastActiveAdmin` reads the whole
 * active-admin set, and only a database no other worker writes to lets a test
 * assert there is exactly one active admin in it.
 */
const ISOLATED_DATABASE = 'valotech_admin_accounts';

/** The same connection string, pointed at another database on the same server. */
function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

// Point the application's one environment reader at this suite's own database
// before anything reads it. `getConfig` caches on first use and `getDb` builds
// its pool from the value, so setting it at module load — and only in this
// file's worker — is what sends every query below to the isolated database.
if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

const TTL_SECONDS = 3600;

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SESSION_TTL_SECONDS = String(TTL_SECONDS);

/** A recognisable label on every account this suite mints; the UUID makes it unique. */
const SUITE_DOMAIN = '@admin-accounts.test';

/**
 * Create this suite's database fresh, terminating any connection a crashed run
 * left on it (`WITH (FORCE)`). It is recreated at setup rather than dropped at
 * teardown, so no other test file can ever meet a database this one removed: the
 * redirection above is contained to this worker, and keeping teardown off the
 * destructive path holds that safe whatever the runner's isolation becomes.
 */
async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

/**
 * An actor id that the `audit` table's `uuid` column refuses, which is how a
 * failure is injected at the last write of the transaction without mocking
 * anything or touching a table another suite is using.
 */
const UNPARSEABLE_ACTOR = 'not-a-uuid';

/** The suite hashes for itself, so both sides of an assertion are independent. */
function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** One account, with the state and role a test needs and nothing else. */
async function newAccount(state: AccountState, role: AccountRole = 'investor'): Promise<string> {
  const account = await getDb()
    .insertInto('accounts')
    .values({
      email: `${randomUUID()}${SUITE_DOMAIN}`,
      name: 'An Investor',
      role,
      state,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return account.id;
}

async function stateOf(accountId: string): Promise<AccountState> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('state')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();

  return account.state;
}

async function roleOf(accountId: string): Promise<AccountRole> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('role')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();

  return account.role;
}

async function sessionCount(accountId: string): Promise<number> {
  const rows = await getDb()
    .selectFrom('sessions')
    .select('id')
    .where('account_id', '=', accountId)
    .execute();

  return rows.length;
}

/** Whether a row for this exact token still exists, hashed independently. */
async function rowExists(token: string): Promise<boolean> {
  const row = await getDb()
    .selectFrom('sessions')
    .select('id')
    .where('token_hash', '=', hashOf(token))
    .executeTakeFirst();

  return row !== undefined;
}

async function invitationCount(accountId: string, outstanding: boolean): Promise<number> {
  const rows = await getDb()
    .selectFrom('invitations')
    .select('id')
    .where('account_id', '=', accountId)
    .where('consumed_at', outstanding ? 'is' : 'is not', null)
    .execute();

  return rows.length;
}

/** Every audit row written about one account, read back independently of the writer. */
async function auditFor(accountId: string) {
  return getDb().selectFrom('audit').selectAll().where('subject_id', '=', accountId).execute();
}

/** How many admins can sign in right now — the count the last-admin guard turns on. */
async function activeAdminCount(): Promise<number> {
  const rows = await getDb()
    .selectFrom('accounts')
    .select('id')
    .where('role', '=', 'admin')
    .where('state', '=', 'active')
    .execute();

  return rows.length;
}

/**
 * As many established connections as a race is about to need, before it starts.
 * The pool opens a connection only when one is asked for and none is idle, and
 * that handshake dwarfs the statement, so two calls begun against a single idle
 * connection run one after the other — and a concurrency test that never had two
 * statements in flight proves nothing about the lock it meant to exercise.
 */
async function warmConnections(count: number): Promise<void> {
  await Promise.all(Array.from({ length: count }, () => sql`select 1`.execute(getDb())));
}

async function accountExists(accountId: string): Promise<boolean> {
  const row = await getDb()
    .selectFrom('accounts')
    .select('id')
    .where('id', '=', accountId)
    .executeTakeFirst();

  return row !== undefined;
}

/** The row's own clocks, which the list never shows but the trigger maintains. */
async function timestampsOf(accountId: string): Promise<{ created_at: Date; updated_at: Date }> {
  const row = await getDb()
    .selectFrom('accounts')
    .select(['created_at', 'updated_at'])
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();

  return { created_at: row.created_at, updated_at: row.updated_at };
}

/**
 * One account with the columns the list orders on pinned: the address, which
 * breaks a tie, and the moment it last signed in. `newAccount` mints a random
 * address on purpose, which is what every other test here wants and what an
 * order test cannot have.
 */
async function listedAccount(
  email: string,
  lastSignIn: Date | null,
  state: AccountState = 'active',
  role: AccountRole = 'investor',
): Promise<string> {
  const account = await getDb()
    .insertInto('accounts')
    .values({
      email: `${email}${SUITE_DOMAIN}`,
      name: `Investor ${email}`,
      role,
      state,
      last_sign_in: lastSignIn,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return account.id;
}

/** The addresses `listAccounts` answers with, in the order it answers them. */
async function listedAddresses(): Promise<string[]> {
  return (await listAccounts()).map((account) => account.email);
}

describe.skipIf(!HAS_DATABASE)('ADMIN-001 account mutations', () => {
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
    // A pristine admin universe for every test, which the last-admin guard needs
    // and only an isolated database allows. Sessions and invitations cascade on
    // account_id; the audit trail is keyed by the fresh account id each test
    // mints, so a row an earlier test wrote is never one a later test reads.
    await getDb().deleteFrom('accounts').execute();
  });

  afterAll(async () => {
    // Only `closeDb`: the database is recreated at setup, so there is nothing to
    // drop here, and the pool must be closed or the worker's event loop never
    // drains.
    await closeDb();
  });

  describe('listAccounts (T1)', () => {
    it('answers an empty list rather than raising when nobody has been invited yet', async () => {
      expect(await listAccounts()).toEqual([]);
    });

    it('carries the five things the list shows, and nothing else about the person', async () => {
      const id = await listedAccount('solo', new Date('2026-03-04T05:06:07.000Z'), 'suspended', 'admin');

      const accounts = await listAccounts();

      expect(accounts).toHaveLength(1);
      // The whole row, key for key: a password hash or a created_at reaching an
      // admin surface would be the read widening past what DATA-R01 admits, and
      // an assertion on named fields alone would not notice.
      expect(accounts[0]).toEqual({
        id,
        email: `solo${SUITE_DOMAIN}`,
        name: 'Investor solo',
        role: 'admin',
        state: 'suspended',
        last_sign_in: new Date('2026-03-04T05:06:07.000Z'),
      });
    });

    it('puts whoever has never signed in first, then the stalest, so the top of the list is the question', async () => {
      // Inserted newest-first, so an order that merely echoed insertion would
      // come back exactly reversed from the one asserted.
      await listedAccount('recent', new Date('2026-06-01T00:00:00.000Z'));
      await listedAccount('stale', new Date('2025-01-15T00:00:00.000Z'));
      await listedAccount('never', null);

      expect(await listedAddresses()).toEqual([
        `never${SUITE_DOMAIN}`,
        `stale${SUITE_DOMAIN}`,
        `recent${SUITE_DOMAIN}`,
      ]);
    });

    it('breaks a tie on the address, so the accounts that never signed in hold one order', async () => {
      // Every account that has never signed in shares a timestamp, so without a
      // second key their order is whatever the plan happened to produce — and a
      // list that reshuffles between two renders looks wrong while being right.
      await listedAccount('c-never', null);
      await listedAccount('a-never', null);
      await listedAccount('b-never', null);

      expect(await listedAddresses()).toEqual([
        `a-never${SUITE_DOMAIN}`,
        `b-never${SUITE_DOMAIN}`,
        `c-never${SUITE_DOMAIN}`,
      ]);
    });

    it('lists every account whatever its state or role, because the stale one is the point', async () => {
      await listedAccount('invited-person', null, 'invited');
      await listedAccount('suspended-person', new Date('2025-05-05T00:00:00.000Z'), 'suspended');
      await listedAccount('active-admin', new Date('2026-05-05T00:00:00.000Z'), 'active', 'admin');

      const accounts = await listAccounts();

      expect(accounts.map((account) => account.state)).toEqual(['invited', 'suspended', 'active']);
      expect(accounts.map((account) => account.role)).toEqual(['investor', 'investor', 'admin']);
    });
  });

  describe("updated_at tracks an account's attributes, not its sign-ins (`DATA-R07` fold)", () => {
    it('leaves updated_at alone on a sign-in write, and moves it on an attribute change', async () => {
      const id = await newAccount('active');
      const fresh = await timestampsOf(id);
      // At creation the two clocks agree: nothing has changed the row since insert.
      expect(fresh.updated_at.getTime()).toBe(fresh.created_at.getTime());

      // A sign-in writes last_sign_in, which the trigger's WHEN excludes, so
      // updated_at must not move. The pg_sleep advances the clock first, so a
      // WHEN that wrongly included last_sign_in, or was absent, would jump
      // updated_at a full 50ms — which the exact equality below catches, rather
      // than hinging on sub-millisecond round-trip timing.
      await sql`select pg_sleep(0.05)`.execute(getDb());
      await getDb()
        .updateTable('accounts')
        .set({ last_sign_in: sql<Date>`now()` })
        .where('id', '=', id)
        .execute();

      expect((await timestampsOf(id)).updated_at.getTime()).toBe(fresh.updated_at.getTime());

      // A change to a defining attribute does move it. pg_sleep advances the
      // clock past the insert, so the later timestamp is unambiguous at the
      // millisecond resolution getTime reads rather than resting on round-trip
      // timing.
      await sql`select pg_sleep(0.05)`.execute(getDb());
      await getDb().updateTable('accounts').set({ name: 'Renamed' }).where('id', '=', id).execute();

      expect((await timestampsOf(id)).updated_at.getTime()).toBeGreaterThan(
        fresh.updated_at.getTime(),
      );
    });
  });

  describe('suspendAccount (T3)', () => {
    it('changes the state, ends every session, and records one act', async () => {
      const actor = randomUUID();
      const id = await newAccount('active');
      await issue(id);
      await issue(id);

      expect(await sessionCount(id)).toBe(2);

      expect(await suspendAccount(id, actor)).toBe(true);

      expect(await stateOf(id)).toBe('suspended');
      // The rows, not the answer. A suspension that set the state and left the
      // sessions standing returns exactly what this one returned.
      expect(await sessionCount(id)).toBe(0);

      const trail = await auditFor(id);

      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('account.suspend');
      expect(trail[0]?.actor_id).toBe(actor);
      expect(trail[0]?.subject_type).toBe('account');
    });

    it('deletes the outstanding invitation, so a link sent before it cannot be accepted', async () => {
      const id = await newAccount('invited');
      const token = await issueToken(id, INVITATION_TTL_SECONDS);

      await suspendAccount(id, randomUUID());

      // Asked of the consumption path rather than only of the row, because that
      // is what the person holding the link actually reaches: consumeToken
      // checks the token's three predicates and not the account's state, so a
      // surviving row would hand back the account and set a password on it.
      expect(await consumeToken(token)).toBeNull();
      expect(await invitationCount(id, true)).toBe(0);
    });

    it('leaves a consumed invitation standing, which records a use rather than a capability', async () => {
      const id = await newAccount('invited');
      const token = await issueToken(id, INVITATION_TTL_SECONDS);

      expect(await consumeToken(token)).toBe(id);

      await suspendAccount(id, randomUUID());

      expect(await invitationCount(id, false)).toBe(1);
    });

    it('leaves the account resolving to nobody, so a copy of the cookie is dead', async () => {
      const id = await newAccount('active');
      const token = (await issue(id)).value;

      expect(await resolveSession(token)).not.toBeNull();

      await suspendAccount(id, randomUUID());

      // Both halves: the gate refuses a suspended account whatever rows remain,
      // and the row is gone, which is the half that proves the delete ran.
      expect(await resolveSession(token)).toBeNull();
      expect(await rowExists(token)).toBe(false);
    });

    it('changes nothing and records nothing when the account is already suspended', async () => {
      const id = await newAccount('active');

      expect(await suspendAccount(id, randomUUID())).toBe(true);
      expect(await auditFor(id)).toHaveLength(1);

      expect(await suspendAccount(id, randomUUID())).toBe(false);

      expect(await stateOf(id)).toBe('suspended');
      // Still one: the trail holds acts, and re-asking for a state an account
      // already holds is not one.
      expect(await auditFor(id)).toHaveLength(1);
    });

    it('answers false for an id no account holds, writing nothing', async () => {
      const absent = randomUUID();

      expect(await suspendAccount(absent, randomUUID())).toBe(false);
      expect(await auditFor(absent)).toHaveLength(0);
    });

    it('records exactly one act when two admins suspend at once', async () => {
      const id = await newAccount('active');
      await issue(id);

      // The second update blocks on the first's row lock and then re-evaluates
      // its predicate against the row the first left behind, so it matches
      // nothing. Without that narrowing both would write and the trail would
      // carry two suspensions of one account.
      const answers = await Promise.all([
        suspendAccount(id, randomUUID()),
        suspendAccount(id, randomUUID()),
      ]);

      expect(answers.filter(Boolean)).toHaveLength(1);
      expect(await stateOf(id)).toBe('suspended');
      expect(await sessionCount(id)).toBe(0);
      expect(await auditFor(id)).toHaveLength(1);
    });

    it('rolls the state, the sessions and the invitation back when the audit cannot be written', async () => {
      const id = await newAccount('active');
      const token = (await issue(id)).value;
      await issueToken(id, INVITATION_TTL_SECONDS);

      // The audit insert is the last write, and it refuses this actor id, so
      // everything before it has already run when the failure arrives. What the
      // assertions below read is whether the transaction took those writes back
      // — which it can only do if they were inside it.
      await expect(suspendAccount(id, UNPARSEABLE_ACTOR)).rejects.toThrow(
        /invalid input syntax for type uuid/,
      );

      expect(await stateOf(id)).toBe('active');
      expect(await rowExists(token)).toBe(true);
      expect(await sessionCount(id)).toBe(1);
      expect(await invitationCount(id, true)).toBe(1);
      expect(await auditFor(id)).toHaveLength(0);
    });

    it('touches no other account', async () => {
      const mine = await newAccount('active');
      const theirs = await newAccount('active');
      const theirToken = (await issue(theirs)).value;
      await issueToken(theirs, INVITATION_TTL_SECONDS);

      await suspendAccount(mine, randomUUID());

      expect(await stateOf(theirs)).toBe('active');
      expect(await rowExists(theirToken)).toBe(true);
      expect(await invitationCount(theirs, true)).toBe(1);
      expect(await auditFor(theirs)).toHaveLength(0);
    });

    it('refuses a fresh token once suspended, so no re-issue undoes the suspension', async () => {
      const id = await newAccount('active');

      expect(await suspendAccount(id, randomUUID())).toBe(true);

      // Suspension deletes the outstanding invitation; a fresh token would hand
      // back the way in the suspension removed. `issueTokenIn` refuses a
      // suspended account in the statement that takes the account lock
      // (`AUTH-003`), so no re-issue can slip in after a suspension commits.
      await expect(issueToken(id, INVITATION_TTL_SECONDS)).rejects.toThrow(SuspendedAccountError);
    });
  });

  describe('changeRole (T7)', () => {
    it('changes the role, ends every session, and records one act', async () => {
      const actor = randomUUID();
      const id = await newAccount('active', 'investor');
      await issue(id);
      await issue(id);

      expect(await changeRole(id, 'admin', actor)).toBe(true);

      expect(await roleOf(id)).toBe('admin');
      expect(await sessionCount(id)).toBe(0);

      const trail = await auditFor(id);

      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('account.role_change');
      expect(trail[0]?.actor_id).toBe(actor);
      expect(trail[0]?.subject_type).toBe('account');
    });

    it('ends a demoted admin session, so no elevated session outlives the demotion', async () => {
      const id = await newAccount('active', 'admin');
      // A second admin, so demoting the first does not strand the room and is
      // not refused for it (`ADMIN-DEC-01`); that refusal has its own tests.
      await newAccount('active', 'admin');
      const token = (await issue(id)).value;

      expect((await resolveSession(token))?.role).toBe('admin');

      await changeRole(id, 'investor', randomUUID());

      // The row is the assertion that carries the weight: the gate reads the
      // role from `accounts` on every request, so it would answer `investor`
      // for a session that had survived, and a test asking only that would pass
      // against a role change that ended nothing.
      expect(await rowExists(token)).toBe(false);
      expect(await resolveSession(token)).toBeNull();
      expect(await sessionCount(id)).toBe(0);
    });

    it('writes nothing, signs nobody out and records nothing when the role is already held', async () => {
      const id = await newAccount('active', 'investor');
      const token = (await issue(id)).value;

      expect(await changeRole(id, 'investor', randomUUID())).toBe(false);

      expect(await roleOf(id)).toBe('investor');
      // Nobody is signed out for an act that did not happen: there is no
      // privilege change here to rotate a session for.
      expect(await rowExists(token)).toBe(true);
      expect(await resolveSession(token)).not.toBeNull();
      expect(await auditFor(id)).toHaveLength(0);
    });

    it('answers false for an id no account holds, writing nothing', async () => {
      const absent = randomUUID();

      expect(await changeRole(absent, 'admin', randomUUID())).toBe(false);
      expect(await auditFor(absent)).toHaveLength(0);
    });

    it('rolls the role and the sessions back when the audit cannot be written', async () => {
      const id = await newAccount('active', 'investor');
      const token = (await issue(id)).value;

      await expect(changeRole(id, 'admin', UNPARSEABLE_ACTOR)).rejects.toThrow(
        /invalid input syntax for type uuid/,
      );

      expect(await roleOf(id)).toBe('investor');
      expect(await rowExists(token)).toBe(true);
      expect(await auditFor(id)).toHaveLength(0);
    });

    it('leaves an invited account holding its invitation, which a suspension would take', async () => {
      const id = await newAccount('invited');
      const token = await issueToken(id, INVITATION_TTL_SECONDS);

      expect(await changeRole(id, 'admin', randomUUID())).toBe(true);

      // The person is still expected; what changed is what they will reach when
      // they arrive. Asked of the consumption path, because that is the link.
      expect(await consumeToken(token)).toBe(id);
    });

    it('touches no other account', async () => {
      const mine = await newAccount('active', 'investor');
      const theirs = await newAccount('active', 'investor');
      const theirToken = (await issue(theirs)).value;

      await changeRole(mine, 'admin', randomUUID());

      expect(await roleOf(theirs)).toBe('investor');
      expect(await rowExists(theirToken)).toBe(true);
      expect(await auditFor(theirs)).toHaveLength(0);
    });
  });

  describe('the last-admin and self guards (ADMIN-DEC-01)', () => {
    it('refuses to suspend the last admin who can sign in, writing nothing', async () => {
      const admin = await newAccount('active', 'admin');

      // The only admin who can act. Suspending it leaves the room with nobody to
      // undo anything, and suspension is a one-way door in code — nothing sets a
      // suspended account back to active yet.
      expect(await suspendAccount(admin, randomUUID())).toBe(false);

      expect(await stateOf(admin)).toBe('active');
      expect(await auditFor(admin)).toHaveLength(0);
    });

    it('refuses to demote the last admin who can sign in, writing nothing', async () => {
      const admin = await newAccount('active', 'admin');

      expect(await changeRole(admin, 'investor', randomUUID())).toBe(false);

      expect(await roleOf(admin)).toBe('admin');
      expect(await auditFor(admin)).toHaveLength(0);
    });

    it('suspends an admin while another active admin remains', async () => {
      const staying = await newAccount('active', 'admin');
      const going = await newAccount('active', 'admin');

      // Not the last: `staying` still answers for the room, so the guard permits
      // the act it exists only to refuse when it would strand the room.
      expect(await suspendAccount(going, randomUUID())).toBe(true);

      expect(await stateOf(going)).toBe('suspended');
      expect(await stateOf(staying)).toBe('active');
      expect(await auditFor(going)).toHaveLength(1);
    });

    it('suspends an investor even when one admin is the only admin', async () => {
      // The sole admin, and a separate investor as the subject. The guard turns
      // on whether the subject is the last admin, not on whether an admin
      // exists: one that refused on the count alone would make an investor
      // unsuspendable whenever the room held exactly one admin.
      await newAccount('active', 'admin');
      const investor = await newAccount('active', 'investor');

      expect(await suspendAccount(investor, randomUUID())).toBe(true);

      expect(await stateOf(investor)).toBe('suspended');
    });

    it('counts admins who can sign in, not the role, so a suspended admin does not license stranding', async () => {
      const active = await newAccount('active', 'admin');
      // An admin by role, but suspended — it cannot sign in to undo anything,
      // and reinstating it is itself an admin act.
      await newAccount('suspended', 'admin');

      // `active` is the last admin who can act. A guard counting the role alone
      // would see two admins here and allow both acts, leaving the room with no
      // admin able to sign in.
      expect(await suspendAccount(active, randomUUID())).toBe(false);
      expect(await changeRole(active, 'investor', randomUUID())).toBe(false);

      expect(await stateOf(active)).toBe('active');
      expect(await roleOf(active)).toBe('admin');
    });

    it('refuses an admin suspending or demoting their own account', async () => {
      const admin = await newAccount('active', 'admin');
      // A second active admin, so the refusals below can only be the self guard:
      // neither is the last admin, so the last-admin guard does not fire.
      await newAccount('active', 'admin');

      expect(await suspendAccount(admin, admin)).toBe(false);
      expect(await changeRole(admin, 'investor', admin)).toBe(false);

      expect(await stateOf(admin)).toBe('active');
      expect(await roleOf(admin)).toBe('admin');
      expect(await auditFor(admin)).toHaveLength(0);
    });

    it('leaves one admin standing when the last two are demoted at once', async () => {
      const first = await newAccount('active', 'admin');
      const second = await newAccount('active', 'admin');
      await warmConnections(2);

      // Both transactions lock the active-admin rows in id order, so they
      // serialise rather than deadlock. One demotes; the other, re-reading the
      // set the first left, finds a single admin who can sign in and is refused.
      // Without the re-read under the lock both would read two admins and commit
      // to zero, and the room would have nobody able to sign in.
      const answers = await Promise.all([
        changeRole(first, 'investor', randomUUID()),
        changeRole(second, 'investor', randomUUID()),
      ]);

      expect(answers.filter(Boolean)).toHaveLength(1);
      expect(await activeAdminCount()).toBe(1);
    });
  });

  describe('reinstateAccount (T8)', () => {
    it('restores a suspended account to active and records one act', async () => {
      const actor = randomUUID();
      const id = await newAccount('suspended');

      expect(await reinstateAccount(id, actor)).toBe(true);

      expect(await stateOf(id)).toBe('active');

      const trail = await auditFor(id);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('account.reinstate');
      expect(trail[0]?.actor_id).toBe(actor);
      expect(trail[0]?.subject_type).toBe('account');
    });

    it.each<AccountState>(['active', 'invited'])(
      'leaves an account that is %s alone, recording nothing',
      async (state) => {
        const id = await newAccount(state);

        expect(await reinstateAccount(id, randomUUID())).toBe(false);

        expect(await stateOf(id)).toBe(state);
        expect(await auditFor(id)).toHaveLength(0);
      },
    );

    it('answers false for an id no account holds, writing nothing', async () => {
      const absent = randomUUID();

      expect(await reinstateAccount(absent, randomUUID())).toBe(false);
      expect(await auditFor(absent)).toHaveLength(0);
    });

    it('rolls the state back when the audit cannot be written', async () => {
      const id = await newAccount('suspended');

      await expect(reinstateAccount(id, UNPARSEABLE_ACTOR)).rejects.toThrow(
        /invalid input syntax for type uuid/,
      );

      expect(await stateOf(id)).toBe('suspended');
      expect(await auditFor(id)).toHaveLength(0);
    });

    it('touches no other account', async () => {
      const mine = await newAccount('suspended');
      const theirs = await newAccount('suspended');

      await reinstateAccount(mine, randomUUID());

      expect(await stateOf(theirs)).toBe('suspended');
      expect(await auditFor(theirs)).toHaveLength(0);
    });
  });

  describe('eraseAccount (T2)', () => {
    it('deletes the account, signs it out, and records one act that outlives it', async () => {
      const actor = randomUUID();
      const id = await newAccount('active');
      await issue(id);
      const token = (await issue(id)).value;
      await issueToken(id, INVITATION_TTL_SECONDS);

      expect(await sessionCount(id)).toBe(2);

      expect(await eraseAccount(id, actor)).toBe(true);

      // The row is gone, and the cascade reached what is about the person: the
      // sessions it held and the invitation it was sent. The content side of the
      // cascade — a revision's author nulled, the revision kept — is DATA-002/T5,
      // proven in the content module where a content table may be named.
      expect(await accountExists(id)).toBe(false);
      expect(await sessionCount(id)).toBe(0);
      expect(await rowExists(token)).toBe(false);
      expect(await invitationCount(id, true)).toBe(0);

      // The audit row survives its own subject: actor_id and subject_id are bare
      // uuids, not foreign keys, so the record of who erased whom is not itself
      // cascaded away.
      const trail = await auditFor(id);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('account.delete');
      expect(trail[0]?.actor_id).toBe(actor);
      expect(trail[0]?.subject_type).toBe('account');
    });

    it('refuses an admin erasing their own account, writing nothing', async () => {
      const admin = await newAccount('active', 'admin');
      // A second active admin, so the refusal can only be the self guard: the
      // subject is not the last admin.
      await newAccount('active', 'admin');

      expect(await eraseAccount(admin, admin)).toBe(false);

      expect(await accountExists(admin)).toBe(true);
      expect(await auditFor(admin)).toHaveLength(0);
    });

    it('refuses erasing the last admin who can sign in, writing nothing', async () => {
      const admin = await newAccount('active', 'admin');

      // The only admin who can act, and erasure has no inverse: stranding the
      // room this way could not be undone even from the database.
      expect(await eraseAccount(admin, randomUUID())).toBe(false);

      expect(await accountExists(admin)).toBe(true);
      expect(await auditFor(admin)).toHaveLength(0);
    });

    it('erases an admin while another active admin remains', async () => {
      const staying = await newAccount('active', 'admin');
      const going = await newAccount('active', 'admin');

      expect(await eraseAccount(going, randomUUID())).toBe(true);

      expect(await accountExists(going)).toBe(false);
      expect(await accountExists(staying)).toBe(true);
    });

    it('answers false for an id no account holds, writing nothing', async () => {
      const absent = randomUUID();

      expect(await eraseAccount(absent, randomUUID())).toBe(false);
      expect(await auditFor(absent)).toHaveLength(0);
    });

    it('rolls the deletion back when the audit cannot be written', async () => {
      const id = await newAccount('active');
      const token = (await issue(id)).value;

      // The audit insert is the last write and refuses this actor id, so the
      // delete has already run when the failure arrives. What the assertions read
      // is whether the transaction took the delete back — which it can only do if
      // the delete and the audit were one transaction.
      await expect(eraseAccount(id, UNPARSEABLE_ACTOR)).rejects.toThrow(
        /invalid input syntax for type uuid/,
      );

      expect(await accountExists(id)).toBe(true);
      expect(await rowExists(token)).toBe(true);
      expect(await auditFor(id)).toHaveLength(0);
    });

    it('touches no other account', async () => {
      const mine = await newAccount('active');
      const theirs = await newAccount('active');
      const theirToken = (await issue(theirs)).value;

      await eraseAccount(mine, randomUUID());

      expect(await accountExists(theirs)).toBe(true);
      expect(await rowExists(theirToken)).toBe(true);
    });
  });
});
