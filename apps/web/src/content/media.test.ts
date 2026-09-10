/**
 * The media store (`CMS-003/T1`, `T4`, `T7`).
 *
 * `sniffType` is pure and runs everywhere. The store and the delete guard read
 * and write a real PostgreSQL — "a duplicate upload is one row" and "deletion is
 * refused while a reference exists" are claims about what the database does under
 * a unique key and a cascading foreign key, which a stub would only restate, and
 * both have a concurrency edge a sequential test cannot reach.
 *
 * It runs against a database of its own. The delete guard locks a row and races
 * a reference insert against it; isolation keeps another suite's rows from
 * perturbing what these tests count and serialise.
 */

import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import { deleteMedia, sniffType, storeMedia } from './media';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_media';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const BOM = String.fromCharCode(0xfeff);

describe('sniffType reads the type from the bytes (CMS-003/T1)', () => {
  it('recognises png, jpeg, webp and pdf by their signatures', () => {
    expect(sniffType(PNG)).toBe('image/png');
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe('image/jpeg');
    expect(
      sniffType(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0])),
    ).toBe('image/webp');
    expect(sniffType(Buffer.from('%PDF-1.7\n%âãÏÓ\n'))).toBe('application/pdf');
  });

  it('recognises an svg past an xml declaration, comments, whitespace and a BOM', () => {
    expect(sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(
      'image/svg+xml',
    );
    expect(sniffType(Buffer.from('<?xml version="1.0"?>\n<svg></svg>'))).toBe('image/svg+xml');
    expect(sniffType(Buffer.from('  \n<!-- a note -->\n<svg />'))).toBe('image/svg+xml');
    expect(sniffType(Buffer.from(`${BOM}<svg></svg>`))).toBe('image/svg+xml');
  });

  it('refuses anything outside the accepted set', () => {
    expect(sniffType(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull(); // GIF89a
    expect(sniffType(Buffer.from('just some prose, not a file'))).toBeNull();
    expect(sniffType(Buffer.from([]))).toBeNull();
    // An <svg> that is not the document root is not an SVG file.
    expect(sniffType(Buffer.from('<html><body><svg></svg></body></html>'))).toBeNull();
  });
});

describe.skipIf(!HAS_DATABASE)('the media store against a real database', () => {
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
    // Deleting the media rows cascades media_refs; accounts and content_items
    // accumulate harmlessly in this suite's own database.
    await getDb().deleteFrom('media').execute();
  });

  afterAll(closeDb);

  /** A real account, because media.uploaded_by is a foreign key to accounts(id). */
  async function anAccount(): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({
        email: `${randomUUID()}@media.test`,
        name: 'Media Admin',
        role: 'admin',
        state: 'active',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** A real content item, because media_refs.item_id is a foreign key to it. */
  async function aContentItem(): Promise<string> {
    const row = await getDb()
      .insertInto('content_items')
      .values({ type: 'deck', slug: randomUUID(), title: 'Holds a reference' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** As many established connections as a race is about to need, before it starts. */
  async function warmConnections(count: number): Promise<void> {
    await Promise.all(Array.from({ length: count }, () => sql`select 1`.execute(getDb())));
  }

  const bytesFor = (marker: string): Buffer => Buffer.concat([PNG, Buffer.from(marker)]);

  describe('storing by content hash (CMS-003/T4)', () => {
    it('stores the bytes under their sha256, with the type and uploader', async () => {
      const uploader = await anAccount();
      const bytes = bytesFor('one');

      const { id, deduped } = await storeMedia(bytes, 'image/png', uploader);
      expect(deduped).toBe(false);

      const row = await getDb()
        .selectFrom('media')
        .select(['sha256', 'mime', 'byte_size', 'uploaded_by'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();

      expect(row.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(row.mime).toBe('image/png');
      expect(row.byte_size).toBe(String(bytes.length));
      expect(row.uploaded_by).toBe(uploader);
    });

    it('returns the existing row for the same bytes, a duplicate being one row', async () => {
      const uploader = await anAccount();
      const bytes = bytesFor('dup');

      const first = await storeMedia(bytes, 'image/png', uploader);
      const second = await storeMedia(bytes, 'image/png', await anAccount());

      expect(second.id).toBe(first.id);
      expect(second.deduped).toBe(true);
      expect(await getDb().selectFrom('media').select('id').execute()).toHaveLength(1);
    });

    it('keeps different bytes as different rows', async () => {
      const uploader = await anAccount();
      const a = await storeMedia(bytesFor('a'), 'image/png', uploader);
      const b = await storeMedia(bytesFor('b'), 'image/png', uploader);

      expect(a.id).not.toBe(b.id);
      expect(await getDb().selectFrom('media').select('id').execute()).toHaveLength(2);
    });

    it('settles on one row when the same bytes are stored at once', async () => {
      const uploader = await anAccount();
      const bytes = bytesFor('race');
      await warmConnections(2);

      const [a, b] = await Promise.all([
        storeMedia(bytes, 'image/png', uploader),
        storeMedia(bytes, 'image/png', uploader),
      ]);

      expect(a.id).toBe(b.id);
      expect(await getDb().selectFrom('media').select('id').execute()).toHaveLength(1);
    });
  });

  describe('deleting, refused while referenced (CMS-003/T7)', () => {
    const auditsFor = (mediaId: string) =>
      getDb()
        .selectFrom('audit')
        .select(['actor_id', 'subject_type', 'subject_id'])
        .where('action', '=', 'media.delete')
        .where('subject_id', '=', mediaId)
        .execute();

    it('deletes an unreferenced file and audits it', async () => {
      const actor = await anAccount();
      const { id } = await storeMedia(bytesFor('del'), 'image/png', actor);

      expect(await deleteMedia(id, actor)).toEqual({ ok: true });

      expect(
        await getDb().selectFrom('media').select('id').where('id', '=', id).executeTakeFirst(),
      ).toBeUndefined();

      const audits = await auditsFor(id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toEqual({ actor_id: actor, subject_type: 'media', subject_id: id });
    });

    it('refuses while a reference exists, naming the items, and writes nothing', async () => {
      const actor = await anAccount();
      const item = await aContentItem();
      const { id } = await storeMedia(bytesFor('ref'), 'image/png', actor);
      await getDb().insertInto('media_refs').values({ media_id: id, item_id: item }).execute();

      expect(await deleteMedia(id, actor)).toEqual({ ok: false, referencedBy: [item] });

      // Nothing deleted, nothing recorded.
      expect(
        await getDb().selectFrom('media').select('id').where('id', '=', id).executeTakeFirst(),
      ).not.toBeUndefined();
      expect(await auditsFor(id)).toHaveLength(0);
    });

    it('is a no-op for an id no row holds, writing nothing', async () => {
      const absent = randomUUID();
      expect(await deleteMedia(absent, await anAccount())).toEqual({ ok: true });
      expect(await auditsFor(absent)).toHaveLength(0);
    });

    it('never deletes a file while a reference for it is being added', async () => {
      const actor = await anAccount();
      const item = await aContentItem();
      const { id } = await storeMedia(bytesFor('race-del'), 'image/png', actor);
      await warmConnections(2);

      // One adds a reference; the other deletes. The FOR UPDATE lock serialises
      // them: the reference lands first and the delete is refused, or the delete
      // commits first and the reference insert fails against the row it removed.
      const [refAdd, del] = await Promise.allSettled([
        getDb().insertInto('media_refs').values({ media_id: id, item_id: item }).execute(),
        deleteMedia(id, actor),
      ]);

      const refAdded = refAdd.status === 'fulfilled';
      const deleted = del.status === 'fulfilled' && del.value.ok === true;

      // The guarantee CMS-003 §Deleting makes: a referenced file is never deleted,
      // so the reference landing and the delete succeeding are never both true.
      expect(refAdded && deleted).toBe(false);
    });
  });
});
