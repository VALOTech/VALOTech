/**
 * `POST /admin/updates/compose` against a real PostgreSQL (`POST-001/T1`–`T4`).
 *
 * What this pins is the boundary. The composer's own checks are a convenience and
 * the browser is never where a rule is enforced (`CMS-002` §3), so every refusal
 * is exercised here as a request rather than as a form state: an unchosen kind, a
 * tag that names nothing, a body with nothing in it, and a title that is only
 * whitespace. Each answers by field, because a refusal the composer cannot put
 * the author back into is a refusal they have to guess at (`A11Y-R02`).
 *
 * What is *stored* is `updates.test.ts`'s: this reads back through
 * `itemsForConsole`, never by naming a content table, because only the content
 * module may name one and reading through the module is what that rule is for.
 *
 * On a database of its own, so the items it creates are the only ones its
 * assertions can see.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import { itemsForConsole } from '../../../../content/items';
import { closeDb, getDb } from '../../../../db/index';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_update_route';

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

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

/** The document the composer builds from a body, in the shape it actually sends. */
const BLOCKS = [{ type: 'paragraph', text: 'We raised a round.', marks: [] }];

describe.skipIf(!HAS_DATABASE)('POST /admin/updates/compose (POST-001)', () => {
  let adminCookie = '';
  let investorCookie = '';

  function callPost(body: unknown, options: { cookie?: string; origin?: string } = {}): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.cookie !== undefined) {
      headers['Cookie'] = options.cookie;
    }
    headers['Origin'] = options.origin ?? ORIGIN;

    return POST(
      new Request(`${ORIGIN}/admin/updates/compose`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  }

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
    await recreateIsolatedDatabase();
    await runner({
      databaseUrl: ISOLATED_DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      verbose: false,
    });

    adminCookie = await seed('admin@update-route.test', 'admin');
    investorCookie = await seed('investor@update-route.test', 'investor');
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  describe('who may reach it', () => {
    it('answers an investor the 404 the console gives a guess', async () => {
      const response = await callPost(
        { kind: 'progress', title: 'Not for them', blocks: BLOCKS },
        { cookie: investorCookie },
      );

      expect(response.status).toBe(404);
    });

    it('sends a signed-out caller to sign in', async () => {
      const response = await callPost({ kind: 'progress', title: 'Nobody', blocks: BLOCKS });

      // Pinned rather than `not.toBe(200)`, which would have passed just as
      // happily for a 500.
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toContain('/sign-in');
    });

    it('refuses a cross-site origin before anything else', async () => {
      const response = await callPost(
        { kind: 'progress', title: 'From elsewhere', blocks: BLOCKS },
        { cookie: adminCookie, origin: 'https://not-this-room.example' },
      );

      expect(response.status).toBe(403);
    });
  });

  describe('what it refuses, by field', () => {
    it('refuses an unchosen kind', async () => {
      const response = await callPost({ title: 'No kind', blocks: BLOCKS }, { cookie: adminCookie });

      expect(response.status).toBe(400);
      expect((await response.json()) as { field?: string }).toMatchObject({ field: 'kind' });
    });

    it('refuses a kind that is not one of the three', async () => {
      const response = await callPost(
        { kind: 'rumour', title: 'A fourth kind', blocks: BLOCKS },
        { cookie: adminCookie },
      );

      // Three and no more: a fourth would be added the first time something did
      // not fit, and then a fifth, and the filter would stop meaning anything.
      expect((await response.json()) as { field?: string }).toMatchObject({ field: 'kind' });
    });

    it('refuses a product tag that names nothing', async () => {
      const response = await callPost(
        { kind: 'progress', product: 'not-a-product', title: 'Bad tag', blocks: BLOCKS },
        { cookie: adminCookie },
      );

      expect((await response.json()) as { field?: string }).toMatchObject({ field: 'product' });
    });

    it('refuses a title that is only whitespace, because it is the first line', async () => {
      const response = await callPost(
        { kind: 'progress', title: '   ', blocks: BLOCKS },
        { cookie: adminCookie },
      );

      expect((await response.json()) as { field?: string }).toMatchObject({ field: 'title' });
    });

    it('refuses a body with nothing in it', async () => {
      const response = await callPost(
        { kind: 'progress', title: 'Nothing under it', blocks: [] },
        { cookie: adminCookie },
      );

      expect((await response.json()) as { field?: string }).toMatchObject({ field: 'blocks' });
    });

    it('answers a document it cannot store with 422, not a 500', async () => {
      // The composer cannot produce this -- `blocksFromText` emits paragraphs --
      // but this is the boundary and not the form, so a direct caller gets an
      // answer rather than a crash. The word is the draft route's, because a 500
      // reads as the server breaking rather than the document being wrong.
      const response = await callPost(
        { kind: 'progress', title: 'A bad document', blocks: [{ type: 'not-a-block' }] },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(422);
      expect((await response.json()) as { error?: string }).toMatchObject({ error: 'invalid_blocks' });
    });

    it('refuses a body that is not fields at all', async () => {
      const response = await callPost('a first line', { cookie: adminCookie });

      expect(response.status).toBe(400);
    });
  });

  describe('what it accepts', () => {
    it('takes an untagged update and answers where it went', async () => {
      const response = await callPost(
        { kind: 'announcement', title: 'We raised a round.', blocks: BLOCKS },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
      const answer = (await response.json()) as { id: string; slug: string };

      // The address the author never chose travels back with the id, because a
      // reader will see it and being shown it is how it becomes theirs.
      expect(answer.slug).toBe('we-raised-a-round');

      const listed = (await itemsForConsole()).find((item) => item.id === answer.id);
      expect(listed).toMatchObject({ type: 'update', kind: 'announcement', title: 'We raised a round.' });
      // Filing is not publishing: no reader sees anything yet.
      expect(listed?.published).toBe(false);
    });

    it('takes the empty product as not having been said', async () => {
      // The `<select>` posts the empty string when nothing is chosen, so refusing
      // it would refuse the default state of the control.
      const response = await callPost(
        { kind: 'progress', product: '', title: 'Nothing said about it', blocks: BLOCKS },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
    });

    it('takes a tagged update', async () => {
      const response = await callPost(
        { kind: 'progress', product: 'verdiq', title: 'A number moved on it', blocks: BLOCKS },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
    });
  });
});
