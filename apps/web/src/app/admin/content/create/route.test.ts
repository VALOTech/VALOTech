/**
 * The create route against a real PostgreSQL (`CMS-002/T9`).
 *
 * An item is the one thing in this room that had no way to exist through the
 * product, so what this pins is that the way now exists and that it is narrow.
 * **The type decides what else is demanded** — an update carries a kind, a
 * report a period, a deck neither — and the check is here as well as in the
 * form, because a browser-side validator is a convenience and never a boundary
 * (`CMS-002` §3). **The address is the author's**, held to a shape a URL does not
 * escape, and one already taken is answered by name rather than as a constraint
 * violation nobody can act on.
 *
 * Creating is not publishing: every item it makes is invisible to every reader
 * until something is written and published, and the suite checks that what it
 * leaves behind is not published.
 *
 * What was created is read back through `itemsForConsole`, never by naming a
 * content table: only the content module may name one (`check-content-access`),
 * and reading through the module is what that rule is for — a suite reaching
 * past it would be checking a row rather than what the console shows.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import { itemsForConsole } from '../../../../content/items';
import { closeDb, getDb } from '../../../../db/index';

import { POST } from './route';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'migrations');

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);

const ADMIN = 'admin@content-create.test';
const INVESTOR = 'investor@content-create.test';
const SEEDED = [ADMIN, INVESTOR];

function callPost(body: unknown, options: { cookie?: string; origin?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.cookie !== undefined) {
    headers['Cookie'] = options.cookie;
  }
  if (options.origin !== undefined) {
    headers['Origin'] = options.origin;
  }

  return POST(
    new Request(`${ORIGIN}/admin/content/create`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

describe.skipIf(!HAS_DATABASE)('POST /admin/content/create', () => {
  let adminCookie: string;
  let investorCookie: string;

  async function seed(email: string, role: 'admin' | 'investor'): Promise<string> {
    const account = await getDb()
      .insertInto('accounts')
      .values({ email, name: role, role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(account.id);

    return `${cookie.name}=${cookie.value}`;
  }

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
    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    adminCookie = await seed(ADMIN, 'admin');
    investorCookie = await seed(INVESTOR, 'investor');
  }, 120_000);

  afterAll(async () => {
    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await closeDb();
  });

  /** A slug of this suite's own, so no other suite's item collides with it. */
  const address = (): string => `create-${crypto.randomUUID()}`;

  /** The item as the console lists it, narrowed to what creating decided. */
  async function stored(id: string) {
    const listed = (await itemsForConsole()).find((entry) => entry.id === id);

    return listed === undefined
      ? undefined
      : {
          type: listed.type,
          title: listed.title,
          slug: listed.slug,
          audience: listed.audience,
          kind: listed.kind,
          period: listed.period,
          published: listed.published,
        };
  }

  /** Whether anything was created under this address. */
  async function anyAt(slug: string): Promise<boolean> {
    return (await itemsForConsole()).some((entry) => entry.slug === slug);
  }

  describe('what it creates', () => {
    it('creates an update with its kind, invisible to every reader', async () => {
      const slug = address();

      const response = await callPost(
        { type: 'update', title: '  We shipped it  ', slug, audience: 'public', kind: 'announcement' },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
      const { id } = (await response.json()) as { id: string };
      expect(await stored(id)).toEqual({
        type: 'update',
        // The title is trimmed: a trailing space is a typing artefact, not a name.
        title: 'We shipped it',
        slug,
        audience: 'public',
        kind: 'announcement',
        period: null,
        // Creating is not publishing.
        published: false,
      });
    });

    it('creates a report under its period', async () => {
      const response = await callPost(
        { type: 'report', title: 'The third quarter', slug: address(), audience: 'investor', period: '2026-Q3' },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
      const { id } = (await response.json()) as { id: string };
      expect(await stored(id)).toMatchObject({ type: 'report', period: '2026-Q3', kind: null });
    });

    it('creates a deck, which carries neither', async () => {
      const response = await callPost(
        { type: 'deck', title: 'The pitch', slug: address(), audience: 'granted' },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
      const { id } = (await response.json()) as { id: string };
      expect(await stored(id)).toMatchObject({ type: 'deck', kind: null, period: null });
    });

    it('accepts a month as a report period, not only a quarter', async () => {
      const response = await callPost(
        { type: 'report', title: 'July', slug: address(), audience: 'investor', period: '2026-07' },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
    });
  });

  describe('what the type demands', () => {
    it.each([
      ['an update with no kind', { type: 'update', audience: 'investor' }, 'kind'],
      ['a report with no period', { type: 'report', audience: 'investor' }, 'period'],
      ['a report whose period is not one', { type: 'report', audience: 'investor', period: 'Q3' }, 'period'],
      ['a deck carrying a period', { type: 'deck', audience: 'investor', period: '2026-Q3' }, 'period'],
      ['a report carrying a kind', { type: 'report', audience: 'investor', period: '2026-Q3', kind: 'progress' }, 'kind'],
      ['a type that is not one of the three', { type: 'memo', audience: 'investor' }, 'type'],
      ['an audience that is not one of the three', { type: 'deck', audience: 'everyone' }, 'audience'],
      ['a blank title', { type: 'deck', audience: 'investor', title: '   ' }, 'title'],
      ['an address with a space in it', { type: 'deck', audience: 'investor', slug: `not an address ${crypto.randomUUID()}` }, 'slug'],
      ['an address in capitals', { type: 'deck', audience: 'investor', slug: `Not-An-Address-${crypto.randomUUID()}` }, 'slug'],
    ])('refuses %s, naming the field', async (_case, body, field) => {
      const posted = { title: 'A title', slug: address(), ...body };

      const response = await callPost(posted, { cookie: adminCookie });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'invalid_request', field });
      // Scoped to the address this case posted rather than to a count of every
      // item: a count is a different number the moment another suite writes one.
      expect(await anyAt(posted.slug)).toBe(false);
    });

    it('refuses a body that is not an object', async () => {
      const response = await callPost('a title', { cookie: adminCookie });

      expect(response.status).toBe(400);
    });
  });

  describe('an address already taken', () => {
    it('says so by name rather than as a constraint error', async () => {
      const slug = address();
      const first = await callPost(
        { type: 'deck', title: 'The pitch', slug, audience: 'granted' },
        { cookie: adminCookie },
      );
      expect(first.status).toBe(200);

      const second = await callPost(
        { type: 'deck', title: 'The other pitch', slug, audience: 'granted' },
        { cookie: adminCookie },
      );

      expect(second.status).toBe(409);
      expect(await second.json()).toEqual({ error: 'slug_taken', field: 'slug' });
    });
  });

  describe('who may create', () => {
    it('answers an investor 404, creating nothing', async () => {
      const slug = address();

      const response = await callPost(
        { type: 'deck', title: 'Theirs', slug, audience: 'granted' },
        { cookie: investorCookie },
      );

      expect(response.status).toBe(404);
      expect(await anyAt(slug)).toBe(false);
    });

    it('sends a caller with no session to sign in, creating nothing', async () => {
      const slug = address();

      const response = await callPost({ type: 'deck', title: 'Nobody', slug, audience: 'granted' });

      expect(response.status).toBe(303);
      expect(await anyAt(slug)).toBe(false);
    });

    it('refuses a cross-origin post before anything else', async () => {
      const slug = address();

      const response = await callPost(
        { type: 'deck', title: 'Elsewhere', slug, audience: 'granted' },
        { cookie: adminCookie, origin: 'https://elsewhere.test' },
      );

      expect(response.status).toBe(403);
      expect(await anyAt(slug)).toBe(false);
    });
  });
});
