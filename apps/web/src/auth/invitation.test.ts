/**
 * The invitation and reset token against a real PostgreSQL (`AUTH-003`).
 *
 * Two properties here cannot be checked anywhere but a database. Single-use
 * under concurrency is one: it is a claim about what PostgreSQL does when two
 * statements meet at a row, and a suite that ran the consumption in one process
 * against a stub would assert the stub. The other is that the row never holds
 * anything presentable — a hash written by the function that also looks it up
 * would equal itself whatever it was, so the hash this suite compares against
 * is its own.
 *
 * It needs a database. `DATABASE_URL` names it, pending migrations are applied
 * to it, and it must be a development target: the suite writes accounts and
 * invitations and deletes them again.
 */

import { createHash, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql, type Selectable } from 'kysely';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import type { InvitationsTable } from '../db/types';
import {
  consumeToken,
  issueToken,
  INVITATION_TTL_SECONDS,
  RESET_TTL_SECONDS,
} from './invitation';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

const INVITEE = 'invitation-invitee@example.test';
const OTHER = 'invitation-other@example.test';

const SEEDED = [INVITEE, OTHER];

const SECONDS_PER_HOUR = 3600;
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * SECONDS_PER_HOUR;

/**
 * How far the stored expiry may sit from the lifetime asked for. The write
 * takes milliseconds, so this is slack for a loaded machine rather than a
 * measurement of anything — wide enough never to flake, and orders of magnitude
 * narrower than the gap between the two lifetimes it has to tell apart.
 */
const TOLERANCE_SECONDS = 30;

/** Two posts of one link, which is the collision the single statement settles. */
const RACERS = 2;

/** The hash the suite computes for itself, so an assertion has two sides. */
function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A token of the shape `issueToken` mints, for a row that was never written. */
function unissuedToken(): string {
  return randomBytes(32).toString('base64url');
}

async function accountId(email: string): Promise<string> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirstOrThrow();

  return account.id;
}

/** An account with no invitation of any kind, and nothing a previous test left. */
async function clearInvitations(email: string): Promise<string> {
  const id = await accountId(email);
  await getDb().deleteFrom('invitations').where('account_id', '=', id).execute();

  return id;
}

/** The row a token names, found the way an attacker with a dump cannot. */
async function rowFor(token: string): Promise<Selectable<InvitationsTable> | undefined> {
  return getDb()
    .selectFrom('invitations')
    .selectAll()
    .where('token_hash', '=', hashOf(token))
    .executeTakeFirst();
}

async function rowCount(id: string): Promise<number> {
  const rows = await getDb()
    .selectFrom('invitations')
    .select('id')
    .where('account_id', '=', id)
    .execute();

  return rows.length;
}

/**
 * The lifetime the row was written with, measured entirely inside the database.
 * Subtracting `now()` there rather than here keeps this suite's clock out of an
 * assertion about a column the database's clock filled.
 */
async function secondsUntilExpiry(token: string): Promise<number> {
  const row = await getDb()
    .selectFrom('invitations')
    .select(
      sql<number>`cast(extract(epoch from (expires_at - now())) as double precision)`.as('seconds'),
    )
    .where('token_hash', '=', hashOf(token))
    .executeTakeFirstOrThrow();

  return row.seconds;
}

/**
 * As many established connections as a race is about to need, before it starts.
 *
 * The pool opens a connection only when one is asked for and none is idle, and
 * that handshake costs tens of milliseconds where the statement costs one. Two
 * consumptions started together against a pool holding a single idle connection
 * are therefore not simultaneous at all: the second is still shaking hands
 * while the first commits, so it reads a row that is already consumed and a
 * read followed by a write passes the assertion below. That shape of the test
 * measures connection setup rather than single-use.
 */
async function warmConnections(count: number): Promise<void> {
  await Promise.all(Array.from({ length: count }, () => sql`select 1`.execute(getDb())));
}

/**
 * Make every insert into `invitations` raise, so a transaction that has already
 * deleted something has to roll that delete back. Dropped again by its partner
 * below, and dropped first here too, so a run killed mid-test leaves nothing
 * behind for the next one to trip over.
 *
 * The trigger is table-wide, which is safe only because this is the one suite
 * that writes `invitations`. When `AUTH-003/T3`, `/T4` or `/T7` add suites that
 * do, this must scope to its own account — a `WHEN` clause on the trigger — or
 * it will fail their inserts running in parallel against the shared database.
 */
async function refuseInsertsToInvitations(): Promise<void> {
  await allowInsertsToInvitations();
  await sql`
    create or replace function invitation_insert_refused() returns trigger as $$
    begin raise exception 'insert refused'; end;
    $$ language plpgsql`.execute(getDb());
  await sql`
    create trigger invitation_insert_refused before insert on invitations
    for each row execute function invitation_insert_refused()`.execute(getDb());
}

async function allowInsertsToInvitations(): Promise<void> {
  await sql`drop trigger if exists invitation_insert_refused on invitations`.execute(getDb());
  await sql`drop function if exists invitation_insert_refused()`.execute(getDb());
}

async function expire(token: string): Promise<void> {
  await getDb()
    .updateTable('invitations')
    .set({ expires_at: sql<Date>`now() - interval '1 minute'` })
    .where('token_hash', '=', hashOf(token))
    .execute();
}

describe.skipIf(!HAS_DATABASE)('AUTH-003 invitation and reset tokens', () => {
  beforeAll(async () => {
    await runner({
      databaseUrl: DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
      // Test files run in parallel and every database-backed one applies the
      // pending migrations, so two reach the migrator's advisory lock at once.
      // The default mode fails the loser; waiting makes the second find nothing
      // pending, which is the answer both wanted.
      advisoryLockMode: 'wait',
    });

    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await getDb()
      .insertInto('accounts')
      .values(
        // `invited` with no password hash is what an account holding an
        // outstanding invitation actually is, and it is the state the token
        // path has to work in.
        SEEDED.map((email) => ({
          email,
          name: 'An Invited Investor',
          role: 'investor' as const,
          password_hash: null,
          state: 'invited' as const,
        })),
      )
      .execute();
  }, 120_000);

  afterAll(async () => {
    // The invitations go with them: invitations.account_id is ON DELETE CASCADE.
    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await closeDb();
  });

  describe('what the row holds', () => {
    it('keeps the hash of the token and no column holding the token', async () => {
      const id = await clearInvitations(INVITEE);

      const token = await issueToken(id, INVITATION_TTL_SECONDS);
      const row = await rowFor(token);

      expect(row).toBeDefined();
      expect(row?.token_hash).toBe(hashOf(token));
      expect(row?.account_id).toBe(id);
      // Every value in the row, not only the column expected to be wrong: the
      // property is that a database read yields nothing presentable, and a
      // token copied into some other column would satisfy an assertion aimed
      // only at `token_hash`.
      expect(Object.values(row ?? {}).map(String)).not.toContain(token);
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('writes it unconsumed, so the token it handed back is usable', async () => {
      const id = await clearInvitations(INVITEE);

      const token = await issueToken(id, INVITATION_TTL_SECONDS);

      expect((await rowFor(token))?.consumed_at).toBeNull();
    });
  });

  describe('how long a token lives', () => {
    it('fixes seven days for an invitation and an hour for a reset', () => {
      // The two numbers the design states, pinned here so a change to either
      // has to be a change to the design as well.
      expect(INVITATION_TTL_SECONDS).toBe(SEVEN_DAYS_IN_SECONDS);
      expect(RESET_TTL_SECONDS).toBe(SECONDS_PER_HOUR);
    });

    it.each([
      ['an invitation', INVITATION_TTL_SECONDS],
      ['a reset', RESET_TTL_SECONDS],
    ])('stores the expiry %s was issued with', async (_case, ttlSeconds) => {
      const id = await clearInvitations(INVITEE);

      const token = await issueToken(id, ttlSeconds);

      expect(await secondsUntilExpiry(token)).toBeGreaterThan(ttlSeconds - TOLERANCE_SECONDS);
      expect(await secondsUntilExpiry(token)).toBeLessThanOrEqual(ttlSeconds);
    });
  });

  describe('consumption', () => {
    it('returns the account the token was issued for', async () => {
      const id = await clearInvitations(INVITEE);
      const token = await issueToken(id, INVITATION_TTL_SECONDS);

      expect(await consumeToken(token)).toBe(id);
      expect((await rowFor(token))?.consumed_at).not.toBeNull();
    });

    it('admits a token once, and answers null every time after', async () => {
      const id = await clearInvitations(INVITEE);
      const token = await issueToken(id, INVITATION_TTL_SECONDS);

      expect(await consumeToken(token)).toBe(id);
      const consumedAt = (await rowFor(token))?.consumed_at;

      expect(await consumeToken(token)).toBeNull();
      // The second attempt must not re-stamp the row either: the timestamp says
      // when somebody used the link, and a refused attempt is not a use.
      expect((await rowFor(token))?.consumed_at).toEqual(consumedAt);
    });

    it('answers null past the expiry, and leaves the row unconsumed', async () => {
      const id = await clearInvitations(INVITEE);
      const token = await issueToken(id, INVITATION_TTL_SECONDS);
      await expire(token);

      expect(await consumeToken(token)).toBeNull();
      // A refused token was not used, so nothing may say it was.
      expect((await rowFor(token))?.consumed_at).toBeNull();
    });

    it('answers null for a token no row holds', async () => {
      expect(await consumeToken(unissuedToken())).toBeNull();
    });

    it('answers null for the stored hash presented as the token', async () => {
      const id = await clearInvitations(INVITEE);
      const token = await issueToken(id, INVITATION_TTL_SECONDS);

      // What an attacker holding a database dump has. It is only a credential
      // if the presented value is compared rather than hashed, which is the
      // whole reason the column holds a hash.
      expect(await consumeToken(hashOf(token))).toBeNull();
      expect((await rowFor(token))?.consumed_at).toBeNull();
    });
  });

  describe('single-use under concurrency', () => {
    it('admits exactly one of two simultaneous consumptions', async () => {
      const id = await clearInvitations(INVITEE);
      const token = await issueToken(id, INVITATION_TTL_SECONDS);
      await warmConnections(RACERS);

      // Both in flight before either has answered, on two connections. This is
      // the case a read and then a write cannot survive: both would read an
      // unconsumed row, both would write, and two people would set a password
      // for one account.
      const answers = await Promise.all([consumeToken(token), consumeToken(token)]);

      expect(answers.filter((answer) => answer === id)).toHaveLength(1);
      expect(answers.filter((answer) => answer === null)).toHaveLength(1);
      expect((await rowFor(token))?.consumed_at).not.toBeNull();
    });
  });

  describe('issuing under concurrency', () => {
    it('leaves exactly one live token when two issues race for one account', async () => {
      const id = await clearInvitations(INVITEE);
      await warmConnections(RACERS);

      // Both in flight on two connections. Without the account-row lock inside
      // issueToken, each delete runs against a snapshot that cannot see the
      // other's insert, both rows survive, and the account holds two live tokens
      // — two people each setting a password for one account, reached through
      // the issue path rather than the consume path.
      const [first, second] = await Promise.all([
        issueToken(id, INVITATION_TTL_SECONDS),
        issueToken(id, INVITATION_TTL_SECONDS),
      ]);

      expect(await rowCount(id)).toBe(1);

      // Exactly one of the two tokens is the survivor; the other was deleted by
      // whichever issue committed last.
      const answers = [await consumeToken(first), await consumeToken(second)];
      expect(answers.filter((answer) => answer === id)).toHaveLength(1);
      expect(answers.filter((answer) => answer === null)).toHaveLength(1);
    });
  });

  describe('issuing again invalidates what is outstanding', () => {
    it('leaves the previous token dead and the new one working', async () => {
      const id = await clearInvitations(INVITEE);

      const first = await issueToken(id, INVITATION_TTL_SECONDS);
      const second = await issueToken(id, INVITATION_TTL_SECONDS);

      expect(await consumeToken(first)).toBeNull();
      expect(await consumeToken(second)).toBe(id);
    });

    it('deletes the outstanding row rather than stamping it used', async () => {
      const id = await clearInvitations(INVITEE);

      const first = await issueToken(id, INVITATION_TTL_SECONDS);
      await issueToken(id, INVITATION_TTL_SECONDS);

      // One row, and it is the new one. A superseded link nobody opened must
      // not be left behind claiming somebody used it.
      expect(await rowCount(id)).toBe(1);
      expect(await rowFor(first)).toBeUndefined();
    });

    it('leaves a consumed row standing, because it is not outstanding', async () => {
      const id = await clearInvitations(INVITEE);

      const first = await issueToken(id, INVITATION_TTL_SECONDS);
      expect(await consumeToken(first)).toBe(id);

      await issueToken(id, RESET_TTL_SECONDS);

      expect(await rowCount(id)).toBe(2);
      expect((await rowFor(first))?.consumed_at).not.toBeNull();
    });

    it('puts the outstanding token back when the insert fails', async () => {
      const id = await clearInvitations(INVITEE);
      const first = await issueToken(id, INVITATION_TTL_SECONDS);

      // Refusing the insert inside the database is the only way to see the
      // delete and the insert from outside as one unit or as two: rolled back
      // together, the account still holds the link it was sent, and run
      // separately it holds nothing at all — the state where a person clicks a
      // link that was valid when it arrived and an admin has to be asked for
      // another.
      await refuseInsertsToInvitations();

      try {
        await expect(issueToken(id, INVITATION_TTL_SECONDS)).rejects.toThrow();
      } finally {
        await allowInsertsToInvitations();
      }

      expect(await rowCount(id)).toBe(1);
      expect(await consumeToken(first)).toBe(id);
    });

    it('touches no other account, whose outstanding token still works', async () => {
      const theirId = await clearInvitations(OTHER);
      const theirs = await issueToken(theirId, INVITATION_TTL_SECONDS);

      const id = await clearInvitations(INVITEE);
      await issueToken(id, INVITATION_TTL_SECONDS);

      expect(await rowCount(theirId)).toBe(1);
      expect(await consumeToken(theirs)).toBe(theirId);
    });
  });
});
