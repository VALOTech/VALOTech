/**
 * The two translation routes against a real PostgreSQL (`CMS-005/T3`,
 * `CMS-005/T4`).
 *
 * `content/translating.test.ts` pins what the store does; this pins the surface:
 * who is refused, which locales are refused, and — the one that matters most —
 * that the review route rebuilds the document from the source rather than
 * storing what the caller sent. A body of strings cannot give one language a
 * different structure, a different picture or an extra section, and the proof is
 * a caller that tries.
 *
 * It needs a database. `DATABASE_URL` names a development target: the suite
 * writes accounts and sessions and deletes them again, and everything else it
 * writes is scoped to items it creates.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../../../auth/session';
import type { Block } from '../../../../../../content/blocks';
import { createItem, saveDraft } from '../../../../../../content/items';
import { localeDraft, seedLocale } from '../../../../../../content/locales';
import { closeDb, getDb } from '../../../../../../db/index';

import { POST as SEED } from './draft/route';
import { POST as REVIEW } from './review/route';

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
  '..',
  'migrations',
);

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);

const ADMIN = 'admin@locale-routes.test';
const INVESTOR = 'investor@locale-routes.test';
const SEEDED = [ADMIN, INVESTOR];

const SOURCE: Block[] = [
  { type: 'heading', level: 2, text: 'This quarter' },
  { type: 'paragraph', text: 'hello world', marks: [{ start: 0, end: 5, type: 'strong' }] },
  { type: 'image', mediaId: '', alt: 'a picture', caption: null },
];

function call(
  handler: (request: Request, context: { params: Promise<{ id: string; locale: string }> }) => Promise<Response>,
  path: string,
  itemId: string,
  locale: string,
  body: unknown,
  options: { cookie?: string; origin?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.cookie !== undefined) {
    headers['Cookie'] = options.cookie;
  }
  if (options.origin !== undefined) {
    headers['Origin'] = options.origin;
  }

  return handler(
    new Request(`${ORIGIN}/admin/content/${itemId}/locales/${locale}/${path}`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: itemId, locale }) },
  );
}

describe.skipIf(!HAS_DATABASE)('the translation routes', () => {
  let adminId: string;
  let adminCookie: string;
  let investorCookie: string;

  async function seedAccount(email: string, role: 'admin' | 'investor') {
    const account = await getDb()
      .insertInto('accounts')
      .values({ email, name: role, role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(account.id);

    return { id: account.id, header: `${cookie.name}=${cookie.value}` };
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
    const admin = await seedAccount(ADMIN, 'admin');
    const investor = await seedAccount(INVESTOR, 'investor');
    adminId = admin.id;
    adminCookie = admin.header;
    investorCookie = investor.header;
  }, 120_000);

  afterAll(async () => {
    await getDb().deleteFrom('accounts').where('email', 'in', SEEDED).execute();
    await closeDb();
  });

  async function itemWithDraft(): Promise<string> {
    const item = await createItem({
      type: 'update',
      slug: `u-${crypto.randomUUID()}`,
      title: 'An update',
    });
    await saveDraft(item.id, SOURCE, adminId);

    return item.id;
  }

  describe('POST .../locales/<locale>/draft', () => {
    it('starts the language, and the seed is the English', async () => {
      const itemId = await itemWithDraft();

      const response = await call(SEED, 'draft', itemId, 'vi', {}, { cookie: adminCookie });

      expect(response.status).toBe(200);
      expect((await localeDraft(itemId, 'vi'))?.translation).toEqual(SOURCE);
    });

    it('answers an investor 404, starting nothing', async () => {
      const itemId = await itemWithDraft();

      const response = await call(SEED, 'draft', itemId, 'vi', {}, { cookie: investorCookie });

      expect(response.status).toBe(404);
      expect(await localeDraft(itemId, 'vi')).toBeNull();
    });

    it('sends a caller with no session to sign in, starting nothing', async () => {
      const itemId = await itemWithDraft();

      const response = await call(SEED, 'draft', itemId, 'vi', {});

      expect(response.status).toBe(303);
      expect(await localeDraft(itemId, 'vi')).toBeNull();
    });

    it('refuses a cross-origin post before anything else', async () => {
      const itemId = await itemWithDraft();

      const response = await call(
        SEED,
        'draft',
        itemId,
        'vi',
        {},
        { cookie: adminCookie, origin: 'https://elsewhere.test' },
      );

      expect(response.status).toBe(403);
      expect(await localeDraft(itemId, 'vi')).toBeNull();
    });

    it('refuses a language the application does not carry', async () => {
      const itemId = await itemWithDraft();

      const response = await call(SEED, 'draft', itemId, 'xx', {}, { cookie: adminCookie });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'unknown_locale' });
    });

    it('refuses English, which holds no locale row at all', async () => {
      const itemId = await itemWithDraft();

      const response = await call(SEED, 'draft', itemId, 'en', {}, { cookie: adminCookie });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'authored_locale' });
    });

    it('refuses a second start, rather than overwriting the first', async () => {
      const itemId = await itemWithDraft();
      await call(SEED, 'draft', itemId, 'vi', {}, { cookie: adminCookie });

      const response = await call(SEED, 'draft', itemId, 'vi', {}, { cookie: adminCookie });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'already_started' });
    });

    it('refuses an item with nothing written yet', async () => {
      const item = await createItem({
        type: 'update',
        slug: `u-${crypto.randomUUID()}`,
        title: 'Empty',
      });

      const response = await call(SEED, 'draft', item.id, 'vi', {}, { cookie: adminCookie });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'no_revision' });
    });
  });

  describe('POST .../locales/<locale>/review', () => {
    async function started(): Promise<string> {
      const itemId = await itemWithDraft();
      await seedLocale(itemId, 'vi');

      return itemId;
    }

    it('stores the words and marks the language reviewed', async () => {
      const itemId = await started();

      const response = await call(
        REVIEW,
        'review',
        itemId,
        'vi',
        { fields: [['Quý này'], ['xin chào', ' thế giới'], ['một bức ảnh']] },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
      const draft = await localeDraft(itemId, 'vi');
      expect(draft?.state).toBe('reviewed');
      expect(draft?.translation).toEqual([
        { type: 'heading', level: 2, text: 'Quý này' },
        { type: 'paragraph', text: 'xin chào thế giới', marks: [{ start: 0, end: 8, type: 'strong' }] },
        { type: 'image', mediaId: '', alt: 'một bức ảnh', caption: null },
      ]);
    });

    it('rebuilds from the source, so a caller cannot give one language its own shape', async () => {
      const itemId = await started();

      // Four blocks' worth of values against a three-block document, and extra
      // values inside each: what comes back is still the source's shape.
      const response = await call(
        REVIEW,
        'review',
        itemId,
        'vi',
        { fields: [['Quý này', 'x'], ['a', 'b', 'c'], ['ảnh', 'y'], ['a whole extra block']] },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
      const translation = (await localeDraft(itemId, 'vi'))?.translation ?? [];
      expect(translation).toHaveLength(3);
      expect(translation.map((block) => block.type)).toEqual(['heading', 'paragraph', 'image']);
      // The picture is the document's, not the translator's.
      expect(translation[2]).toMatchObject({ mediaId: '' });
    });

    it('answers an investor 404, leaving the language unreviewed', async () => {
      const itemId = await started();

      const response = await call(
        REVIEW,
        'review',
        itemId,
        'vi',
        { fields: [[], [], []] },
        { cookie: investorCookie },
      );

      expect(response.status).toBe(404);
      expect((await localeDraft(itemId, 'vi'))?.state).toBe('machine');
    });

    it('refuses a cross-origin post before anything else', async () => {
      const itemId = await started();

      const response = await call(
        REVIEW,
        'review',
        itemId,
        'vi',
        { fields: [[], [], []] },
        { cookie: adminCookie, origin: 'https://elsewhere.test' },
      );

      expect(response.status).toBe(403);
      expect((await localeDraft(itemId, 'vi'))?.state).toBe('machine');
    });

    it('refuses a body whose fields are not arrays of strings', async () => {
      const itemId = await started();

      for (const fields of [undefined, 'words', [1, 2], [['ok'], 'not ok'], [[1]]]) {
        const response = await call(REVIEW, 'review', itemId, 'vi', { fields }, { cookie: adminCookie });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_request' });
      }

      expect((await localeDraft(itemId, 'vi'))?.state).toBe('machine');
    });

    it('refuses a translation that would ship an unlabelled image (A11Y-R02)', async () => {
      const itemId = await started();

      // Emptying the alternative text is a valid string edit and an invalid
      // document: a translation is held to what every other document is.
      const response = await call(
        REVIEW,
        'review',
        itemId,
        'vi',
        { fields: [['Quy nay'], ['xin chao', ' the gioi'], ['   ']] },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(422);
      const body = (await response.json()) as { error?: string; detail?: string };
      expect(body.error).toBe('invalid_blocks');
      expect(body.detail).toContain('alt');
      expect((await localeDraft(itemId, 'vi'))?.state).toBe('machine');
    });

    it('refuses a language nobody started', async () => {
      const itemId = await itemWithDraft();

      const response = await call(
        REVIEW,
        'review',
        itemId,
        'vi',
        { fields: [[], [], []] },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'not_started' });
    });

    it('refuses English and an unknown language, as the seed does', async () => {
      const itemId = await started();

      expect((await call(REVIEW, 'review', itemId, 'en', { fields: [] }, { cookie: adminCookie })).status).toBe(400);
      expect((await call(REVIEW, 'review', itemId, 'xx', { fields: [] }, { cookie: adminCookie })).status).toBe(400);
    });
  });
});
