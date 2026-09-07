/**
 * The invitation and reset token against a real PostgreSQL (`AUTH-003`).
 *
 * Three properties here cannot be checked anywhere but a database. Single-use
 * under concurrency is one: it is a claim about what PostgreSQL does when two
 * statements meet at a row, and a suite that ran the consumption in one process
 * against a stub would assert the stub. Another is that the row never holds
 * anything presentable — a hash written by the function that also looks it up
 * would equal itself whatever it was, so the hash this suite compares against
 * is its own.
 *
 * The third is the one `SEC-R03` turns on: that a reset request does the same
 * work for an address an account holds and for one it does not. That is a claim
 * about which statements reach the server, so it is measured at the server — a
 * statement-level trigger fires once per statement whether or not the statement
 * touched a row, which makes "the insert ran even though nothing was inserted"
 * an assertion rather than a reading of the source. A clock would be the weaker
 * instrument for the same claim: it answers differently on a loaded machine,
 * and the load it would need to generate to average out is enough to time a
 * sibling suite out.
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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getConfig, loadConfig } from '../config/index';
import { closeDb, getDb } from '../db/index';
import type { AccountsTable, InvitationsTable } from '../db/types';
import { MAX_EMAIL_LENGTH } from './address';
import { hashPassword } from './password';
import {
  consumeToken,
  inviteAccount,
  issueToken,
  requestReset,
  EmailTakenError,
  INVITATION_TTL_SECONDS,
  RESET_TTL_SECONDS,
  type Invitation,
} from './invitation';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);

const INVITEE = 'invitation-invitee@example.test';
const OTHER = 'invitation-other@example.test';
/** The admin whose id every invitation in this suite is audited against. */
const INVITER = 'invitation-inviter@example.test';
/**
 * The one seeded account that is `active`, and so the only one a reset writes a
 * token for: `requestReset` narrows to an active account, so that an
 * unauthenticated request cannot destroy the invitation an invited person is
 * still waiting on (`AUTH-DEC-04`).
 */
const RESETTER = 'invitation-resetter@example.test';

const SEEDED = [INVITEE, OTHER, INVITER, RESETTER];

/**
 * The address `inviteAccount` creates an account for. It is not seeded — the
 * point of every test that uses it is that the function is what brings it into
 * existence — so it is removed before each of them and again at the end.
 */
const CREATED = 'invitation-created@example.test';

/** An address no account holds, and the half of `SEC-R03` that must be indistinguishable. */
const UNKNOWN = 'invitation-nobody@example.test';

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
 * The two functions the refusal triggers below call, and no trigger yet.
 *
 * Creating a function locks nothing this database shares; creating a trigger
 * takes `ACCESS EXCLUSIVE` on `invitations`, and every other suite's teardown
 * deletes accounts, which needs a lock on `invitations` for the foreign key to
 * cascade through. PostgreSQL queues lock requests in order, so one exclusive
 * request waiting behind an open read holds up every request behind it — and a
 * suite in another file, doing nothing wrong, times out. That is why the
 * functions are made once here and each test toggles only the trigger: two
 * exclusive moments per window instead of six.
 */
async function createRefusalFunctions(): Promise<void> {
  await dropRefusalTriggers();
  await sql`
    create or replace function invitation_insert_refused() returns trigger as $$
    begin raise exception 'insert refused'; end;
    $$ language plpgsql`.execute(getDb());
  await sql`
    create or replace function invitation_statement_refused() returns trigger as $$
    begin raise exception 'statement refused'; end;
    $$ language plpgsql`.execute(getDb());
  // Parks a writer between its delete and its insert, on a lock this suite
  // holds, which is the only way to hold one transaction open at a chosen point
  // and drive a second one past it.
  await sql`
    create or replace function invitation_insert_parked() returns trigger as $$
    begin perform pg_advisory_xact_lock(${sql.lit(BARRIER)}); return null; end;
    $$ language plpgsql`.execute(getDb());
}

async function dropRefusalTriggers(): Promise<void> {
  await allowInsertsToInvitations();
  await allowEveryStatement();
  await unparkInserts();
}

async function dropRefusalFunctions(): Promise<void> {
  await dropRefusalTriggers();
  await sql`drop function if exists invitation_insert_refused()`.execute(getDb());
  await sql`drop function if exists invitation_statement_refused()`.execute(getDb());
  await sql`drop function if exists invitation_insert_parked()`.execute(getDb());
}

/**
 * Make every insert of a row into `invitations` raise, so a transaction that
 * has already written something has to roll that write back.
 *
 * The trigger is table-wide, which is safe only because this is the one file
 * that writes `invitations` — tests within a file run one at a time, so the
 * window it is installed for holds nothing else. A suite in another file that
 * wrote the table would run in parallel with this one and have its inserts
 * refused, and would need the trigger scoped to its own account by a `WHEN`
 * clause before it could share the database.
 */
async function refuseInsertsToInvitations(): Promise<void> {
  await sql`
    create trigger invitation_insert_refused before insert on invitations
    for each row execute function invitation_insert_refused()`.execute(getDb());
}

async function allowInsertsToInvitations(): Promise<void> {
  await sql`drop trigger if exists invitation_insert_refused on invitations`.execute(getDb());
}

/**
 * Refuse one kind of statement against `invitations`, at statement level.
 *
 * The level is the instrument. A `FOR EACH ROW` trigger fires once per affected
 * row and so says nothing at all about a statement that affected none, which is
 * exactly the case `SEC-R03` turns on: a reset for an address no account holds
 * must still run the delete and the insert. `FOR EACH STATEMENT` fires once per
 * statement whatever it touched, so a refusal here is proof the statement was
 * executed — and its absence is proof it was not.
 *
 * The two operations are installed one at a time. A delete that raises stops
 * the transaction before the insert is reached, so a single trigger over both
 * could only ever report the first.
 */
async function refuseStatement(operation: 'delete' | 'insert'): Promise<void> {
  await sql`
    create trigger invitation_statement_refused
    before ${sql.raw(operation)} on invitations
    for each statement execute function invitation_statement_refused()`.execute(getDb());
}

async function allowEveryStatement(): Promise<void> {
  await sql`drop trigger if exists invitation_statement_refused on invitations`.execute(getDb());
}

/**
 * The advisory key this suite parks writers on, chosen far from anything
 * `hashtext` of an address would produce so the barrier and the address lock
 * cannot be the same lock.
 */
const BARRIER = 990_099;

/** How long, and how often, a probe waits for a backend to reach a lock. */
const POLL_ATTEMPTS = 200;
const POLL_MILLISECONDS = 25;

async function parkInserts(): Promise<void> {
  await sql`
    create trigger invitation_insert_parked before insert on invitations
    for each statement execute function invitation_insert_parked()`.execute(getDb());
}

async function unparkInserts(): Promise<void> {
  await sql`drop trigger if exists invitation_insert_parked on invitations`.execute(getDb());
}

/**
 * Hold an advisory lock on one connection until the returned release is called.
 *
 * A session-level `pg_advisory_lock` would be taken on whichever connection the
 * pool happened to hand over and released on whichever it handed over next, so
 * the lock is held inside a transaction instead: the transaction pins one
 * connection, and ending it releases the lock with no second call to get wrong.
 *
 * `ready` is what makes it a barrier rather than a race. Starting the call
 * under test as soon as this returns leaves which side acquires first to the
 * scheduler, and the run where the call wins passes every assertion about the
 * lock without ever having waited for it — the shape of test that reports on a
 * property it did not exercise.
 */
interface HeldLock {
  readonly ready: Promise<void>;
  readonly held: Promise<void>;
  readonly release: () => void;
}

function holdLock(key: number | string): HeldLock {
  let release = (): void => {};
  let acquired = (): void => {};
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });

  const held = getDb()
    .transaction()
    .execute(async (trx) => {
      if (typeof key === 'number') {
        await sql`select pg_advisory_xact_lock(${key})`.execute(trx);
      } else {
        await sql`select pg_advisory_xact_lock(hashtext(${key}))`.execute(trx);
      }
      acquired();
      await until;
    });

  return { ready, held, release };
}

/**
 * How many backends are waiting on an advisory lock right now, counted at the
 * server rather than inferred from how long something took.
 *
 * `pg_stat_activity` is the instrument the enumeration claim needs: whether a
 * request waits, and on what, is the difference between a lock every address
 * pays for and a row lock only an existing account can take. `wait_event` names
 * which — `advisory` for the address lock, `transactionid` for a row somebody
 * else has locked.
 */
async function advisoryWaiters(): Promise<string[]> {
  const seen = await sql<{ wait: string }>`
    select wait_event_type || '/' || wait_event as wait
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and wait_event_type = 'Lock'
      and (query like '%advisory%' or query like '%invitations%')
  `.execute(getDb());

  return seen.rows.map((row) => row.wait);
}

/** Wait until at least `count` backends are blocked on a lock, or give up. */
async function waitForWaiters(count: number): Promise<string[]> {
  let waits: string[] = [];

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    waits = await advisoryWaiters();
    if (waits.length >= count) {
      return waits;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MILLISECONDS));
  }

  return waits;
}

/** The account an address holds, or `undefined` — the question `requestReset` must not answer. */
async function accountFor(email: string): Promise<Selectable<AccountsTable> | undefined> {
  return getDb().selectFrom('accounts').selectAll().where('email', '=', email).executeTakeFirst();
}

/** Every invitation the address's account holds, newest expiry last. */
async function invitationsFor(email: string): Promise<Selectable<InvitationsTable>[]> {
  return getDb()
    .selectFrom('invitations')
    .selectAll('invitations')
    .innerJoin('accounts', 'accounts.id', 'invitations.account_id')
    .where('accounts.email', '=', email)
    .orderBy('invitations.expires_at')
    .execute();
}

/**
 * Every invitation row in the table. The claim a reset for an unknown address
 * has to support is that nothing was written *anywhere* — scoping the count to
 * an account would assume the answer, since the address has none.
 */
async function totalInvitations(): Promise<number> {
  const rows = await getDb().selectFrom('invitations').select('id').execute();

  return rows.length;
}

/** The trail's record of one account being created, read independently of the writer. */
async function creationsOf(subjectId: string): Promise<{ actor_id: string | null }[]> {
  return getDb()
    .selectFrom('audit')
    .select('actor_id')
    .where('action', '=', 'account.create')
    .where('subject_id', '=', subjectId)
    .execute();
}

/** No account for the address the invitation tests create, whatever an earlier run left. */
async function removeCreated(): Promise<void> {
  await getDb().deleteFrom('accounts').where('email', '=', CREATED).execute();
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

    await getDb()
      .deleteFrom('accounts')
      .where('email', 'in', [...SEEDED, CREATED])
      .execute();
    // The one real password hash the suite needs. A person who asks for a
    // reset is someone who has an account and cannot get into it, so the
    // account they ask from is `active` and carries a hash — a state a fixture
    // that wrote null could not stand for.
    const settled = await hashPassword('a-long-enough-development-password');

    await getDb()
      .insertInto('accounts')
      .values(
        // `invited` with no password hash is what an account holding an
        // outstanding invitation actually is, and it is the state the token
        // path has to work in. The inviter is an admin because an invitation is
        // audited against the account that made it, and a trail naming an
        // investor as the actor would describe something that cannot happen.
        SEEDED.map((email) => ({
          email,
          name: email === INVITER ? 'The Inviting Admin' : 'An Invited Investor',
          role: email === INVITER ? ('admin' as const) : ('investor' as const),
          password_hash: email === RESETTER ? settled : null,
          state: email === RESETTER ? ('active' as const) : ('invited' as const),
        })),
      )
      .execute();

    await createRefusalFunctions();
  }, 120_000);

  afterAll(async () => {
    await dropRefusalFunctions();

    // The invitations go with them: invitations.account_id is ON DELETE CASCADE.
    // The audit rows do not, and must not: the trail outlives the account it
    // names, which is the property that keeps it truthful after an erasure.
    await getDb()
      .deleteFrom('accounts')
      .where('email', 'in', [...SEEDED, CREATED])
      .execute();
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

  describe('inviting somebody', () => {
    beforeEach(async () => {
      await removeCreated();
    });

    /** The invitation an admin makes, as the console will make it: name, address, role. */
    async function invite(): Promise<Invitation> {
      return inviteAccount(
        { email: CREATED, name: 'A Named Investor', role: 'investor' },
        await accountId(INVITER),
      );
    }

    it('creates an invited account holding no password and one live invitation', async () => {
      const invitation = await invite();

      const account = await accountFor(CREATED);
      expect(account?.id).toBe(invitation.accountId);
      expect(account?.name).toBe('A Named Investor');
      expect(account?.role).toBe('investor');
      // The two halves of "invited": a state that cannot sign in, and no
      // password for an admin to have chosen on somebody else's behalf.
      expect(account?.state).toBe('invited');
      expect(account?.password_hash).toBeNull();

      const rows = await invitationsFor(CREATED);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.consumed_at).toBeNull();
    });

    it('returns a link that carries the token of the row it wrote', async () => {
      const invitation = await invite();

      const prefix = `${ORIGIN}/invite/`;
      expect(invitation.link.startsWith(prefix)).toBe(true);

      const token = invitation.link.slice(prefix.length);
      // The link is the only copy of the plaintext, so this is both halves at
      // once: the row holds its hash and nothing else, and the value an admin
      // copies is the value `consumeToken` will hash.
      const rows = await invitationsFor(CREATED);
      expect(rows[0]?.token_hash).toBe(hashOf(token));
      expect(token).not.toBe(rows[0]?.token_hash);
      expect(await consumeToken(token)).toBe(invitation.accountId);
    });

    it('gives the invitation seven days rather than the reset hour', async () => {
      const invitation = await invite();
      const token = invitation.link.slice(`${ORIGIN}/invite/`.length);

      expect(await secondsUntilExpiry(token)).toBeGreaterThan(
        INVITATION_TTL_SECONDS - TOLERANCE_SECONDS,
      );
      expect(await secondsUntilExpiry(token)).toBeLessThanOrEqual(INVITATION_TTL_SECONDS);
    });

    it('creates the account and shows the link when no mail credential is set', async () => {
      // The environment this suite runs in sets no SMTP_URL, so this is the
      // degraded case as a deployment reaches it rather than as a construction.
      const mail = getConfig().mail;
      expect(mail.available).toBe(false);

      const invitation = await invite();

      expect(invitation.deliverByHand).toBe(mail.available ? '' : mail.unavailable);
      expect(invitation.deliverByHand).toContain('SMTP_URL');
      expect(invitation.link).toContain('/invite/');
      // The whole of `SEC-R05` here: the account exists, the invitation exists,
      // and the admin holds the only thing needed to deliver it.
      expect(await accountFor(CREATED)).toBeDefined();
      expect(await invitationsFor(CREATED)).toHaveLength(1);
    });

    it('still asks the admin to deliver by hand when a mail credential is set', async () => {
      const mail = loadConfig({
        APP_ENV: 'development',
        APP_ORIGIN: ORIGIN,
        DATABASE_URL,
        SESSION_SECRET: 's'.repeat(40),
        SMTP_URL: 'smtps://valotech:secret@mail.example.test:465',
        MAIL_FROM: 'investors@valotech.org',
      }).mail;
      expect(mail.available).toBe(true);

      const invitation = await inviteAccount(
        { email: CREATED, name: 'A Named Investor', role: 'investor' },
        await accountId(INVITER),
        mail,
      );

      // A credential says a message could be sent. Until `AUTH-003/T3` builds
      // the send, none is — so an empty answer here would put "sent" on the
      // admin's screen for an invitee who received nothing, and `MAIL-DEC-01`
      // tells operators to set exactly this credential.
      expect(invitation.deliverByHand).not.toBe('');
      expect(invitation.deliverByHand).not.toContain('SMTP_URL');
      expect(invitation.link).toContain('/invite/');
    });

    it('records the creation against the admin who made it', async () => {
      const inviterId = await accountId(INVITER);

      const invitation = await inviteAccount(
        { email: CREATED, name: 'A Named Investor', role: 'investor' },
        inviterId,
      );

      expect(await creationsOf(invitation.accountId)).toEqual([{ actor_id: inviterId }]);
    });

    it('refuses an address an account already holds, whatever its case', async () => {
      const first = await invite();
      const firstToken = first.link.slice(`${ORIGIN}/invite/`.length);

      await expect(
        inviteAccount(
          { email: CREATED.toUpperCase(), name: 'Somebody Else', role: 'admin' },
          await accountId(INVITER),
        ),
      ).rejects.toThrow(EmailTakenError);

      // Refused means nothing happened, not that the account was updated: the
      // existing person keeps their name and role, their outstanding link still
      // works, and no second invitation was issued to invalidate it.
      const account = await accountFor(CREATED);
      expect(account?.name).toBe('A Named Investor');
      expect(account?.role).toBe('investor');
      expect(await invitationsFor(CREATED)).toHaveLength(1);
      expect(await consumeToken(firstToken)).toBe(first.accountId);
    });

    it('stores one spelling of the address, so a pasted one cannot become a second account', async () => {
      const pasted = `  ${CREATED.replace('invitation', 'Invitation')}\n`;

      const invitation = await inviteAccount(
        { email: pasted, name: 'A Named Investor', role: 'investor' },
        await accountId(INVITER),
      );

      // `citext` folds case and keeps whitespace, so the unique index this
      // insert must collide with is only reached from the normalised spelling.
      // Without that, a pasted address creates a second account for one person
      // — two rows, two invitations, and a unique constraint that never fired.
      const account = await accountFor(CREATED);
      expect(account?.id).toBe(invitation.accountId);
      // The stored value, not merely a value the column matches: `citext` would
      // find this row whatever case it was written in, so only reading the
      // column back shows that one spelling was written rather than the one the
      // admin happened to paste.
      expect(account?.email).toBe(CREATED);

      await expect(
        inviteAccount(
          { email: CREATED, name: 'Somebody Else', role: 'investor' },
          await accountId(INVITER),
        ),
      ).rejects.toThrow(EmailTakenError);
    });

    it('waits on the address, so an invitation and a reset cannot interleave', async () => {
      // The other half of the address lock: `requestReset` deletes and then
      // inserts, and an invitation landing between the two would meet the
      // partial unique index and raise — for an address an account holds and
      // never for one it does not.
      await warmConnections(3);
      const holder = holdLock(CREATED);
      await holder.ready;
      const blocked = invite();

      try {
        expect(await waitForWaiters(1)).toContain('Lock/advisory');
      } finally {
        holder.release();
        await holder.held;
        await blocked;
      }

      expect(await invitationsFor(CREATED)).toHaveLength(1);
    }, 30_000);

    it('says nothing about the address in the refusal it raises', async () => {
      await invite();

      // An error is the value most likely to be serialised by something
      // generic, so an investor's address must not be inside one (`DATA-R02`).
      const raised = await inviteAccount(
        { email: CREATED, name: 'Somebody Else', role: 'investor' },
        await accountId(INVITER),
      ).catch((error: unknown) => error);

      expect(raised).toBeInstanceOf(EmailTakenError);
      expect(JSON.stringify({ message: String(raised) })).not.toContain(CREATED);
    });

    it('writes the account and its invitation as one act, or neither', async () => {
      const inviterId = await accountId(INVITER);
      await refuseInsertsToInvitations();

      try {
        await expect(
          inviteAccount({ email: CREATED, name: 'A Named Investor', role: 'investor' }, inviterId),
        ).rejects.toThrow();
      } finally {
        await allowInsertsToInvitations();
      }

      // The account must not survive its own invitation failing. It would be an
      // `invited` row nobody can reach — and one the one-outstanding rule would
      // happily issue a second link for, so the failure would be invisible.
      expect(await accountFor(CREATED)).toBeUndefined();
    });
  });

  describe('asking for a password reset', () => {
    beforeEach(async () => {
      await clearInvitations(RESETTER);
    });

    it('answers the same nothing for an address an account holds and one it does not', async () => {
      // A token would be a self-service reset for anybody who knows an address,
      // and a boolean would be the membership oracle itself. There is only one
      // answer, and it carries nothing.
      expect(await requestReset(RESETTER)).toBeUndefined();
      expect(await requestReset(UNKNOWN)).toBeUndefined();
      expect(await requestReset(RESETTER)).toEqual(await requestReset(UNKNOWN));
    });

    it('writes one unconsumed token, for an hour, when the address has an active account', async () => {
      await requestReset(RESETTER);

      const rows = await invitationsFor(RESETTER);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.consumed_at).toBeNull();

      const seconds = await getDb()
        .selectFrom('invitations')
        .select(
          sql<number>`cast(extract(epoch from (expires_at - now())) as double precision)`.as(
            'seconds',
          ),
        )
        .where('id', '=', rows[0]?.id ?? '')
        .executeTakeFirstOrThrow();

      // An hour, not the invitation's seven days: the person asking is at their
      // keyboard, and the wrong lifetime here would be a week-long window on a
      // mailbox nobody is watching.
      expect(seconds.seconds).toBeGreaterThan(RESET_TTL_SECONDS - TOLERANCE_SECONDS);
      expect(seconds.seconds).toBeLessThanOrEqual(RESET_TTL_SECONDS);
    });

    it('writes nothing anywhere when no account holds the address', async () => {
      const before = await totalInvitations();

      await requestReset(UNKNOWN);

      expect(await totalInvitations()).toBe(before);
      expect(await accountFor(UNKNOWN)).toBeUndefined();
    });

    it('runs the delete for both addresses, whether or not it matches a row', async () => {
      await refuseStatement('delete');

      try {
        // The trigger fires per statement rather than per row, so a refusal is
        // proof the delete reached the server even where it matched nothing. A
        // path that returned early for the unknown address would resolve here
        // instead, and that is the whole of the enumeration defect.
        await expect(requestReset(RESETTER)).rejects.toThrow(/statement refused/);
        await expect(requestReset(UNKNOWN)).rejects.toThrow(/statement refused/);
      } finally {
        await allowEveryStatement();
      }
    });

    it('runs the insert for both addresses, whether or not there is a row to write', async () => {
      await refuseStatement('insert');

      try {
        await expect(requestReset(RESETTER)).rejects.toThrow(/statement refused/);
        await expect(requestReset(UNKNOWN)).rejects.toThrow(/statement refused/);
      } finally {
        await allowEveryStatement();
      }
    });

    it('waits on the address for both, so no lock exists only where an account does', async () => {
      // The measurement the whole rule turns on. A `FOR UPDATE` on the account
      // takes a lock where a row is and takes none where it is not, so a known
      // address queues and an unknown one runs straight through — a difference
      // that widens with every extra client until it can be read from outside.
      // A lock on the address is taken by both, and `pg_stat_activity` says so
      // at the server rather than a stopwatch saying so from here.
      await warmConnections(4);

      for (const address of [RESETTER, UNKNOWN]) {
        const holder = holdLock(address);
        await holder.ready;
        const blocked = requestReset(address);

        try {
          const waits = await waitForWaiters(1);
          expect(waits).toContain('Lock/advisory');
          // `transactionid` is what waiting on somebody's row looks like, and
          // it is the wait an address with no account could never pay.
          expect(waits.join(' ')).not.toContain('transactionid');
        } finally {
          holder.release();
          await holder.held;
          await blocked;
        }
      }
    }, 30_000);

    it('serialises two requests for one address instead of colliding at the index', async () => {
      // Both writers park at their insert, on a lock this suite holds, so the
      // interleaving is chosen rather than hoped for: with no address lock both
      // would have passed their delete and would meet at the partial unique
      // index, and the second would raise — a 500 for an address an account
      // holds and never for one it does not, which is the answer `SEC-R03`
      // forbids.
      await warmConnections(4);
      await parkInserts();
      const barrier = holdLock(BARRIER);
      await barrier.ready;

      try {
        const first = requestReset(RESETTER);
        const second = requestReset(RESETTER);

        expect(await waitForWaiters(2)).toHaveLength(2);
        barrier.release();
        await barrier.held;

        await expect(first).resolves.toBeUndefined();
        await expect(second).resolves.toBeUndefined();
      } finally {
        barrier.release();
        await barrier.held;
        await unparkInserts();
      }

      expect(await invitationsFor(RESETTER)).toHaveLength(1);
    }, 30_000);

    it('finds the account whatever the case of the address, as citext does', async () => {
      await requestReset(RESETTER.toUpperCase());

      // A lookup that were case-sensitive would send a real person the same
      // silence an unknown address gets, and would let one address hold two
      // live tokens by spelling.
      expect(await invitationsFor(RESETTER)).toHaveLength(1);
    });

    it('finds the account through the whitespace a paste carries', async () => {
      await requestReset(`  ${RESETTER}\n`);

      // Surrounding space is a transport artefact rather than part of an
      // address, and `citext` compares it literally — so an address pasted from
      // a mail client would otherwise answer with the silence that means "no
      // such account", to the one person entitled to a reset.
      expect(await invitationsFor(RESETTER)).toHaveLength(1);
    });

    it('turns away an address longer than an envelope allows, before it reaches the database', async () => {
      // Refused for its length, which the requester already knows and which
      // tells them nothing about any account. The bound is the one the door
      // uses, so no account that could ever sign in holds an address past it.
      const overlong = `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.test`;
      const before = await totalInvitations();
      const holder = holdLock(overlong);
      await holder.ready;

      try {
        // The address's own lock is held here, so a request that got as far as
        // the database would still be waiting on it. Answering while it is held
        // is the proof that nothing was done with the address at all — where
        // counting rows afterwards would pass just as well for a request that
        // ran in full and simply found no account.
        await expect(requestReset(overlong)).resolves.toBeUndefined();
      } finally {
        holder.release();
        await holder.held;
      }

      expect(await totalInvitations()).toBe(before);
    });

    it.each([
      ['still waiting on an invitation', 'invited' as const],
      ['suspended', 'suspended' as const],
    ])('leaves the outstanding invitation of an account %s exactly where it was', async (
      _case,
      state,
    ) => {
      // The safe default under decisions-log.md#AUTH-DEC-04. An unauthenticated
      // request must not be able to destroy the link somebody is waiting on,
      // and the person who lost it has no way to be told that it happened.
      const id = await clearInvitations(INVITEE);
      const invitation = await issueToken(id, INVITATION_TTL_SECONDS);
      await getDb().updateTable('accounts').set({ state }).where('id', '=', id).execute();

      try {
        await requestReset(INVITEE);

        const rows = await invitationsFor(INVITEE);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.token_hash).toBe(hashOf(invitation));
        expect(await consumeToken(invitation)).toBe(id);
      } finally {
        await getDb()
          .updateTable('accounts')
          .set({ state: 'invited' })
          .where('id', '=', id)
          .execute();
      }
    });

    it('leaves the outstanding token of another account alone', async () => {
      const theirId = await clearInvitations(OTHER);
      const theirs = await issueToken(theirId, INVITATION_TTL_SECONDS);

      await requestReset(RESETTER);

      expect(await rowCount(theirId)).toBe(1);
      expect(await consumeToken(theirs)).toBe(theirId);
    });
  });
});
