/**
 * The sign-in route against a real PostgreSQL (`AUTH-001/T5`).
 *
 * The regression this file exists for is an oracle, and an oracle is a
 * comparison between two answers rather than a property of either: an unknown
 * address, a wrong password and an account that is not active have to agree in
 * status, in body and in cost. The first two are asserted byte for byte.
 *
 * The third is asserted as a floor under each arm rather than as a ratio
 * between them: two wall-clock readings on a loaded machine differ for reasons
 * that have nothing to do with the code, while one Argon2id verification and a
 * path that returned before performing one are an order of magnitude apart and
 * a floor separates those decisively. The floor is measured rather than
 * written down — the suite times a verification of its own and takes half of it
 * — because a literal generous enough for a slow machine is unreachable on a
 * fast one. And it is measured on a warm path, keeping the smallest of several
 * readings: the first request a process makes also opens the connection pool,
 * which costs 87 ms against a steady state of 30, and a reading carrying that
 * clears any floor whether or not the hash ran.
 *
 * It needs a database. `DATABASE_URL` names it, pending migrations are applied
 * to it, and it must be a development target: the suite writes accounts and
 * sessions and deletes them again.
 */

import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DUMMY_HASH, hashPassword, verifyPassword } from '../../../../auth/password';
import { getConfig } from '../../../../config/index';
import { closeDb, getDb } from '../../../../db/index';
import { POST } from './route';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'migrations',
);

const TTL_SECONDS = 43200;

/**
 * Above what any one key in this file is asked for, so the two limiter suites
 * exhaust the keys they mean to and no other test meets a boundary it was not
 * testing. Every boundary asserted below is read back through `getConfig`
 * rather than from this literal, so the test stands on the same value the route
 * stands on.
 */
const MAX_ATTEMPTS = 20;

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SESSION_TTL_SECONDS = String(TTL_SECONDS);
process.env.AUTH_MAX_ATTEMPTS = String(MAX_ATTEMPTS);
process.env.AUTH_WINDOW_SECONDS = '900';

const PASSWORD = 'a passphrase an investor would actually use';
const WRONG_PASSWORD = 'a passphrase an investor would actually usf';

const ACTIVE = 'active@example.test';
const SUSPENDED = 'suspended@example.test';
const INVITED = 'invited@example.test';
const LOCKED_OUT = 'locked-out@example.test';
const OLD_COST = 'old-cost@example.test';
const UNKNOWN = 'nobody@example.test';
const WARMUP = 'warmup@example.test';

const SEEDED = [ACTIVE, SUSPENDED, INVITED, LOCKED_OUT, OLD_COST];

/**
 * A real `@node-rs/argon2` encoding of `VECTOR_PASSWORD`, written at a cost
 * below the current configuration. It is a test vector rather than a
 * credential: no account outside this file holds it.
 */
const AT_THE_OLD_COST =
  '$argon2id$v=19$m=4096,t=1,p=1$414LJSlJ6yb56ncu3/NvAQ$NC6P1l+UwgtIlgBd/jxv/KRe+W5dFBg6pBE9EObPhm8';
// Long and distinctive on purpose: the rehash test asserts the new encoding
// does not contain the plaintext, and a two-character vector occurs in the
// random base64 of an Argon2 hash by chance about once in sixty runs — a
// distinctive one does not, so the check is the leak it means to catch.
const VECTOR_PASSWORD = 'RehashVectorPassword2026';

/** The head an encoding written at the current configuration carries. */
const CURRENT_HEAD = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/;

/**
 * The floor the measured cost of one Argon2id verification must itself clear,
 * so a hash that had stopped costing anything could not produce a floor every
 * arm passes vacuously. Every per-arm floor is derived from that measurement
 * rather than from a literal, because a literal generous enough for a slow
 * machine is unreachable on a fast one and vice versa.
 */
const ARGON2_FLOOR_MS = 10;

/** Readings per arm. The smallest is kept: noise only ever adds time. */
const TIMING_SAMPLES = 3;

/** 32 bytes, base64url, unpadded. */
const TOKEN_LENGTH = 43;

/**
 * The token half of a cookie value, split here rather than parsed by the code
 * under test: a hash assertion that read the token back through the verifier
 * would agree with itself whatever secret signed it.
 */
function tokenHalf(value: string): string {
  return value.slice(0, value.lastIndexOf('.'));
}

/** TEST-NET-1 (RFC 5737), one address per request, so no test shares a counter. */
let addresses = 0;

function nextAddress(): string {
  addresses += 1;

  return `192.0.2.${addresses}`;
}

function post(body: string, address: string): Promise<Response> {
  return POST(
    new Request('http://localhost:3100/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address },
      body,
    }),
  );
}

function signIn(
  email: string,
  password: string,
  address: string = nextAddress(),
): Promise<Response> {
  return post(JSON.stringify({ email, password }), address);
}

/** The one `Set-Cookie` a successful sign-in carries. */
function setCookie(response: Response): string {
  const cookies = response.headers.getSetCookie();

  expect(cookies).toHaveLength(1);

  return cookies[0] ?? '';
}

/** The token itself, read out of the header the browser would store. */
function cookieValue(header: string): string {
  const [pair = ''] = header.split(';');

  return pair.slice(pair.indexOf('=') + 1);
}

/**
 * Everything after the name and value. Asserted as a list rather than by
 * searching the header, because the token is base64url and can carry any
 * letters an attribute name is spelled with.
 */
function attributes(header: string): string[] {
  return header
    .split(';')
    .slice(1)
    .map((part) => part.trim());
}

async function accountId(email: string): Promise<string> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirstOrThrow();

  return account.id;
}

async function lastSignIn(email: string): Promise<Date | null> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('last_sign_in')
    .where('email', '=', email)
    .executeTakeFirstOrThrow();

  return account.last_sign_in;
}

async function setLastSignIn(email: string, at: Date | null): Promise<void> {
  await getDb().updateTable('accounts').set({ last_sign_in: at }).where('email', '=', email).execute();
}

/**
 * The database's clock, which is the one the stamp is taken from. The bounds
 * either side of a sign-in are read from it rather than from `Date.now()`, so a
 * container whose clock has drifted from the host's fails nothing here — the
 * assertion is about which statement wrote the value, not about whose clock is
 * right.
 */
async function databaseNow(): Promise<Date> {
  const { rows } = await sql<{ now: Date }>`select now()`.execute(getDb());
  const [first] = rows;

  if (first === undefined) {
    throw new Error('select now() returned no row');
  }

  return first.now;
}

async function elapsedMs(attempt: () => Promise<Response>): Promise<number> {
  const started = performance.now();
  const response = await attempt();
  const elapsed = performance.now() - started;

  expect(response.status).toBe(401);

  return elapsed;
}

/** The smallest of several readings, which is the closest one to the true cost. */
async function lowestMs(attempt: () => Promise<Response>): Promise<number> {
  const readings: number[] = [];

  for (let sample = 1; sample <= TIMING_SAMPLES; sample += 1) {
    readings.push(await elapsedMs(attempt));
  }

  return Math.min(...readings);
}

/** What one Argon2id verification costs on the machine running the suite. */
async function referenceHashMs(): Promise<number> {
  const readings: number[] = [];

  for (let sample = 1; sample <= TIMING_SAMPLES; sample += 1) {
    const started = performance.now();
    await verifyPassword(DUMMY_HASH, PASSWORD);
    readings.push(performance.now() - started);
  }

  return Math.min(...readings);
}

describe.skipIf(!HAS_DATABASE)('POST /api/auth/sign-in', () => {
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

    // One hash for every seeded account: they share a password, and Argon2id is
    // expensive on purpose.
    const encoded = await hashPassword(PASSWORD);

    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await getDb()
      .insertInto('accounts')
      .values([
        {
          email: ACTIVE,
          name: 'An Investor',
          role: 'investor',
          password_hash: encoded,
          state: 'active',
        },
        {
          email: SUSPENDED,
          name: 'A Suspended Investor',
          role: 'investor',
          password_hash: encoded,
          state: 'suspended',
        },
        {
          email: INVITED,
          name: 'An Invited Investor',
          role: 'investor',
          password_hash: null,
          state: 'invited',
        },
        {
          email: LOCKED_OUT,
          name: 'A Hammered Investor',
          role: 'investor',
          password_hash: encoded,
          state: 'active',
        },
        {
          email: OLD_COST,
          name: 'An Early Investor',
          role: 'investor',
          password_hash: AT_THE_OLD_COST,
          state: 'active',
        },
      ])
      .execute();
  }, 120_000);

  afterAll(async () => {
    // The sessions go with them: sessions.account_id is ON DELETE CASCADE.
    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await closeDb();
  });

  describe('a correct password', () => {
    it('answers 204 and sets a session cookie with the attributes AUTH-002 fixes', async () => {
      const response = await signIn(ACTIVE, PASSWORD);

      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');

      const header = setCookie(response);

      // Development serves plain HTTP, so the bare name and no Secure. The
      // __Host- prefix requires Secure, and a browser drops a __Host- cookie
      // sent without it — which looks exactly like a broken sign-in.
      expect(header.startsWith('valotech=')).toBe(true);
      expect(attributes(header)).toEqual([
        'Path=/',
        `Max-Age=${TTL_SECONDS}`,
        'SameSite=Lax',
        'HttpOnly',
      ]);
    });

    it('stores the hash of the token, never the token the browser holds', async () => {
      const id = await accountId(ACTIVE);
      await getDb().deleteFrom('sessions').where('account_id', '=', id).execute();

      const response = await signIn(ACTIVE, PASSWORD);
      const value = cookieValue(setCookie(response));
      const token = tokenHalf(value);

      // The browser holds the token and a signature over it; the row holds the
      // hash of the token alone, so no two of the three are the same string.
      expect(token).toHaveLength(TOKEN_LENGTH);
      expect(value).not.toBe(token);
      expect(value.startsWith(`${token}.`)).toBe(true);

      const sessions = await getDb()
        .selectFrom('sessions')
        .select(['token_hash', 'expires_at'])
        .where('account_id', '=', id)
        .execute();

      expect(sessions).toHaveLength(1);

      // Computed here rather than through the module that wrote it, so the two
      // sides of the assertion are independent: a token_hash produced by some
      // other function would still equal itself.
      const [session] = sessions;
      expect(session?.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(session?.token_hash).not.toBe(token);
    });

    it('writes a fresh row and a fresh token on each sign-in, so a planted cookie is replaced', async () => {
      const id = await accountId(ACTIVE);
      await getDb().deleteFrom('sessions').where('account_id', '=', id).execute();

      const first = cookieValue(setCookie(await signIn(ACTIVE, PASSWORD)));
      const second = cookieValue(setCookie(await signIn(ACTIVE, PASSWORD)));

      expect(second).not.toBe(first);

      const sessions = await getDb()
        .selectFrom('sessions')
        .select('token_hash')
        .where('account_id', '=', id)
        .execute();

      expect(sessions).toHaveLength(2);
      expect(new Set(sessions.map((session) => session.token_hash)).size).toBe(2);
    });

    it('replaces a hash written below the current cost, with a hash and not the plaintext', async () => {
      const response = await signIn(OLD_COST, VECTOR_PASSWORD);

      expect(response.status).toBe(204);

      const account = await getDb()
        .selectFrom('accounts')
        .select('password_hash')
        .where('email', '=', OLD_COST)
        .executeTakeFirstOrThrow();

      expect(account.password_hash).toMatch(CURRENT_HEAD);
      expect(account.password_hash).not.toBe(AT_THE_OLD_COST);
      expect(account.password_hash).not.toContain(VECTOR_PASSWORD);
    });
  });

  describe('the record of when somebody last signed in', () => {
    it('stamps last_sign_in from the database clock on the path that succeeded', async () => {
      // Cleared first, so the assertion is about this request rather than about
      // a stamp an earlier test left: a route that had stopped writing the
      // column would answer 204 and leave a null behind.
      await setLastSignIn(ACTIVE, null);

      const before = await databaseNow();
      const response = await signIn(ACTIVE, PASSWORD);
      const after = await databaseNow();

      expect(response.status).toBe(204);

      const stamped = await lastSignIn(ACTIVE);

      expect(stamped).not.toBeNull();
      // Inside the request, both ends: a stamp taken from the process's clock
      // rather than the database's would sit outside these bounds the moment
      // the two disagree, and one taken at some other time would too.
      expect(stamped?.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stamped?.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it.each([
      ['a wrong password', ACTIVE, WRONG_PASSWORD],
      ['a suspended account and the right password', SUSPENDED, PASSWORD],
      ['an invited account that has no password yet', INVITED, PASSWORD],
    ])('leaves it exactly as it was after %s', async (_case, email, password) => {
      // A refused attempt is not a sign-in. A column that moved here would name
      // whoever was guessing as the person who was last in the room, which is
      // the opposite of what an admin reads the list for.
      const untouched = new Date('2020-02-29T12:00:00.000Z');
      await setLastSignIn(email, untouched);

      const response = await signIn(email, password);

      expect(response.status).toBe(401);
      expect(await lastSignIn(email)).toEqual(untouched);
    });
  });

  describe('a failure', () => {
    it.each([
      ['an address no account holds', UNKNOWN, PASSWORD],
      ['a wrong password', ACTIVE, WRONG_PASSWORD],
      ['a suspended account and the right password', SUSPENDED, PASSWORD],
      ['an invited account that has no password yet', INVITED, PASSWORD],
    ])('is one answer for %s', async (_case, email, password) => {
      const response = await signIn(email, password);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('{"error":"invalid"}');
      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('leaves the four states indistinguishable in status and in body', async () => {
      const answers = await Promise.all(
        [
          signIn(UNKNOWN, PASSWORD),
          signIn(ACTIVE, WRONG_PASSWORD),
          signIn(SUSPENDED, PASSWORD),
          signIn(INVITED, PASSWORD),
        ].map(async (pending) => {
          const response = await pending;

          return `${response.status} ${await response.text()}`;
        }),
      );

      expect(new Set(answers).size).toBe(1);
    });

    it('writes no session for a suspended account', async () => {
      const id = await accountId(SUSPENDED);
      await getDb().deleteFrom('sessions').where('account_id', '=', id).execute();

      await signIn(SUSPENDED, PASSWORD);

      const sessions = await getDb()
        .selectFrom('sessions')
        .select('id')
        .where('account_id', '=', id)
        .execute();

      expect(sessions).toEqual([]);
    });

    it.each([
      ['not JSON', 'not json at all'],
      ['a JSON array', '[]'],
      ['a missing password', '{"email":"someone@example.test"}'],
      ['a password that is not a string', '{"email":"someone@example.test","password":123}'],
      ['an empty address', '{"email":"   ","password":"x"}'],
      [
        'an address past the RFC 5321 maximum',
        `{"email":"${'a'.repeat(250)}@example.test","password":"x"}`,
      ],
    ])(
      'answers 400 rather than 401 for %s, which states nothing about any account',
      async (_case, body) => {
        const response = await post(body, nextAddress());

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('{"error":"invalid_request"}');
      },
    );
  });

  describe('the cost of a failure', () => {
    it(
      'pays for a hash on every failing path, so none of them is an oracle by the clock',
      async () => {
        // The first request a process makes opens the connection pool as well
        // as hashing — measured at 87 ms against 30 ms once warm — and a
        // reading carrying that would clear any floor whether or not the hash
        // ran. Warm the path before measuring anything.
        await signIn(WARMUP, PASSWORD);

        const reference = await referenceHashMs();

        // The reference is held to an absolute floor of its own. Without it, a
        // verification that had stopped costing anything would lower the bar
        // for every arm and the assertions below would hold over a route that
        // hashes nothing at all.
        expect(reference).toBeGreaterThan(ARGON2_FLOOR_MS);

        const floor = reference / 2;
        const unknown = await lowestMs(() => signIn(UNKNOWN, PASSWORD));
        const wrong = await lowestMs(() => signIn(ACTIVE, WRONG_PASSWORD));
        const suspended = await lowestMs(() => signIn(SUSPENDED, PASSWORD));
        // The invited account holds a null password_hash. Its own arm exists
        // because the fix that closed the null oracle lives in verifyPassword,
        // and a future short circuit that skipped it for a null hash would show
        // up here and nowhere else -- the invited accounts are the ones an
        // attacker most wants to enumerate.
        const invited = await lowestMs(() => signIn(INVITED, PASSWORD));

        // Each arm separately: a short circuit anywhere shows up as one arm
        // below the floor, and asserting them together would let a fast arm
        // hide behind a slow one. Half the reference is the boundary because a
        // path that skips the hash costs one indexed read, which is an order of
        // magnitude less than that.
        expect(unknown).toBeGreaterThan(floor);
        expect(wrong).toBeGreaterThan(floor);
        expect(suspended).toBeGreaterThan(floor);
        expect(invited).toBeGreaterThan(floor);
      },
      60_000,
    );
  });

  describe('the rate limit', () => {
    it(
      'refuses by account, so an attacker cannot walk the list from many addresses',
      async () => {
        const { maxAttempts, windowSeconds } = getConfig().auth;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const response = await signIn(LOCKED_OUT, WRONG_PASSWORD, nextAddress());

          expect(response.status).toBe(401);
        }

        // The right password, from an address that has spent nothing. A limiter
        // consulted after authentication rather than before it would answer 204
        // here, which is the shape this asserts against.
        const refused = await signIn(LOCKED_OUT, PASSWORD, nextAddress());

        expect(refused.status).toBe(429);
        expect(await refused.text()).toBe('{"error":"too_many_attempts"}');
        expect(refused.headers.getSetCookie()).toEqual([]);

        const retryAfter = Number(refused.headers.get('Retry-After'));
        expect(Number.isInteger(retryAfter)).toBe(true);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(windowSeconds);
      },
      120_000,
    );

    it(
      'refuses by address, so an attacker cannot walk the list from one machine',
      async () => {
        const { maxAttempts } = getConfig().auth;
        const address = nextAddress();

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          // A different account each time, so nothing but the address counter
          // can be what refuses the attempt after this loop.
          const response = await signIn(`sprayed-${attempt}@example.test`, PASSWORD, address);

          expect(response.status).toBe(401);
        }

        const refused = await signIn('sprayed-last@example.test', PASSWORD, address);

        expect(refused.status).toBe(429);
        expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
      },
      120_000,
    );
  });

  describe('the request origin and the address key', () => {
    it('refuses a cross-origin POST before anything else, closing login CSRF', async () => {
      const response = await POST(
        new Request('http://localhost:3100/api/auth/sign-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            Origin: 'https://evil.example',
            'X-Forwarded-For': nextAddress(),
          },
          body: JSON.stringify({ email: ACTIVE, password: PASSWORD }),
        }),
      );

      expect(response.status).toBe(403);
    });

    it('signs a reader in from the application origin', async () => {
      const response = await POST(
        new Request('http://localhost:3100/api/auth/sign-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3100',
            'X-Forwarded-For': nextAddress(),
          },
          body: JSON.stringify({ email: ACTIVE, password: PASSWORD }),
        }),
      );

      expect(response.status).toBe(204);
    });

    it('collapses an over-long forwarded address to one bucket, so it cannot mint unbounded keys', async () => {
      const { maxAttempts } = getConfig().auth;
      let refused = false;

      // Each request forges a distinct, over-long X-Forwarded-For. Distinct
      // addresses that did NOT collapse would each get their own counter and
      // never refuse; a refusal proves the over-long values share one bucket.
      for (let attempt = 1; attempt <= maxAttempts + 2 && !refused; attempt += 1) {
        const response = await post(
          JSON.stringify({ email: `oversized-${attempt}@example.test`, password: PASSWORD }),
          `${'a'.repeat(60)}-${attempt}`,
        );
        refused = response.status === 429;
      }

      expect(refused).toBe(true);
    }, 120_000);
  });
});
