/**
 * The role gate against a real PostgreSQL (`AUTH-002/T3`).
 *
 * Every assertion here is about a refusal, because the gate's failures are the
 * ones that matter: a session that should have died still resolving, an expired
 * row slid forward by the request that should have rejected it, a suspended
 * account still holding a working cookie, an investor learning that the admin
 * console exists. Each is checked against the row the database actually holds
 * rather than against what the gate reported doing.
 *
 * The hash the suite computes is its own, not `session.ts`'s. A token_hash
 * written by some other function would still equal itself, so the two sides of
 * the assertion are kept independent.
 *
 * It needs a database. `DATABASE_URL` names it, pending migrations are applied
 * to it, and it must be a development target: the suite writes accounts and
 * sessions and deletes them again.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getConfig } from '../config/index';
import { closeDb, getDb } from '../db/index';
import { type Actor, requireAdmin, requireInvestor, resolveSession } from './gate';
import { hashPassword } from './password';
import { issue, sessionCookieName, signToken, tokenOfCookie } from './session';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

/**
 * An hour, which is not the default. The slid expiry is asserted against the
 * configured value read back through `getConfig`, so a suite that agreed with
 * the gate only because both were reading 43200 would not agree here.
 */
const TTL_SECONDS = 3600;

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SESSION_TTL_SECONDS = String(TTL_SECONDS);

const INVESTOR = 'gate-investor@example.test';
const ADMIN = 'gate-admin@example.test';
const OTHER = 'gate-other@example.test';
const SUSPENDABLE = 'gate-suspendable@example.test';

const SEEDED = [INVESTOR, ADMIN, OTHER, SUSPENDABLE];

const PASSWORD = 'a passphrase an investor would actually use';

/** Long enough to be resolved several times over without expiring. */
const LIVE = '10 minutes';

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A token of the shape `issue()` mints, for a session that was never written. */
function unissuedToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The signature this server puts on a token, read back from its own cookie. */
function signatureOf(token: string): string {
  return signToken(token).slice(token.length + 1);
}

/**
 * A signature over the same token under a different secret — which is what
 * every live cookie becomes the moment `SESSION_SECRET` is rotated. Computed
 * here rather than by changing the environment, because the configuration is
 * read once per process and a test cannot rotate it back.
 */
function foreignSignature(token: string): string {
  return createHmac('sha256', 'a secret this server never held')
    .update(token)
    .digest('base64url');
}

function request(cookie: string | null): Request {
  const headers = new Headers();

  if (cookie !== null) {
    headers.set('Cookie', cookie);
  }

  return new Request('http://localhost:3100/room', { headers });
}

/** A request presenting a token the way a browser holds it: signed. */
function presenting(token: string): Request {
  return request(`${sessionCookieName()}=${signToken(token)}`);
}

/** A request presenting a cookie value verbatim, for the ones nothing signed. */
function presentingRaw(value: string): Request {
  return request(`${sessionCookieName()}=${value}`);
}

/** The actor an answer carries, or a failure naming what came back instead. */
function actorOf(answer: Actor | Response): Actor {
  if (answer instanceof Response) {
    throw new Error(`expected an actor, got a ${answer.status} response`);
  }

  return answer;
}

/** The response an answer carries, or a failure naming the actor it let through. */
function responseOf(answer: Actor | Response): Response {
  if (!(answer instanceof Response)) {
    throw new Error(`expected a refusal, got the actor ${answer.id}`);
  }

  return answer;
}

async function accountId(email: string): Promise<string> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirstOrThrow();

  return account.id;
}

interface SessionRow {
  readonly last_seen_at: Date;
  readonly expires_at: Date;
}

async function sessionRow(token: string): Promise<SessionRow> {
  return getDb()
    .selectFrom('sessions')
    .select(['last_seen_at', 'expires_at'])
    .where('token_hash', '=', hashOf(token))
    .executeTakeFirstOrThrow();
}

/**
 * A session row written directly, at offsets from the database's own clock, so
 * the test can place it either side of the expiry the gate checks and no skew
 * between this process and the server can move it. `issue()` writes a live
 * session and cannot write a stale or an expired one.
 */
async function writeSession(email: string, lastSeen: string, expires: string): Promise<string> {
  const token = unissuedToken();

  await getDb()
    .insertInto('sessions')
    .values({
      account_id: await accountId(email),
      token_hash: hashOf(token),
      last_seen_at: sql<Date>`now() + cast(${lastSeen} as interval)`,
      expires_at: sql<Date>`now() + cast(${expires} as interval)`,
    })
    .execute();

  return token;
}

/** The token a real sign-in would have put in the reader's browser. */
/**
 * The token of a fresh session for an account.
 *
 * The token rather than the cookie value, because the store takes one and the
 * cookie carries it beside a signature. `presenting` puts the signature back.
 */
async function issuedFor(email: string): Promise<string> {
  const cookie = await issue(await accountId(email));
  const carried = tokenOfCookie(cookie.value);

  if (carried === null) {
    throw new Error('issue() minted a cookie the gate cannot read');
  }

  return carried;
}

/** Every shape of request that carries no session the gate can resolve. */
const REFUSED: Array<[string, () => Request]> = [
  ['no cookie header', () => request(null)],
  ['a cookie of some other name', () => request(`other=${unissuedToken()}`)],
  ['an empty cookie value', () => request(`${sessionCookieName()}=`)],
  ['a token that is not base64url at all', () => presentingRaw('not a token')],
  // Signed, so the refusal is the row lookup's and not the signature's: the
  // two reasons a token is refused are tested one at a time.
  ['a correctly signed token no row holds', () => presenting(unissuedToken())],
  ['a token carrying no signature at all', () => presentingRaw(unissuedToken())],
  [
    'a signature that is not over this token',
    () => presentingRaw(`${unissuedToken()}.${signatureOf(unissuedToken())}`),
  ],
  [
    'a signature from another secret',
    () => presentingRaw(`${unissuedToken()}.${foreignSignature(unissuedToken())}`),
  ],
];

describe.skipIf(!HAS_DATABASE)('the role gate', () => {
  beforeAll(async () => {
    await runner({
      databaseUrl: DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
      // Test files run in parallel and every database-backed one applies the
      // pending migrations, so two of them reach the migrator's advisory lock
      // at once. The default mode fails the loser; waiting for the lock makes
      // the second run find nothing pending, which is the answer both wanted.
      advisoryLockMode: 'wait',
    });

    // One hash for four accounts: they share a password and Argon2id is
    // expensive on purpose. An active account holds a real one, so no row here
    // is in a state the product cannot produce.
    const encoded = await hashPassword(PASSWORD);

    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await getDb()
      .insertInto('accounts')
      .values([
        { email: INVESTOR, name: 'An Investor', role: 'investor', password_hash: encoded, state: 'active' },
        { email: ADMIN, name: 'An Admin', role: 'admin', password_hash: encoded, state: 'active' },
        { email: OTHER, name: 'Another Investor', role: 'investor', password_hash: encoded, state: 'active' },
        { email: SUSPENDABLE, name: 'A Third Investor', role: 'investor', password_hash: encoded, state: 'active' },
      ])
      .execute();
  }, 120_000);

  afterAll(async () => {
    // The sessions go with them: sessions.account_id is ON DELETE CASCADE.
    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await closeDb();
  });

  describe('a live session', () => {
    it('resolves an active investor to their own id and role', async () => {
      const token = await issuedFor(INVESTOR);

      expect(await resolveSession(token)).toEqual({
        id: await accountId(INVESTOR),
        role: 'investor',
      });
    });

    it('lets an investor into a room surface', async () => {
      const answer = await requireInvestor(presenting(await issuedFor(INVESTOR)));

      expect(actorOf(answer)).toEqual({ id: await accountId(INVESTOR), role: 'investor' });
    });

    it('lets an admin into both, because an admin may read what an investor may', async () => {
      const token = await issuedFor(ADMIN);
      const expected = { id: await accountId(ADMIN), role: 'admin' };

      expect(actorOf(await requireInvestor(presenting(token)))).toEqual(expected);
      expect(actorOf(await requireAdmin(presenting(token)))).toEqual(expected);
    });

    it('resolves each reader to their own account and never to the other', async () => {
      const mine = await issuedFor(INVESTOR);
      const theirs = await issuedFor(OTHER);

      const resolvedMine = actorOf(await requireInvestor(presenting(mine)));
      const resolvedTheirs = actorOf(await requireInvestor(presenting(theirs)));

      expect(resolvedMine.id).toBe(await accountId(INVESTOR));
      expect(resolvedTheirs.id).toBe(await accountId(OTHER));
      expect(resolvedMine.id).not.toBe(resolvedTheirs.id);
    });

    it('finds the session cookie behind another cookie in the header', async () => {
      const token = await issuedFor(INVESTOR);

      const answer = await requireInvestor(
        request(`theme=dark; ${sessionCookieName()}=${signToken(token)}`),
      );

      expect(actorOf(answer).role).toBe('investor');
    });

    it('answers a caller that holds headers and no request, which is what a page holds', async () => {
      const headers = new Headers({
        Cookie: `${sessionCookieName()}=${signToken(await issuedFor(ADMIN))}`,
      });

      expect(actorOf(await requireAdmin({ headers })).role).toBe('admin');
    });
  });

  describe('an admin surface', () => {
    it('answers an investor 404 — not 403, which would confirm the console exists', async () => {
      const response = responseOf(await requireAdmin(presenting(await issuedFor(INVESTOR))));

      expect(response.status).toBe(404);
      expect(response.status).not.toBe(403);
      expect(response.headers.get('Location')).toBeNull();
      // Heuristically cacheable without this, and the answer belongs to the
      // reader rather than to the path (RFC 9110 §15.5.5).
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('sends a reader with no session to the form, as every gated path does', async () => {
      const response = responseOf(await requireAdmin(request(null)));

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in');
    });
  });

  describe('a request with no live session', () => {
    it('resolves nothing when no token is presented at all', async () => {
      expect(await resolveSession(null)).toBeNull();
    });

    it.each(REFUSED)('is sent to the form for %s', async (_case, build) => {
      const response = responseOf(await requireInvestor(build()));

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).toBe('');
    });

    it('refuses a live session presented without its signature', async () => {
      // The discriminating case. Every other refusal above would also happen
      // if nothing checked the signature at all — an unsigned value simply
      // hashes to nothing any row holds. This token's row exists, so the only
      // thing that can turn it away is the check, and a build that dropped the
      // check would authenticate this request.
      const carried = await issuedFor(INVESTOR);

      expect(await resolveSession(carried)).not.toBeNull();

      const answer = await requireInvestor(presentingRaw(carried));

      expect(responseOf(answer).status).toBe(303);
    });

    it('ignores a live token presented under another cookie name', async () => {
      const token = await issuedFor(INVESTOR);

      // The value resolves; only the name it arrives under is wrong. A parser
      // that read the first pair whatever it was called would authenticate a
      // token planted in any other cookie the reader carries.
      expect(responseOf(await requireInvestor(request(`other=${token}`))).status).toBe(303);
      expect(actorOf(await requireInvestor(presenting(token))).role).toBe('investor');
    });

    it('refuses the stored hash presented as the token, which is what a dump holds', async () => {
      const token = await issuedFor(INVESTOR);

      // The row holds sha256(token). Presenting that value must resolve to
      // nothing: the gate hashes what it is given, so the database's own copy
      // is not a credential.
      expect(await resolveSession(hashOf(token))).toBeNull();
      expect(await resolveSession(token)).not.toBeNull();
    });
  });

  describe('an expired session', () => {
    it('resolves to nobody, and the request does not slide it forward', async () => {
      const token = await writeSession(INVESTOR, '-10 minutes', '-1 minute');
      const before = await sessionRow(token);

      expect(await resolveSession(token)).toBeNull();

      const after = await sessionRow(token);

      // The predicate that admits a session is the same one that authorises the
      // update, so an expired row is not touched by the request that read it.
      expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
      expect(after.last_seen_at.getTime()).toBe(before.last_seen_at.getTime());
    });

    it('sends the reader holding it to the form', async () => {
      const token = await writeSession(INVESTOR, '-10 minutes', '-1 second');

      expect(responseOf(await requireInvestor(presenting(token))).status).toBe(303);
    });
  });

  describe('a suspended account', () => {
    it('makes a cookie that worked a moment ago resolve to nothing', async () => {
      const token = await issuedFor(SUSPENDABLE);

      expect(await resolveSession(token)).not.toBeNull();

      await getDb()
        .updateTable('accounts')
        .set({ state: 'suspended' })
        .where('email', '=', SUSPENDABLE)
        .execute();

      expect(await resolveSession(token)).toBeNull();
      expect(responseOf(await requireInvestor(presenting(token))).status).toBe(303);

      // The row is still there: a suspension is enforced at the read, and
      // deleting the sessions is the privilege-change path's own work.
      const rows = await getDb()
        .selectFrom('sessions')
        .select('id')
        .where('token_hash', '=', hashOf(token))
        .execute();

      expect(rows).toHaveLength(1);
    });
  });

  describe('the sliding expiry', () => {
    it('moves last_seen_at and expires_at forward by a resolve', async () => {
      const token = await writeSession(INVESTOR, '-10 minutes', '60 seconds');
      const before = await sessionRow(token);

      expect(await resolveSession(token)).not.toBeNull();

      const after = await sessionRow(token);

      expect(after.last_seen_at.getTime()).toBeGreaterThan(before.last_seen_at.getTime());
      expect(after.expires_at.getTime()).toBeGreaterThan(before.expires_at.getTime());

      // Both columns are written from one now() in one statement, so their
      // difference is the configured lifetime exactly and carries no clock skew
      // between this process and the database.
      const lifetime = after.expires_at.getTime() - after.last_seen_at.getTime();
      expect(lifetime).toBe(getConfig().session.ttlSeconds * 1000);
    });

    it('holds under concurrent requests presenting one token', async () => {
      const token = await writeSession(INVESTOR, '-10 minutes', LIVE);
      const id = await accountId(INVESTOR);

      const answers = await Promise.all(
        Array.from({ length: 8 }, () => requireInvestor(presenting(token))),
      );

      for (const answer of answers) {
        expect(actorOf(answer)).toEqual({ id, role: 'investor' });
      }

      // Sliding is an UPDATE of one row, so concurrency must leave one row
      // holding one lifetime rather than eight writes racing into a longer one.
      const rows = await getDb()
        .selectFrom('sessions')
        .select(['last_seen_at', 'expires_at'])
        .where('token_hash', '=', hashOf(token))
        .execute();

      expect(rows).toHaveLength(1);

      const [row] = rows;

      if (row === undefined) {
        throw new Error('the session row the eight requests shared is gone');
      }

      expect(row.expires_at.getTime() - row.last_seen_at.getTime()).toBe(
        getConfig().session.ttlSeconds * 1000,
      );
    });
  });
});
