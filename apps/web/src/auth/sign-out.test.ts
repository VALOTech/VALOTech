/**
 * Sign-out against a real PostgreSQL (`AUTH-004`).
 *
 * Every assertion here is about the row rather than the response. A sign-out
 * that redirects, expires the cookie and leaves the session standing is the
 * defect this feature exists to prevent, and it is invisible from the answer
 * the caller gets: the two cases produce byte-identical responses. So each test
 * counts the `sessions` rows before and after, and asks the gate whether the
 * token still resolves.
 *
 * The hash the suite computes is its own rather than `session.ts`'s, so the two
 * sides of an assertion are independent — a `token_hash` written by some other
 * function would still equal itself.
 *
 * It needs a database. `DATABASE_URL` names it, pending migrations are applied
 * to it, and it must be a development target: the suite writes accounts and
 * sessions and deletes them again.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as auditModule from '../audit/record';
import { POST as SESSIONS_ALL } from '../app/api/account/sessions/all/route';
import { POST as SIGN_OUT } from '../app/api/auth/sign-out/route';
import { closeDb, getDb } from '../db/index';
import { accountForToken, resolveSession } from './gate';
import { hashPassword } from './password';
import {
  invalidateAllForAccount,
  invalidateSession,
  issue,
  sessionCookieName,
  signToken,
  tokenOfCookie,
} from './session';
import * as sessionModule from './session';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

const TTL_SECONDS = 3600;

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SESSION_TTL_SECONDS = String(TTL_SECONDS);

const READER = 'signout-reader@example.test';
const OTHER = 'signout-other@example.test';

const SEEDED = [READER, OTHER];

const PASSWORD = 'a passphrase an investor would actually use';

/** The status every sign-out answers with, whatever it found to end. */
const SEE_OTHER = 303;

type Handler = (request: Request) => Promise<Response>;

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A token of the shape `issue()` mints, for a session that was never written. */
function unissuedToken(): string {
  return randomBytes(32).toString('base64url');
}

function post(handler: Handler, token: string | null): Promise<Response> {
  const headers = new Headers();

  if (token !== null) {
    headers.set('Cookie', `${sessionCookieName()}=${signToken(token)}`);
  }

  return handler(
    new Request('http://localhost:3100/api/auth/sign-out', { method: 'POST', headers }),
  );
}

async function accountId(email: string): Promise<string> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirstOrThrow();

  return account.id;
}

async function sessionCount(email: string): Promise<number> {
  const rows = await getDb()
    .selectFrom('sessions')
    .innerJoin('accounts', 'accounts.id', 'sessions.account_id')
    .select('sessions.id')
    .where('accounts.email', '=', email)
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

/** The expiry stored for a token's row, to catch a slide that should not happen. */
async function expiresAt(token: string): Promise<Date> {
  const row = await getDb()
    .selectFrom('sessions')
    .select('expires_at')
    .where('token_hash', '=', hashOf(token))
    .executeTakeFirstOrThrow();

  return row.expires_at;
}

/** Every session an account holds, cleared before a test writes its own. */
async function clearSessions(email: string): Promise<string> {
  const id = await accountId(email);
  await getDb().deleteFrom('sessions').where('account_id', '=', id).execute();

  return id;
}

/**
 * The token a cookie carries, read the way the gate reads it.
 *
 * `issue` hands back a cookie, and a cookie is the token and its signature;
 * every function in the store takes the token.
 */
function tokenOf(cookieValue: string): string {
  const carried = tokenOfCookie(cookieValue);

  if (carried === null) {
    throw new Error('issue() minted a cookie the gate cannot read');
  }

  return carried;
}

/**
 * One fresh session for an account, and nothing a previous test left.
 *
 * The token rather than the cookie value, because that is what the store
 * takes: the cookie carries the token and its signature, and the row holds
 * the hash of the token alone. `post` signs it again on the way in, which is
 * the same round trip a browser makes.
 */
async function onlySessionFor(email: string): Promise<string> {
  return tokenOf((await issue(await clearSessions(email))).value);
}

/**
 * An active account of this suite's own, beyond the two it seeds. The audit
 * test asserts a count, and the seeded accounts accumulate `session.invalidate_all`
 * rows across the other tests here; a fresh id no other test touches makes the
 * count this test's alone. The trail is append-only, so its row outlives the
 * account when the test deletes it.
 */
async function freshActiveAccount(): Promise<string> {
  const account = await getDb()
    .insertInto('accounts')
    .values({
      email: `signout-${randomUUID()}@example.test`,
      name: 'A Signed-in Investor',
      role: 'investor',
      state: 'active',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return account.id;
}

/** Every audit row about one account, read back independently of the writer. */
async function auditFor(accountId: string) {
  return getDb().selectFrom('audit').selectAll().where('subject_id', '=', accountId).execute();
}

/** Everything after the name and value of a `Set-Cookie` header. */
function attributes(header: string): string[] {
  return header
    .split(';')
    .slice(1)
    .map((part) => part.trim());
}

/** The one `Set-Cookie` a sign-out carries. */
function setCookie(response: Response): string {
  const cookies = response.headers.getSetCookie();

  expect(cookies).toHaveLength(1);

  return cookies[0] ?? '';
}

/** Asserted on every answer either surface gives, whatever it found to end. */
function expectSignedOut(response: Response): void {
  expect(response.status).toBe(SEE_OTHER);
  expect(response.headers.get('Location')).toBe('/');
  expect(response.headers.get('Cache-Control')).toBe('no-store');

  const header = setCookie(response);

  expect(header.startsWith(`${sessionCookieName()}=;`)).toBe(true);
  // Max-Age=0 is what makes the browser drop it. Path, SameSite and HttpOnly
  // repeat the issued cookie's, because a browser matches for replacement by
  // name and path -- a Max-Age=0 under another path leaves the original
  // standing, and the reader goes on presenting a token whose row is gone.
  expect(attributes(header)).toEqual(['Path=/', 'Max-Age=0', 'SameSite=Lax', 'HttpOnly']);
}

describe.skipIf(!HAS_DATABASE)('AUTH-004 sign-out', () => {
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

    const encoded = await hashPassword(PASSWORD);

    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await getDb()
      .insertInto('accounts')
      .values(
        SEEDED.map((email) => ({
          email,
          name: 'A Signed-in Investor',
          role: 'investor' as const,
          password_hash: encoded,
          state: 'active' as const,
        })),
      )
      .execute();
  }, 120_000);

  afterAll(async () => {
    // The sessions go with them: sessions.account_id is ON DELETE CASCADE.
    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await closeDb();
  });

  describe('POST /api/auth/sign-out', () => {
    it('deletes the row the cookie names, then expires the cookie', async () => {
      const token = await onlySessionFor(READER);

      expect(await sessionCount(READER)).toBe(1);
      expect(await rowExists(token)).toBe(true);

      expectSignedOut(await post(SIGN_OUT, token));

      // The row, not the answer. A sign-out that expired the cookie and left
      // the session standing returns exactly the response asserted above.
      expect(await rowExists(token)).toBe(false);
      expect(await sessionCount(READER)).toBe(0);
    });

    it('leaves the token resolving to nobody, so a copy of the cookie is dead', async () => {
      const token = await onlySessionFor(READER);

      expect(await resolveSession(token)).not.toBeNull();

      await post(SIGN_OUT, token);

      // The gate is asked rather than trusted to follow from the row count:
      // this is the property SEC-R02 states, and it is what a stolen cookie
      // presented after the sign-out actually meets.
      expect(await resolveSession(token)).toBeNull();
    });

    it('ends only this session, leaving the same account signed in elsewhere', async () => {
      const id = await clearSessions(READER);

      const laptop = tokenOf((await issue(id)).value);
      const phone = tokenOf((await issue(id)).value);

      await post(SIGN_OUT, laptop);

      expect(await rowExists(laptop)).toBe(false);
      expect(await rowExists(phone)).toBe(true);
      expect(await resolveSession(phone)).not.toBeNull();
      expect(await sessionCount(READER)).toBe(1);
    });

    it('touches no other account', async () => {
      const mine = await onlySessionFor(READER);
      const theirs = await onlySessionFor(OTHER);

      await post(SIGN_OUT, mine);

      expect(await rowExists(theirs)).toBe(true);
      expect(await sessionCount(OTHER)).toBe(1);
    });
  });

  describe('signing out twice, and with nothing to sign out', () => {
    it('answers the same the second time, with no already-signed-out error', async () => {
      const token = await onlySessionFor(READER);

      expectSignedOut(await post(SIGN_OUT, token));
      expect(await rowExists(token)).toBe(false);

      // The same cookie again: the row is gone, the intent is already
      // satisfied, and an error here would show alarming text to somebody who
      // did the right thing.
      expectSignedOut(await post(SIGN_OUT, token));
      expect(await rowExists(token)).toBe(false);
    });

    it.each([
      ['no cookie at all', null],
      ['a cookie whose row never existed', unissuedToken()],
    ])('answers a sign-out with %s the same way', async (_case, token) => {
      expectSignedOut(await post(SIGN_OUT, token));
    });

    it('expires the cookie even when it found no session, so a stale token is dropped', async () => {
      const response = await post(SIGN_OUT, unissuedToken());

      // The browser is told to drop whatever it holds whether or not the server
      // found a row: the two states are indistinguishable to the person, and
      // leaving a dead cookie in place makes every later request present it.
      expect(setCookie(response)).toContain('Max-Age=0');
    });
  });

  describe('POST /api/account/sessions/all', () => {
    it('ends every session the account holds, including the one that asked', async () => {
      const id = await clearSessions(READER);

      const laptop = tokenOf((await issue(id)).value);
      const phone = tokenOf((await issue(id)).value);
      const tablet = tokenOf((await issue(id)).value);

      expect(await sessionCount(READER)).toBe(3);

      expectSignedOut(await post(SESSIONS_ALL, laptop));

      expect(await sessionCount(READER)).toBe(0);
      expect(await resolveSession(phone)).toBeNull();
      expect(await resolveSession(tablet)).toBeNull();
    });

    it('records one session.invalidate_all, with the account as both actor and subject', async () => {
      const id = await freshActiveAccount();
      const token = tokenOf((await issue(id)).value);

      try {
        await post(SESSIONS_ALL, token);

        // Ending every session is a privileged act and is audited (`SEC-R04`),
        // unlike an ordinary sign-out. The actor is the account itself: this is
        // the self-service path, not an admin acting on somebody else.
        const trail = await auditFor(id);
        expect(trail).toHaveLength(1);
        expect(trail[0]?.action).toBe('session.invalidate_all');
        expect(trail[0]?.actor_id).toBe(id);
        expect(trail[0]?.subject_id).toBe(id);
        expect(trail[0]?.subject_type).toBe('account');
      } finally {
        await getDb().deleteFrom('accounts').where('id', '=', id).execute();
      }
    });

    it('ends no other account, however many sessions it holds', async () => {
      const mine = await onlySessionFor(READER);
      const theirs = await onlySessionFor(OTHER);

      await post(SESSIONS_ALL, mine);

      expect(await sessionCount(READER)).toBe(0);
      expect(await rowExists(theirs)).toBe(true);
      expect(await resolveSession(theirs)).not.toBeNull();
    });

    it.each([
      ['no cookie at all', null],
      ['a cookie whose row never existed', unissuedToken()],
    ])('redirects with %s rather than raising: there is nothing to end', async (_case, token) => {
      expectSignedOut(await post(SESSIONS_ALL, token));
    });

    it('ends nothing for an expired session, which proves nothing about the account', async () => {
      const id = await clearSessions(READER);

      const stale = tokenOf((await issue(id)).value);
      const live = tokenOf((await issue(id)).value);

      await getDb()
        .updateTable('sessions')
        .set({ expires_at: sql<Date>`now() - interval '1 minute'` })
        .where('token_hash', '=', hashOf(stale))
        .execute();

      // A cookie that no longer authenticates cannot end an account's sessions:
      // the delete is account-wide, and the resolution is what authorises it.
      expectSignedOut(await post(SESSIONS_ALL, stale));

      expect(await rowExists(live)).toBe(true);
      expect(await resolveSession(live)).not.toBeNull();
    });

    it('ends nothing for a suspended account, whose sessions the gate already refuses', async () => {
      const id = await clearSessions(OTHER);

      const token = tokenOf((await issue(id)).value);
      await getDb()
        .updateTable('accounts')
        .set({ state: 'suspended' })
        .where('id', '=', id)
        .execute();

      expectSignedOut(await post(SESSIONS_ALL, token));

      expect(await sessionCount(OTHER)).toBe(1);

      await getDb().updateTable('accounts').set({ state: 'active' }).where('id', '=', id).execute();
    });
  });

  describe('the invalidation functions ADMIN-001 will share', () => {
    it('invalidateSession deletes by the token hash and never by the token itself', async () => {
      const token = await onlySessionFor(READER);

      await invalidateSession(token);

      expect(await rowExists(token)).toBe(false);
    });

    it('invalidateSession succeeds against a token no row holds', async () => {
      // Idempotence at the store rather than only at the route: ADMIN-001 calls
      // this too, and a throw here would surface as a failed suspension.
      await expect(invalidateSession(unissuedToken())).resolves.toBeUndefined();
    });

    it('invalidateAllForAccount deletes that account and no other', async () => {
      const id = await clearSessions(READER);
      await issue(id);
      await issue(id);

      const theirs = await onlySessionFor(OTHER);

      await invalidateAllForAccount(id);

      expect(await sessionCount(READER)).toBe(0);
      expect(await rowExists(theirs)).toBe(true);
    });

    it('invalidateAllForAccount succeeds for an account holding no sessions', async () => {
      const id = await clearSessions(READER);

      await expect(invalidateAllForAccount(id)).resolves.toBeUndefined();
    });
  });

  describe('resolving to end, not to extend, and failing safe when the delete does not run', () => {
    it('accountForToken returns the account without sliding its expiry', async () => {
      const id = await clearSessions(READER);
      const token = tokenOf((await issue(id)).value);

      // Move the expiry somewhere a slide would visibly change: resolveSession
      // pushes it to now+TTL, accountForToken must leave it exactly here. This is
      // why the bulk path reads the account rather than resolving it -- a slide
      // before a delete that fails would extend the session it meant to end.
      await getDb()
        .updateTable('sessions')
        .set({ expires_at: sql<Date>`now() + interval '10 minutes'` })
        .where('token_hash', '=', hashOf(token))
        .execute();
      const before = await expiresAt(token);

      expect(await accountForToken(token)).not.toBeNull();
      expect(await expiresAt(token)).toEqual(before);
    });

    it('POST /api/auth/sign-out does not swallow a failed delete, so no cookie is set', async () => {
      const token = await onlySessionFor(READER);

      // The delete raises. The route does not catch it, so the promise rejects and
      // signedOut() -- the only thing that emits a Set-Cookie -- is never reached.
      // A try/catch here would answer 303 with an expiring cookie over a live row,
      // which is the one outcome AUTH-004 exists to prevent; this pins against it.
      const spy = vi.spyOn(sessionModule, 'invalidateSession').mockRejectedValue(new Error('delete refused'));
      try {
        await expect(post(SIGN_OUT, token)).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }

      // The real row was never touched -- the caller keeps a cookie that still
      // matches a live session, which is the truth rather than a false all-clear.
      expect(await rowExists(token)).toBe(true);
    });

    it('rolls the delete back when the audit cannot be written, leaving the session unslid', async () => {
      const id = await clearSessions(READER);
      const token = tokenOf((await issue(id)).value);
      // Set the expiry where a slide would show: accountForToken leaves it, a
      // sliding resolve would push it to now+TTL before the write failed.
      await getDb()
        .updateTable('sessions')
        .set({ expires_at: sql<Date>`now() + interval '10 minutes'` })
        .where('token_hash', '=', hashOf(token))
        .execute();
      const before = await expiresAt(token);

      // accountForToken resolves (no slide); inside the transaction the delete
      // runs and then the audit insert raises. SEC-R04's atomicity is the
      // property under test: the delete must roll back with the audit, so the
      // session is present and at its original expiry — not ended by an act the
      // trail never recorded, and not slid.
      const spy = vi
        .spyOn(auditModule, 'recordAudit')
        .mockRejectedValue(new Error('audit refused'));
      try {
        await expect(post(SESSIONS_ALL, token)).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }

      expect(await rowExists(token)).toBe(true);
      expect(await expiresAt(token)).toEqual(before);
    });
  });
});
