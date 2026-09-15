/**
 * `POST /api/auth/register` with the door open (`AUTH-005/T2`).
 *
 * The whole surface exists to answer the same thing for an address an account
 * holds and one it does not, so most of what is asserted here is a comparison
 * between those two rather than a claim about either. A test that only exercised
 * the new address would pass just as well for a route that answered `409` to the
 * one already taken — which is the membership test this form must not become.
 *
 * **The load-bearing test is that the answer does not wait for the message.** It
 * is the one property nothing else can observe and the one whose absence hands
 * over the enumeration oracle with no line looking wrong: a send is a network
 * round trip, so a route that awaited it would answer slowly for one address and
 * quickly for the other. It is asserted by racing the answer against a delivery
 * held open rather than by waiting for a timeout, because a timeout would report
 * the same failure for a route that had crashed.
 *
 * The door is opened by the environment at the top of this file, before anything
 * reads the configuration. The shut posture is a file of its own
 * (`closed-door.test.ts`) rather than a module reset here: the configuration is
 * read once per process, and a suite that reached inside that to flip a value
 * would be testing the reach rather than the route.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDb, getDb } from '../../../../db/index';
import type { MailAvailability } from '../../../../mail/availability';
import type { ComposedMessage } from '../../../../mail/mailer';
import type { Addressee, Deliver } from '../../../../mail/transactional';
import en from '../../../../messages/en.json';
import vi_ from '../../../../messages/vi.json';

import { handleRegister } from './handler';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_auth_register';

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
process.env.AUTH_REGISTRATION_OPEN = 'true';
// Small enough that a test can reach the limit in a handful of requests, and
// long enough that reaching it once holds for the rest of the test.
process.env.AUTH_MAX_ATTEMPTS = '4';
process.env.AUTH_WINDOW_SECONDS = '900';

/** Sending is possible, which is the other half of the door being open. */
const sendable: () => Promise<MailAvailability> = async () => ({
  available: true,
  mail: { available: true, url: { value: 'smtp://localhost:1025' }, from: 'hall@valotech.test' },
} as MailAvailability);

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

interface Sent {
  readonly to: string;
  readonly message: ComposedMessage;
}

/**
 * A delivery that records what it was asked to send and accepts it.
 *
 * `first` resolves when a message has actually been handed over, and every
 * assertion about what was sent waits on it. That is not ceremony: the handler
 * deliberately does not await the send, so reading `sent` the moment it returns
 * reads it before anything has happened.
 */
function recording(): Deliver & { readonly sent: Sent[]; readonly first: Promise<void> } {
  const sent: Sent[] = [];
  let handed = (): void => {};
  const first = new Promise<void>((resolve) => {
    handed = resolve;
  });
  const deliver = async (
    addressee: Addressee,
    message: ComposedMessage,
  ): Promise<{ state: 'accepted' }> => {
    sent.push({ to: addressee.email, message });
    handed();
    return { state: 'accepted' };
  };

  return Object.assign(deliver as Deliver, { sent, first });
}

describe.skipIf(!HAS_DATABASE)('POST /api/auth/register (AUTH-005/T2)', () => {
  function freshAddress(): string {
    return `reg-${randomUUID()}@example.test`;
  }

  async function takenAddress(): Promise<string> {
    const email = freshAddress();
    await getDb()
      .insertInto('accounts')
      .values({ email, name: 'Already Here', role: 'investor', state: 'active', locale: 'vi' })
      .execute();
    return email;
  }

  /**
   * One request, from its own client address unless the caller names one.
   *
   * The limiter is a process singleton and its per-address counter is shared by
   * every request arriving without a forwarded address, so tests that are not
   * about the limit give each request a distinct one and the two that are pin it
   * deliberately. Without this the later tests are refused by the earlier ones,
   * which looks exactly like the route being wrong.
   */
  let nextClient = 0;
  function post(body: unknown, headers: Record<string, string> = {}): Request {
    nextClient += 1;
    return new Request(`${ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: ORIGIN,
        'x-forwarded-for': `198.51.100.${nextClient % 250}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  /** Everything a caller can see of one answer, so two can be compared whole. */
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
      const fresh = await handleRegister(
        post({ name: 'A Prospect', email: freshAddress() }),
        deliver,
        sendable,
      );
      const taken = await handleRegister(
        post({ name: 'A Prospect', email: await takenAddress() }),
        deliver,
        sendable,
      );

      expect(await readable(fresh)).toEqual(await readable(taken));
      expect(fresh.status).toBe(204);
    });

    it('creates the account for one address and no row for the other', async () => {
      const fresh = freshAddress();
      const taken = await takenAddress();

      await handleRegister(post({ name: 'A Prospect', email: fresh }), recording(), sendable);
      await handleRegister(post({ name: 'Somebody Else', email: taken }), recording(), sendable);

      const rows = await getDb()
        .selectFrom('accounts')
        .select(['email', 'name', 'investor_type'])
        .where('email', 'in', [fresh, taken])
        .orderBy('email')
        .execute();

      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.email === fresh)).toEqual({
        email: fresh,
        name: 'A Prospect',
        investor_type: 'prospect',
      });
      // Untouched: no second row, and no rename of the one that was there.
      expect(rows.find((row) => row.email === taken)).toEqual({
        email: taken,
        name: 'Already Here',
        investor_type: null,
      });
    });

    it('puts the difference in a mailbox rather than in the answer', async () => {
      const forFresh = recording();
      const forTaken = recording();

      await handleRegister(post({ name: 'A Prospect', email: freshAddress() }), forFresh, sendable);
      await handleRegister(post({ name: 'A Prospect', email: await takenAddress() }), forTaken, sendable);
      await Promise.all([forFresh.first, forTaken.first]);

      expect(forFresh.sent[0]?.message.subject).toBe(en.registrationMail.subject);
      // The account holder's own language, not the registrant's.
      expect(forTaken.sent[0]?.message.subject).toBe(vi_.registrationExistsMail.subject);
    });
  });

  describe('the answer does not wait for the message', () => {
    it('returns before a delivery that has not finished', async () => {
      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const slow: Deliver = async () => {
        await held;
        return { state: 'accepted' };
      };

      const answered = await Promise.race([
        handleRegister(post({ name: 'A Prospect', email: freshAddress() }), slow, sendable),
        new Promise<'waited'>((resolve) => {
          setTimeout(() => resolve('waited'), 1_000);
        }),
      ]);

      expect(answered).not.toBe('waited');
      expect((answered as Response).status).toBe(204);

      release();
      await held;
    });
  });

  describe('the language the message is composed in', () => {
    it('is the one the page they registered on was served in', async () => {
      const deliver = recording();

      await handleRegister(
        post({ name: 'A Prospect', email: freshAddress() }, { cookie: 'NEXT_LOCALE=vi' }),
        deliver,
        sendable,
      );
      await deliver.first;

      expect(deliver.sent[0]?.message.subject).toBe(vi_.registrationMail.subject);
    });

    it('falls back to what the browser asked for when no choice was stored', async () => {
      const deliver = recording();

      await handleRegister(
        post({ name: 'A Prospect', email: freshAddress() }, { 'accept-language': 'vi,en;q=0.5' }),
        deliver,
        sendable,
      );
      await deliver.first;

      expect(deliver.sent[0]?.message.subject).toBe(vi_.registrationMail.subject);
    });
  });

  describe('when no message can be sent at all', () => {
    it('shuts the door rather than writing a row nobody could ever reach', async () => {
      const email = freshAddress();
      const unavailable: () => Promise<MailAvailability> = async () => ({
        available: false,
        reason: 'SMTP_URL is not set',
      });

      const response = await handleRegister(post({ name: 'A Prospect', email }), recording(), unavailable);

      expect(response.status).toBe(503);
      expect(await response.text()).toBe(JSON.stringify({ error: 'registration_closed' }));
      // A name and an address for an account whose only link never left would be
      // personal data collected for a purpose that did not happen (`DATA-R01`).
      expect(
        await getDb().selectFrom('accounts').select('id').where('email', '=', email).execute(),
      ).toHaveLength(0);
    });

    it('records a credential that went away between the check and the send', async () => {
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
      const email = freshAddress();

      try {
        // `unavailable` RESOLVES — it is not a rejection — so a `.catch` alone
        // would let it pass unremarked, and the person was just told to look in
        // their inbox.
        const response = await handleRegister(
          post({ name: 'A Prospect', email }),
          async () => {
            attempted();
            return { state: 'unavailable', reason: 'SMTP_URL is not set' };
          },
          sendable,
        );
        expect(response.status).toBe(204);
        await seen;
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      } finally {
        write.mockRestore();
      }

      const written = lines.join('');
      expect(written).toContain('mail.unavailable');
      // No address and no name in it, ever (`DATA-R02`).
      expect(written).not.toContain(email);
      expect(written).not.toContain('A Prospect');
    });
  });

  describe('the rate limit', () => {
    it('refuses after the limit, identically for a taken and a free address', async () => {
      const client = { 'x-forwarded-for': '203.0.113.21' };
      const taken = await takenAddress();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const answer = await handleRegister(
          post({ name: 'A Prospect', email: freshAddress() }, client),
          recording(),
          sendable,
        );
        expect(answer.status).toBe(204);
      }

      const refusedFresh = await handleRegister(
        post({ name: 'A Prospect', email: freshAddress() }, client),
        recording(),
        sendable,
      );
      expect(refusedFresh.status).toBe(429);
      expect(Number(refusedFresh.headers.get('Retry-After'))).toBeGreaterThan(0);

      const refusedTaken = await handleRegister(
        post({ name: 'A Prospect', email: taken }, client),
        recording(),
        sendable,
      );
      expect(await readable(refusedTaken)).toEqual(await readable(refusedFresh));
    });

    it('writes no row once it is refusing', async () => {
      const client = { 'x-forwarded-for': '203.0.113.22' };
      const email = freshAddress();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await handleRegister(post({ name: 'A Prospect', email: freshAddress() }, client), recording(), sendable);
      }

      const refused = await handleRegister(post({ name: 'A Prospect', email }, client), recording(), sendable);

      expect(refused.status).toBe(429);
      expect(
        await getDb().selectFrom('accounts').select('id').where('email', '=', email).execute(),
      ).toHaveLength(0);
    });

    it('does not spend the sign-in allowance of the address it names', async () => {
      const email = freshAddress();
      const client = { 'x-forwarded-for': '203.0.113.23' };

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await handleRegister(post({ name: 'A Prospect', email }, client), recording(), sendable);
      }

      // Namespaced apart on purpose: shared counters would let anybody lock a
      // named person out of the one door into the hall, with no password and no
      // session, by posting their address here.
      const { getRateLimiter } = await import('../../../../auth/rate-limit');
      expect(getRateLimiter().hit(`account:${email}`).limited).toBe(false);
    });
  });

  describe('what it refuses outright', () => {
    it('refuses a cross-site origin before counting anything', async () => {
      const response = await handleRegister(
        post({ name: 'A Prospect', email: freshAddress() }, { origin: 'https://not-this-hall.example' }),
        recording(),
        sendable,
      );

      expect(response.status).toBe(403);
    });

    it('refuses a body that is not a name and an address', async () => {
      for (const body of [{ email: freshAddress() }, { name: 'A Prospect' }, { name: 42, email: 7 }, []]) {
        const response = await handleRegister(post(body), recording(), sendable);
        expect({ body, status: response.status }).toEqual({ body, status: 400 });
      }
    });

    it('refuses a name that is only whitespace, and one longer than a name', async () => {
      for (const name of ['   ', 'n'.repeat(201)]) {
        const response = await handleRegister(
          post({ name, email: freshAddress() }),
          recording(),
          sendable,
        );
        expect(response.status).toBe(400);
      }

      // The bound is on what reaches the row, so a name that fits after trimming
      // is accepted rather than refused for its untrimmed length.
      const fits = await handleRegister(
        post({ name: `  ${'n'.repeat(200)}  `, email: freshAddress() }),
        recording(),
        sendable,
      );
      expect(fits.status).toBe(204);
    });

    it('refuses an address longer than one can be, without making it a counter', async () => {
      const response = await handleRegister(
        post({ name: 'A Prospect', email: `${'a'.repeat(300)}@example.test` }),
        recording(),
        sendable,
      );

      expect(response.status).toBe(400);
    });

    it('answers a body that is not JSON at all', async () => {
      const malformed = new Request(`${ORIGIN}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '203.0.113.24' },
        body: 'not json',
      });

      expect((await handleRegister(malformed, recording(), sendable)).status).toBe(400);
    });
  });
});
