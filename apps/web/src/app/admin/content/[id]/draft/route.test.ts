/**
 * The draft-save route against a real PostgreSQL (`CMS-002/T6`, `CMS-002/T7`).
 *
 * The route delegates validation to `saveDraft` and surfaces its refusal, so
 * what this suite pins is the surface: an admin's valid body is stored and can
 * be read back; an invalid one is answered `422` with the block index and field
 * named — never `200`, and never a `500`; a non-admin and a signed-out caller
 * are refused before anything is written; and a cross-origin post is refused
 * first of all.
 *
 * It sets up items through `createItem` and reads them back through `forAuthor`
 * rather than touching the store directly, because those are the reader-scoped
 * ways in, and it seeds accounts and sessions the way the sign-in suite does.
 *
 * It needs a database. `DATABASE_URL` names a development target: the suite
 * writes accounts and sessions and deletes them again.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../../../../../auth/gate';
import { issue } from '../../../../../auth/session';
import { closeDb, getDb } from '../../../../../db/index';
import type { Block } from '../../../../../content/blocks';
import { createItem } from '../../../../../content/items';
import { forAuthor } from '../../../../../content/read';
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
  '..',
  'migrations',
);

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

const ADMIN = 'cms-draft-admin@example.test';
const INVESTOR = 'cms-draft-investor@example.test';
const SEEDED = [ADMIN, INVESTOR];

const VALID: Block[] = [
  { type: 'heading', level: 2, text: 'This month' },
  { type: 'paragraph', text: 'We shipped the editor.', marks: [] },
  { type: 'divider' },
];

function draftRequest(
  itemId: string,
  body: unknown,
  options: { cookie?: string; origin?: string } = {},
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.cookie !== undefined) {
    headers['Cookie'] = options.cookie;
  }
  if (options.origin !== undefined) {
    headers['Origin'] = options.origin;
  }
  return new Request(`http://localhost:3100/admin/content/${itemId}/draft`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function callPost(
  itemId: string,
  body: unknown,
  options: { cookie?: string; origin?: string } = {},
): Promise<Response> {
  return POST(draftRequest(itemId, body, options), { params: Promise.resolve({ id: itemId }) });
}

describe.skipIf(!HAS_DATABASE)('POST /admin/content/<id>/draft', () => {
  let adminActor: Actor;
  let adminCookie: string;
  let investorCookie: string;

  async function seed(email: string, role: 'admin' | 'investor'): Promise<string> {
    const account = await getDb()
      .insertInto('accounts')
      .values({ email, name: role, role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(account.id);
    return `${cookie.name}=${cookie.value}#${account.id}`;
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

    const admin = await seed(ADMIN, 'admin');
    const investor = await seed(INVESTOR, 'investor');
    const [adminHeader = '', adminId = ''] = admin.split('#');
    const [investorHeader = ''] = investor.split('#');
    adminCookie = adminHeader;
    investorCookie = investorHeader;
    adminActor = { id: adminId, role: 'admin' };
  }, 120_000);

  afterAll(async () => {
    // The sessions go with the accounts: sessions.account_id is ON DELETE CASCADE.
    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await closeDb();
  });

  async function freshItem(): Promise<string> {
    const item = await createItem({
      type: 'update',
      slug: `cms002-${crypto.randomUUID()}`,
      title: 'A draft',
      kind: 'progress',
    });
    return item.id;
  }

  describe('an admin saving a valid body', () => {
    it('answers 200 and stores the draft, readable back as the array it was', async () => {
      const itemId = await freshItem();

      const response = await callPost(itemId, { blocks: VALID }, { cookie: adminCookie });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { revisionId?: string };
      expect(typeof body.revisionId).toBe('string');

      const view = await forAuthor(itemId, adminActor);
      expect(view?.revision.blocks).toEqual(VALID);
    });
  });

  describe('an admin saving an invalid body', () => {
    it('answers 422 naming the block and the field, writing nothing, for an alt-less image', async () => {
      const itemId = await freshItem();

      const response = await callPost(
        itemId,
        { blocks: [{ type: 'image', mediaId: 'm', alt: '', caption: null }] },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(422);
      const body = (await response.json()) as { error?: string; detail?: string };
      expect(body.error).toBe('invalid_blocks');
      // The message names both the block index and the field: this is the pair
      // that makes the error actionable, and the pair a mutant that swallowed
      // the naming would drop.
      expect(body.detail).toContain('blocks[0]');
      expect(body.detail).toContain('alt');

      // Refused before the store: a fresh item still has no revision to read.
      expect(await forAuthor(itemId, adminActor)).toBeNull();
    });

    it('names the faulty block by its real index, not always the first', async () => {
      const itemId = await freshItem();

      const response = await callPost(
        itemId,
        { blocks: [{ type: 'divider' }, { type: 'image', mediaId: 'm', alt: '', caption: null }] },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(422);
      const body = (await response.json()) as { detail?: string };
      expect(body.detail).toContain('blocks[1]');
      expect(body.detail).toContain('alt');
    });

    it('answers 422 for an unknown block type, naming it', async () => {
      const itemId = await freshItem();

      const response = await callPost(itemId, { blocks: [{ type: 'marquee' }] }, { cookie: adminCookie });

      expect(response.status).toBe(422);
      const body = (await response.json()) as { detail?: string };
      expect(body.detail).toContain('blocks[0]');
      expect(body.detail).toContain('unknown block type');
      expect(await forAuthor(itemId, adminActor)).toBeNull();
    });
  });

  describe('a caller who is not an admin', () => {
    it('answers 404 to an investor and writes nothing', async () => {
      const itemId = await freshItem();

      const response = await callPost(itemId, { blocks: VALID }, { cookie: investorCookie });

      expect(response.status).toBe(404);
      expect(await forAuthor(itemId, adminActor)).toBeNull();
    });

    it('redirects a caller with no session to sign in', async () => {
      const itemId = await freshItem();

      const response = await callPost(itemId, { blocks: VALID });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in');
      expect(await forAuthor(itemId, adminActor)).toBeNull();
    });
  });

  describe('the request shape', () => {
    it('refuses a cross-origin post before anything else', async () => {
      const itemId = await freshItem();

      const response = await callPost(
        itemId,
        { blocks: VALID },
        { cookie: adminCookie, origin: 'https://evil.example' },
      );

      expect(response.status).toBe(403);
      expect(await forAuthor(itemId, adminActor)).toBeNull();
    });

    it('answers 400 for a body that is not a JSON object', async () => {
      const itemId = await freshItem();

      const notJson = await callPost(itemId, 'not json at all', { cookie: adminCookie });
      expect(notJson.status).toBe(400);

      const anArray = await callPost(itemId, [], { cookie: adminCookie });
      expect(anArray.status).toBe(400);
    });
  });
});
