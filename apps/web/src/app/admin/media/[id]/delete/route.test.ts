/**
 * The media delete route against a real PostgreSQL (`CMS-003/T10`).
 *
 * Three classes of claim. **Who is refused** — an investor gets the console's
 * `404`, a caller with no session the sign-in redirect, and a cross-origin post a
 * `403`, each with the file still there, because a refusal that deleted the file
 * anyway is the failure that looks like a refusal. **That the typed name is a
 * gate and not a courtesy** — the control holds Confirm off until the id matches,
 * and a body is whatever the caller sent, so the wrong name and no name at all are
 * both refused here with nothing deleted. **That a refused delete is legible** —
 * a file something points at is not deleted and the answer carries the titles of
 * the documents using it, not their ids, because an admin cannot tell from a uuid
 * what they nearly broke.
 *
 * On a database of its own, so the row counts are exactly what this suite wrote.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Jimp } from 'jimp';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { issue } from '../../../../../auth/session';
import { closeDb, getDb } from '../../../../../db/index';
import type { AccountRole } from '../../../../../db/types';
import { itemsUsing, libraryContents, storeMedia } from '../../../../../content/media';
import { createItem } from '../../../../../content/items';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_media_delete';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

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

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);

const SUITE_DOMAIN = '@media-delete.test';

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

async function signedIn(role: AccountRole): Promise<{ id: string; cookie: string }> {
  const account = await getDb()
    .insertInto('accounts')
    .values({ email: `${crypto.randomUUID()}${SUITE_DOMAIN}`, name: role, role, state: 'active' })
    .returning('id')
    .executeTakeFirstOrThrow();
  const cookie = await issue(account.id);

  return { id: account.id, cookie: `${cookie.name}=${cookie.value}` };
}

/** A stored file of its own, distinct per colour. */
async function storedFile(colour: number, uploader: string): Promise<string> {
  const bytes = await new Jimp({ width: 8, height: 6, color: colour }).getBuffer('image/png');
  const { id } = await storeMedia(bytes, 'image/png', uploader);

  return id;
}

async function fileCount(): Promise<number> {
  return (await getDb().selectFrom('media').select('id').execute()).length;
}

function callPost(
  id: string,
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

  return POST(
    new Request(`${ORIGIN}/admin/media/${id}/delete`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe.skipIf(!HAS_DATABASE)('POST /admin/media/<id>/delete', () => {
  let admin: { id: string; cookie: string };

  beforeAll(async () => {
    await recreateIsolatedDatabase();
    await runner({
      databaseUrl: ISOLATED_DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
    });
  }, 120_000);

  beforeEach(async () => {
    await getDb().deleteFrom('media_refs').execute();
    await getDb().deleteFrom('media').execute();
    // Items are left where they are: naming a content table outside the content
    // module is what `check-content-access` refuses, and nothing here counts them —
    // every assertion is scoped to one file's own id.
    await getDb().deleteFrom('accounts').execute();
    admin = await signedIn('admin');
  });

  afterAll(closeDb);

  describe('who is refused', () => {
    it('answers an investor 404, leaving the file', async () => {
      const investor = await signedIn('investor');
      const id = await storedFile(0x112233ff, admin.id);

      const response = await callPost(id, { confirmName: id }, { cookie: investor.cookie });

      expect(response.status).toBe(404);
      expect(await fileCount()).toBe(1);
    });

    it('sends a caller with no session to sign in, leaving the file', async () => {
      const id = await storedFile(0x223344ff, admin.id);

      const response = await callPost(id, { confirmName: id });

      expect(response.status).toBe(303);
      expect(await fileCount()).toBe(1);
    });

    it('refuses a cross-origin post, leaving the file', async () => {
      const id = await storedFile(0x334455ff, admin.id);

      const response = await callPost(
        id,
        { confirmName: id },
        { cookie: admin.cookie, origin: 'https://elsewhere.test' },
      );

      expect(response.status).toBe(403);
      expect(await fileCount()).toBe(1);
    });
  });

  describe('the typed name is checked again here', () => {
    it('refuses a name that is not the id, leaving the file', async () => {
      const id = await storedFile(0x445566ff, admin.id);

      const response = await callPost(id, { confirmName: 'something else' }, { cookie: admin.cookie });

      expect(response.status).toBe(400);
      expect(await fileCount()).toBe(1);
    });

    it('refuses a body with no name at all, which is what a direct post carries', async () => {
      const id = await storedFile(0x556677ff, admin.id);

      const response = await callPost(id, {}, { cookie: admin.cookie });

      expect(response.status).toBe(400);
      expect(await fileCount()).toBe(1);
    });

    it('refuses a body that is not an object', async () => {
      const id = await storedFile(0x667788ff, admin.id);

      const response = await callPost(id, 'not json at all', { cookie: admin.cookie });

      expect(response.status).toBe(400);
      expect(await fileCount()).toBe(1);
    });
  });

  describe('deleting, and being refused', () => {
    it('deletes a file nothing points at, and audits it', async () => {
      const id = await storedFile(0x778899ff, admin.id);

      const response = await callPost(id, { confirmName: id }, { cookie: admin.cookie });

      expect(response.status).toBe(200);
      expect(await fileCount()).toBe(0);

      const audit = await getDb()
        .selectFrom('audit')
        .select(['action', 'actor_id'])
        .where('subject_id', '=', id)
        .execute();
      expect(audit).toEqual([{ action: 'media.delete', actor_id: admin.id }]);
    });

    it('refuses while an item points at it, and names the item rather than its id', async () => {
      const id = await storedFile(0x8899aaff, admin.id);
      const item = await createItem({
        type: 'update',
        slug: `uses-${crypto.randomUUID()}`,
        title: 'The Q3 letter',
        kind: 'progress',
        audience: 'public',
      });
      await getDb().insertInto('media_refs').values({ media_id: id, item_id: item.id }).execute();

      const response = await callPost(id, { confirmName: id }, { cookie: admin.cookie });

      expect(response.status).toBe(409);
      const body = (await response.json()) as { usedBy: string[] };
      // A title, not a uuid: an admin cannot tell from an id what they nearly
      // broke, which is the whole point of the refusal (`CMS-003` section 3).
      expect(body.usedBy).toEqual(['The Q3 letter']);
      expect(await fileCount()).toBe(1);
    });
  });

  describe('the reads the library surface is built on', () => {
    it('lists what is stored, newest first, with the uploader and the use count', async () => {
      const older = await storedFile(0x99aabbff, admin.id);
      const newer = await storedFile(0xaabbccff, admin.id);
      const item = await createItem({
        type: 'update',
        slug: `uses-${crypto.randomUUID()}`,
        title: 'A letter',
        kind: 'progress',
        audience: 'public',
      });
      await getDb().insertInto('media_refs').values({ media_id: older, item_id: item.id }).execute();

      const files = await libraryContents();

      expect(files.map((file) => file.id)).toEqual([newer, older]);
      expect(files.map((file) => file.usedBy)).toEqual([0, 1]);
      expect(files[0]?.mime).toBe('image/png');
      expect(files[0]?.byteSize).toBeGreaterThan(0);
      expect(files[0]?.uploadedBy).toBe('admin');
    });

    it('keeps a file listed after its uploader is erased, with nobody named', async () => {
      const other = await signedIn('admin');
      const id = await storedFile(0xbbccddff, other.id);

      await getDb().deleteFrom('accounts').where('id', '=', other.id).execute();

      const [file] = await libraryContents();
      // `uploaded_by` is set null on erasure (`DATA-002`), and the file is the
      // company's rather than the person's, so it stays and says so.
      expect(file?.id).toBe(id);
      expect(file?.uploadedBy).toBeNull();
    });

    it('names nothing for a file nothing uses', async () => {
      const id = await storedFile(0xccddeeff, admin.id);

      expect(await itemsUsing(id)).toEqual([]);
    });
  });
});
