/**
 * What an item's blocks say about the files it uses (`CMS-001/T7`).
 *
 * `media_refs` is the row two different decisions read: whether a stored file may
 * be served to a reader (`CMS-003/T5`) and whether it may be deleted from the
 * library (`CMS-003/T7`). Both are wrong in a way nobody sees if the row and the
 * document disagree — a picture that renders nothing, or a file nothing will let
 * go of. So these tests are about agreement rather than about either read.
 *
 * Three claims, and the middle one is the subtle one. **A named file is
 * referenced**, so it can be served and cannot be deleted. **A dropped file stops
 * being referenced only when no revision names it** — dropping it from the open
 * draft is enough, because the save replaces that draft, and dropping it from a
 * new draft is not, because `withdraw` can make the published revision current
 * again and it would then show the file. **A file that is not stored is refused
 * at the save**, because a block pointing at nothing renders nothing and the
 * author is the last person who can still fix it.
 *
 * On a database of its own. The store is keyed by the bytes (`CMS-003/T4`), so on
 * a shared database a picture this suite writes is the same row a previous run
 * wrote — carrying that run's references with it, and making a file look
 * referenced before this run has referenced anything.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Jimp } from 'jimp';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import { createItem, saveDraft, UnknownMediaError } from './items';
import { deleteMedia, isReferencedByVisibleItem, storeMedia } from './media';
import { publish } from './publish';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_media_refs';

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

describe.skipIf(!HAS_DATABASE)('CMS-001/T7 — blocks and media_refs agree', () => {
  let authorId: string;

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
    const author = await getDb()
      .insertInto('accounts')
      .values({ email: 'author@media-refs.test', name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(closeDb);

  /** A stored file of its own: a distinct colour is distinct bytes, so no dedup. */
  async function storedFile(colour: number): Promise<string> {
    const bytes = await new Jimp({ width: 6, height: 4, color: colour }).getBuffer('image/png');
    const { id } = await storeMedia(bytes, 'image/png', authorId);

    return id;
  }

  async function newItem(title: string) {
    return createItem({ type: 'update', slug: `u-${randomUUID()}`, title, kind: 'progress' });
  }

  /** The files this item references, sorted so the comparison is about the set. */
  async function refsOf(itemId: string): Promise<string[]> {
    const rows = await getDb()
      .selectFrom('media_refs')
      .select('media_id')
      .where('item_id', '=', itemId)
      .execute();

    return rows.map((row) => row.media_id).sort();
  }

  function image(mediaId: string) {
    return { type: 'image', mediaId, alt: 'a labelled picture', caption: null };
  }

  describe('what a save writes', () => {
    it('references the file an image block names', async () => {
      const item = await newItem('One picture');
      const picture = await storedFile(0x112233ff);

      await saveDraft(item.id, [image(picture)], authorId);

      expect(await refsOf(item.id)).toEqual([picture]);
    });

    it('references a figure’s file too, and writes one row for a file named twice', async () => {
      const item = await newItem('A figure, twice');
      const chart = await storedFile(0x223344ff);

      await saveDraft(
        item.id,
        [
          { type: 'figure', mediaId: chart, caption: 'a chart', data: ['10', '20'] },
          image(chart),
        ],
        authorId,
      );

      expect(await refsOf(item.id)).toEqual([chart]);
    });

    it('matches a file whose id the author typed in capitals', async () => {
      const item = await newItem('Shouted id');
      const picture = await storedFile(0x334455ff);

      await saveDraft(item.id, [image(picture.toUpperCase())], authorId);

      expect(await refsOf(item.id)).toEqual([picture]);
    });

    it('references nothing for a document that names no file', async () => {
      const item = await newItem('Words only');

      await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'A heading' }], authorId);

      expect(await refsOf(item.id)).toEqual([]);
    });

    it('treats a block whose file is not chosen yet as naming nothing', async () => {
      const item = await newItem('An empty figure');

      // The editor's new figure block starts with no file (`CMS-002`), and a
      // draft is work in progress: an unchosen file is not a wrong one.
      await saveDraft(item.id, [{ type: 'figure', mediaId: '', caption: null, data: [''] }], authorId);

      expect(await refsOf(item.id)).toEqual([]);
    });
  });

  describe('what a save takes away', () => {
    it('drops the reference when the draft that named it is replaced, and the file can then go', async () => {
      const item = await newItem('Added then removed');
      const picture = await storedFile(0x445566ff);

      await saveDraft(item.id, [image(picture)], authorId);
      await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'No picture after all' }], authorId);

      expect(await refsOf(item.id)).toEqual([]);
      expect(await deleteMedia(picture, authorId)).toEqual({ ok: true });
    });

    it('keeps the reference a published revision made, because withdrawing brings it back', async () => {
      const item = await newItem('Published with a picture');
      const picture = await storedFile(0x556677ff);

      const published = await saveDraft(item.id, [image(picture)], authorId);
      await publish(item.id, published.id, authorId);
      await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'A later draft' }], authorId);

      // The published revision still names it, and `withdraw` can make that
      // revision current again (`CMS-004`), so the file is not free to go.
      expect(await refsOf(item.id)).toEqual([picture]);
      expect((await deleteMedia(picture, authorId)).ok).toBe(false);
    });

    it('exchanges one file for another in a single save', async () => {
      const item = await newItem('Swapped');
      const first = await storedFile(0x667788ff);
      const second = await storedFile(0x778899ff);

      await saveDraft(item.id, [image(first)], authorId);
      await saveDraft(item.id, [image(second)], authorId);

      expect(await refsOf(item.id)).toEqual([second]);
    });
  });

  describe('a file that is not stored', () => {
    it('refuses the save, naming the id, and writes neither revision nor reference', async () => {
      const item = await newItem('Names a ghost');
      const ghost = randomUUID();

      await expect(saveDraft(item.id, [image(ghost)], authorId)).rejects.toThrow(UnknownMediaError);

      expect(await refsOf(item.id)).toEqual([]);
      const revisions = await getDb()
        .selectFrom('content_revisions')
        .select('id')
        .where('item_id', '=', item.id)
        .execute();
      expect(revisions).toEqual([]);
    });

    it('refuses an id that is not a uuid at all, rather than raising on the cast', async () => {
      const item = await newItem('Names a typo');

      const refusal = await saveDraft(item.id, [image('not-an-id')], authorId).catch(
        (error: unknown) => error,
      );

      expect(refusal).toBeInstanceOf(UnknownMediaError);
      expect((refusal as UnknownMediaError).mediaIds).toEqual(['not-an-id']);
    });

    it('leaves the draft it already had untouched', async () => {
      const item = await newItem('Good then bad');
      const picture = await storedFile(0x8899aaff);

      await saveDraft(item.id, [image(picture)], authorId);
      await expect(saveDraft(item.id, [image(randomUUID())], authorId)).rejects.toThrow(
        UnknownMediaError,
      );

      expect(await refsOf(item.id)).toEqual([picture]);
      const [revision] = await getDb()
        .selectFrom('content_revisions')
        .select('blocks')
        .where('item_id', '=', item.id)
        .execute();
      expect(revision?.blocks).toEqual([image(picture)]);
    });
  });

  describe('what the reference then decides', () => {
    it('makes a public item’s file servable to a reader with no session', async () => {
      const item = await createItem({
        type: 'update',
        slug: `u-${randomUUID()}`,
        title: 'A public update',
        kind: 'announcement',
        audience: 'public',
      });
      const picture = await storedFile(0x99aabbff);

      const revision = await saveDraft(item.id, [image(picture)], authorId);
      expect(await isReferencedByVisibleItem(picture, null)).toBe(false);

      await publish(item.id, revision.id, authorId);

      // Nothing about the file changed; what changed is that an item a reader
      // may read now names it.
      expect(await isReferencedByVisibleItem(picture, null)).toBe(true);
    });
  });
});
