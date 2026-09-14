/**
 * `POST /api/auth/forgot` (`SEC-001/T4`, `AUTH-DEC-05`).
 *
 * The whole surface exists to answer the same thing for an address an account
 * holds and one it does not, so almost every test here is a comparison between
 * those two rather than an assertion about one of them. A test that only checked
 * the known address would pass just as well for a route that answered `404` to
 * the unknown one.
 *
 * **The load-bearing test is that the answer does not wait for the message.** It
 * is the one property nothing else can observe and the one whose absence would
 * hand over the enumeration oracle with no code looking wrong: a send takes a
 * network round trip, so a route that awaited it would answer slowly for an
 * address that exists and quickly for one that does not. It is asserted by racing
 * the answer against a delivery held open, rather than by waiting for a timeout —
 * a timeout would also "fail" for a route that crashed.
 *
 * On a database of its own, because the rate-limit counters are this process's
 * and the accounts are this suite's.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDb, getDb } from '../../../../db/index';
import type { Deliver } from '../../../../mail/transactional';

import { handleForgot } from './handler';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_auth_forgot';

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
// Small enough that a test can reach the limit in a handful of requests, and
// long enough that reaching it once holds for the rest of the test.
process.env.AUTH_MAX_ATTEMPTS = '4';
process.env.AUTH_WINDOW_SECONDS = '900';

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
 * A delivery that records what it was asked to send and accepts it.
 *
 * `first` resolves when a message has actually been handed over, and every
 * assertion about what was sent waits on it. That is not ceremony: the handler
 * deliberately does not await the send, so reading `sent` the moment it returns
 * is reading it before anything has happened. A test that passed without this
 * would be passing on whether the microtask queue happened to drain, which is
 * the kind of green that turns red on a different machine.
 */
function recording(): Deliver & { readonly sent: { to: string }[]; readonly first: Promise<void> } {
  const sent: { to: string }[] = [];
  let handed = (): void => {};
  const first = new Promise<void>((resolve) => {
    handed = resolve;
  });
  const deliver = async (addressee: { email: string }): Promise<{ state: 'accepted' }> => {
    sent.push({ to: addressee.email });
    handed();
    return { state: 'accepted' };
  };

  return Object.assign(deliver as Deliver, { sent, first });
}

describe.skipIf(!HAS_DATABASE)('POST /api/auth/forgot (SEC-001/T4)', () => {
  /** An active account with a password, which is what somebody asking for a reset is. */
  async function activeAccount(): Promise<string> {
    const email = `forgot-${randomUUID()}@example.test`;
    await getDb()
      .insertInto('accounts')
      .values({
        email,
        name: 'A Forgetful Investor',
        role: 'investor',
        state: 'active',
        password_hash: 'not-a-real-hash-and-never-verified-here',
      })
      .execute();
    return email;
  }

  /** An address no account holds — the half of `SEC-R03` that must be indistinguishable. */
  function unknownAddress(): string {
    return `forgot-nobody-${randomUUID()}@example.test`;
  }

  /**
   * One request, from its own client address unless the caller names one.
   *
   * The limiter is a process singleton and its per-address counter is shared by
   * every request that arrives without a forwarded address — so tests that are
   * not about the limit give each request a distinct address, and the two that
   * are about it pin one deliberately. Without this the fifth test in the file
   * is refused by the four before it, which looks exactly like the route being
   * wrong.
   */
  let nextClient = 0;
  function ask(email: string, headers: Record<string, string> = {}): Request {
    nextClient += 1;
    return new Request(`${ORIGIN}/api/auth/forgot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: ORIGIN,
        'x-forwarded-for': `198.51.100.${nextClient % 250}`,
        ...headers,
      },
      body: JSON.stringify({ email }),
    });
  }

  /** Everything a caller can see of one answer, so two of them can be compared whole. */
  async function readable(response: Response) {
    return {
      status: response.status,
      body: await response.text(),
      headers: [...response.headers].filter(([name]) => name !== 'x-request-id').sort(),
    };
  }

  beforeAll(async () => {
    await recreateIsolatedDatabase();
    await runner({
      databaseUrl: ISOLATED_DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      verbose: false,
    });
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  describe('the answer says nothing about the address', () => {
    it('answers identically for an address an account holds and one it does not', async () => {
      const deliver = recording();
      const known = await handleForgot(ask(await activeAccount()), deliver);
      const unknown = await handleForgot(ask(unknownAddress()), deliver);

      expect(await readable(known)).toEqual(await readable(unknown));
      expect(known.status).toBe(204);

      // The one difference the design allows, and it goes to an inbox the
      // requester may not control rather than into the answer.
      await deliver.first;
      expect(deliver.sent).toHaveLength(1);
    });

    it('writes a token for the account that exists and none for the address that does not', async () => {
      const email = await activeAccount();
      const before = await getDb()
        .selectFrom('invitations')
        .select(({ fn }) => fn.countAll().as('n'))
        .executeTakeFirstOrThrow();

      await handleForgot(ask(unknownAddress()), recording());
      const afterUnknown = await getDb()
        .selectFrom('invitations')
        .select(({ fn }) => fn.countAll().as('n'))
        .executeTakeFirstOrThrow();
      expect(afterUnknown.n).toEqual(before.n);

      await handleForgot(ask(email), recording());
      const afterKnown = await getDb()
        .selectFrom('invitations')
        .select(({ fn }) => fn.countAll().as('n'))
        .executeTakeFirstOrThrow();
      expect(Number(afterKnown.n)).toBe(Number(before.n) + 1);
    });

    it('sends the link to the address that asked, and to nobody else', async () => {
      const email = await activeAccount();
      const deliver = recording();

      await handleForgot(ask(email), deliver);
      await deliver.first;

      expect(deliver.sent).toEqual([{ to: email }]);
    });
  });

  describe('the answer does not wait for the message', () => {
    it('returns before a delivery that has not finished', async () => {
      const email = await activeAccount();
      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const slow: Deliver = async () => {
        await held;
        return { state: 'accepted' };
      };

      // Raced rather than awaited with a timeout: a route that awaited the send
      // would resolve as `waited` here and fail on an assertion, where a bare
      // timeout would report the same failure for a route that had crashed.
      const answered = await Promise.race([
        handleForgot(ask(email), slow),
        new Promise<'waited'>((resolve) => {
          setTimeout(() => resolve('waited'), 1_000);
        }),
      ]);

      expect(answered).not.toBe('waited');
      expect((answered as Response).status).toBe(204);

      release();
      await held;
    });

    it('answers in the same envelope whether or not there is a message to send', async () => {
      const email = await activeAccount();
      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const slow: Deliver = async () => {
        await held;
        return { state: 'accepted' };
      };

      // The known address has a message held open behind it and the unknown one
      // has nothing to send at all. If the answer waited, these two would differ
      // by the whole length of a send; because it does not, they do not.
      const startKnown = performance.now();
      await handleForgot(ask(email), slow);
      const knownMs = performance.now() - startKnown;

      const startUnknown = performance.now();
      await handleForgot(ask(unknownAddress()), slow);
      const unknownMs = performance.now() - startUnknown;

      expect(Math.abs(knownMs - unknownMs)).toBeLessThan(500);

      release();
      await held;
    });
  });

  describe('when no message can be sent at all', () => {
    it('records that nothing was attempted, so an inert public surface is not silent', async () => {
      const email = await activeAccount();
      const lines: string[] = [];
      const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array): boolean => {
          lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
          return true;
        });

      let attempted = (): void => {};
      const seen = new Promise<void>((resolve) => {
        attempted = resolve;
      });

      try {
        // `unavailable` RESOLVES -- it is not a rejection -- so a `.catch` alone
        // would let it pass unremarked. With no credential this is the only
        // branch reachable, and the person was just told a link is on its way.
        const response = await handleForgot(ask(email), async () => {
          attempted();
          return { state: 'unavailable', reason: 'SMTP_URL is not set' };
        });
        expect(response.status).toBe(204);
        await seen;
        // A macrotask boundary, which drains the whole microtask queue: the
        // chain from the delivery returning to the `then` that inspects its
        // outcome is several turns long, and counting them would be a test
        // pinned to the shape of the implementation rather than to what it does.
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      } finally {
        write.mockRestore();
      }

      const written = lines.join('');
      expect(written).toContain('mail.unavailable');
      // No address in it, ever (`DATA-R02`).
      expect(written).not.toContain(email);
    });
  });

  describe('the rate limit', () => {
    it('refuses after the limit, identically for a known and an unknown address', async () => {
      const email = await activeAccount();
      const deliver = recording();

      const client = { 'x-forwarded-for': '203.0.113.7' };

      for (let attempt = 0; attempt < 4; attempt += 1) {
        expect((await handleForgot(ask(email, client), deliver)).status).toBe(204);
      }

      const refusedKnown = await handleForgot(ask(email, client), deliver);
      expect(refusedKnown.status).toBe(429);
      expect(Number(refusedKnown.headers.get('Retry-After'))).toBeGreaterThan(0);

      // An address no account holds, from the same client. Its own account
      // counter is untouched, so the per-address counter is what refuses it —
      // and it refuses it with the same answer, byte for byte.
      const refusedUnknown = await handleForgot(ask(unknownAddress(), client), deliver);
      expect(await readable(refusedUnknown)).toEqual(await readable(refusedKnown));
    });

    it('does not spend the sign-in allowance of the account it names', async () => {
      const email = await activeAccount();
      const deliver = recording();

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await handleForgot(ask(email, { 'x-forwarded-for': '203.0.113.9' }), deliver);
      }

      // The counters are namespaced apart on purpose: if they were shared,
      // anybody could lock a named person out of the one door into the hall by
      // posting their address here, with no password and no session.
      const { getRateLimiter } = await import('../../../../auth/rate-limit');
      expect(getRateLimiter().hit(`account:${email}`).limited).toBe(false);
    });
  });

  describe('what it refuses outright', () => {
    it('refuses a cross-site origin before counting anything', async () => {
      const response = await handleForgot(
        ask(unknownAddress(), { origin: 'https://not-this-room.example' }),
        recording(),
      );

      expect(response.status).toBe(403);
    });

    it('refuses a body that is not an address, and says nothing about any account', async () => {
      const malformed = new Request(`${ORIGIN}/api/auth/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ email: 42 }),
      });

      expect((await handleForgot(malformed, recording())).status).toBe(400);
    });

    it('refuses an address longer than one can be, without making it a counter', async () => {
      const overlong = `${'a'.repeat(300)}@example.test`;

      // Refused for its length alone, which the sender already knows and which
      // distinguishes no account — and before it becomes a rate-limit key held
      // for a window.
      expect((await handleForgot(ask(overlong), recording())).status).toBe(400);
    });
  });
});
