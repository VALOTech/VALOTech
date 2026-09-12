/**
 * The rate limit the set-password (acceptance) route carries (`SEC-001/T4`).
 *
 * `SEC-001` §3 limits invitation and reset acceptance per token, because a
 * single-use token brute-forced is an account. The limit is counted after the
 * weak-password refusal — which is a statement about the request and reveals no
 * token — and before the Argon2 hash and the consume, so a refused attempt costs
 * an attacker the hash and a legitimate accept, which is one valid password, is
 * never near it.
 *
 * The priming attempts reach `setPasswordWithToken`, which reads the database, so
 * the suite needs one: `DATABASE_URL` names it and pending migrations are applied.
 * The tokens are fresh random values that match no row, so each attempt answers
 * `409` until the token's own counter refuses it — nothing is seeded and nothing
 * is left behind.
 */

import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getConfig } from '../../../../config/index';
import { closeDb } from '../../../../db/index';
import { POST } from './route';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.AUTH_MAX_ATTEMPTS = '4';
process.env.AUTH_WINDOW_SECONDS = '900';

/** Long enough and not a common password, so `checkPassword` passes and the attempt reaches the limiter. */
const PASSWORD = 'a passphrase an investor would actually use';
const WEAK = 'short';

/** A fresh 32-byte base64url token, so each test spends its own counter. */
function freshToken(): string {
  return randomBytes(32).toString('base64url');
}

function accept(token: string, password: string): Promise<Response> {
  return POST(
    new Request('http://localhost:3100/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }),
  );
}

describe.skipIf(!HAS_DATABASE)('POST /api/auth/set-password — the per-token rate limit (SEC-001/T4)', () => {
  beforeAll(async () => {
    await runner({
      databaseUrl: DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
      advisoryLockMode: 'wait',
    });
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it('refuses a token after too many accepts, with 429 and a Retry-After within the window', async () => {
    const { maxAttempts, windowSeconds } = getConfig().auth;
    const token = freshToken();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // A fake token consumes nothing, so each allowed attempt is 409 rather
      // than 429 — the limit has not been reached yet.
      const response = await accept(token, PASSWORD);
      expect(response.status).toBe(409);
    }

    const refused = await accept(token, PASSWORD);

    expect(refused.status).toBe(429);
    expect(await refused.text()).toBe('{"error":"too_many_attempts"}');
    expect(refused.headers.getSetCookie()).toEqual([]);

    const retryAfter = Number(refused.headers.get('Retry-After'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(windowSeconds);
  }, 120_000);

  it('counts each token on its own key, so an exhausted token does not refuse another', async () => {
    const { maxAttempts } = getConfig().auth;
    const exhausted = freshToken();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await accept(exhausted, PASSWORD);
    }

    expect((await accept(exhausted, PASSWORD)).status).toBe(429);
    // A different token has spent nothing, so it is answered on its own merits.
    expect((await accept(freshToken(), PASSWORD)).status).toBe(409);
  }, 120_000);

  it('does not count a weak password, so a fumbled password is not a lockout', async () => {
    const { maxAttempts } = getConfig().auth;
    const token = freshToken();

    // A weak password is refused before the limiter, so it never spends the
    // token's allowance; more of them than the limit leaves the counter empty.
    for (let attempt = 1; attempt <= maxAttempts + 1; attempt += 1) {
      const response = await accept(token, WEAK);
      expect(response.status).toBe(400);
    }

    // The first valid attempt reaches the consume rather than the limit.
    expect((await accept(token, PASSWORD)).status).toBe(409);
  }, 120_000);
});
