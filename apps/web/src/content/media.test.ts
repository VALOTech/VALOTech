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

import { Jimp } from 'jimp';
import { PDFDocument, PDFName } from 'pdf-lib';
import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import { deleteMedia, sniffType, storeMedia, UndecodableImageError } from './media';

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

/**
 * A real image of the given colour. The store decodes what it is handed, so a
 * fixture has to be a picture rather than a signature with a marker after it.
 */
async function imageOf(colour: number, mime: 'image/png' | 'image/jpeg' = 'image/png') {
  return new Jimp({ width: 8, height: 6, color: colour }).getBuffer(mime);
}

/**
 * A PDF carrying what a design tool leaves behind: an Info dictionary naming the
 * person and the machine, and an XMP packet on the catalogue and on the page,
 * since some tools write one of each.
 */
async function seededPdf(mark: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([200, 200]);
  document.setAuthor(`${mark} Lovelace`);
  document.setTitle(`${mark} board deck`);
  document.setCreator(`${mark} Designer 4.2`);
  document.setProducer(`${mark} Designer C:/Users/${mark}/Desktop/deck.pdf`);

  const key = PDFName.of('Metadata');
  const packet = (text: string) => document.context.register(document.context.stream(text, { Type: 'Metadata' }));
  document.catalog.set(key, packet(`<x:xmpmeta><photoshop:City>${mark}town</photoshop:City></x:xmpmeta>`));
  document.getPage(0).node.set(key, packet(`<x:xmpmeta>${mark}-per-page</x:xmpmeta>`));

  return Buffer.from(await document.save());
}

/**
 * The same image carrying an `APP1` segment of the kind a camera writes, with a
 * payload a test can look for. The segment sits where a decoder expects it —
 * immediately after the start-of-image marker — so the file is a valid JPEG that
 * happens to say where it was taken.
 */
function withExif(jpeg: Buffer, payload: string): Buffer {
  const body = Buffer.from(`Exif\u0000\u0000${payload}`);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(body.length + 2);

  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, body, jpeg.subarray(2)]);
}

describe('sniffType reads the type from the bytes (CMS-003/T1)', () => {
  it('recognises png, jpeg and pdf by their signatures', () => {
    expect(sniffType(PNG)).toBe('image/png');
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe('image/jpeg');
    expect(sniffType(Buffer.from('%PDF-1.7\n%âãÏÓ\n'))).toBe('application/pdf');
  });

  it('refuses a webp, which no encoder here can rewrite (CMS-DEC-06)', () => {
    // A well-formed WebP, refused for what cannot be done to it rather than for
    // what it is: `jimp` decodes no WebP, so accepting one would store the single
    // format whose metadata nothing strips.
    expect(
      sniffType(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0])),
    ).toBeNull();
  });

  it('refuses an svg in every form, since SVG is not accepted (CMS-DEC-03=A, CMS-003/T3)', () => {
    // SVG is refused rather than sanitised: none of these sniff to an accepted
    // type, whatever declaration, comment, whitespace or BOM precedes the <svg>,
    // and an <svg> that is not the document root was never a file either.
    expect(sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffType(Buffer.from('<?xml version="1.0"?>\n<svg></svg>'))).toBeNull();
    expect(sniffType(Buffer.from('  \n<!-- a note -->\n<svg />'))).toBeNull();
    expect(sniffType(Buffer.from(`${BOM}<svg></svg>`))).toBeNull();
    expect(sniffType(Buffer.from('<html><body><svg></svg></body></html>'))).toBeNull();
  });

  it('refuses anything outside the accepted set', () => {
    expect(sniffType(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull(); // GIF89a
    expect(sniffType(Buffer.from('just some prose, not a file'))).toBeNull();
    expect(sniffType(Buffer.from([]))).toBeNull();
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

  /** A distinct real PNG per marker, so two markers are two files. */
  const bytesFor = async (marker: string): Promise<Buffer> =>
    imageOf((marker.split('').reduce((n, c) => n * 31 + c.charCodeAt(0), 7) % 0xffffff) * 0x100 + 0xff);

  /** What a row actually holds, which after the re-encode is not what was sent. */
  async function storedBytes(id: string): Promise<Buffer> {
    const row = await getDb()
      .selectFrom('media')
      .select('bytes')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    return Buffer.from(row.bytes);
  }

  describe('storing by content hash (CMS-003/T4)', () => {
    it('stores the bytes under their sha256, with the type and uploader', async () => {
      const uploader = await anAccount();
      const bytes = await bytesFor('one');

      const { id, deduped } = await storeMedia(bytes, 'image/png', uploader);
      expect(deduped).toBe(false);

      const row = await getDb()
        .selectFrom('media')
        .select(['sha256', 'mime', 'byte_size', 'uploaded_by'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();

      // The hash is of what is stored, which is the encoder's output rather than
      // the upload: the row, its key and what a serve hands back are one file.
      const stored = await storedBytes(id);
      expect(row.sha256).toBe(createHash('sha256').update(stored).digest('hex'));
      expect(row.mime).toBe('image/png');
      expect(row.byte_size).toBe(String(stored.length));
      expect(row.uploaded_by).toBe(uploader);
    });

    it('returns the existing row for the same bytes, a duplicate being one row', async () => {
      const uploader = await anAccount();
      const bytes = await bytesFor('dup');

      const first = await storeMedia(bytes, 'image/png', uploader);
      const second = await storeMedia(bytes, 'image/png', await anAccount());

      expect(second.id).toBe(first.id);
      expect(second.deduped).toBe(true);
      expect(await getDb().selectFrom('media').select('id').execute()).toHaveLength(1);
    });

    it('keeps different bytes as different rows', async () => {
      const uploader = await anAccount();
      const a = await storeMedia(await bytesFor('a'), 'image/png', uploader);
      const b = await storeMedia(await bytesFor('b'), 'image/png', uploader);

      expect(a.id).not.toBe(b.id);
      expect(await getDb().selectFrom('media').select('id').execute()).toHaveLength(2);
    });

    it('settles on one row when the same bytes are stored at once', async () => {
      const uploader = await anAccount();
      const bytes = await bytesFor('race');
      await warmConnections(2);

      const [a, b] = await Promise.all([
        storeMedia(bytes, 'image/png', uploader),
        storeMedia(bytes, 'image/png', uploader),
      ]);

      expect(a.id).toBe(b.id);
      expect(await getDb().selectFrom('media').select('id').execute()).toHaveLength(1);
    });
  });

  describe('a raster is re-encoded before it is stored (CMS-003/T2)', () => {
    const MARK = 'GPS 51.5074N 0.1278W';

    it('stores a JPEG without the EXIF it arrived with', async () => {
      const uploader = await anAccount();
      const clean = await imageOf(0x88aa44ff, 'image/jpeg');
      const carrying = withExif(clean, MARK);

      // The fixture is the thing being tested, so it is checked first: a test
      // that silently stopped carrying the mark would pass for the wrong reason.
      expect(carrying.includes(MARK)).toBe(true);

      const { id } = await storeMedia(carrying, 'image/jpeg', uploader);
      const stored = await storedBytes(id);

      expect(stored.includes(MARK)).toBe(false);
      // Still a JPEG, and still the picture: the re-encode drops what is around
      // the pixels and keeps the pixels (`CMS-003` §3).
      expect(sniffType(stored)).toBe('image/jpeg');
      const decoded = await Jimp.read(stored);
      expect([decoded.bitmap.width, decoded.bitmap.height]).toEqual([8, 6]);
    });

    it('lands the same photo with and without its EXIF on one row', async () => {
      const uploader = await anAccount();
      const clean = await imageOf(0x2255bbff, 'image/jpeg');
      const carrying = withExif(clean, MARK);

      expect(carrying.equals(clean)).toBe(false);

      const first = await storeMedia(carrying, 'image/jpeg', uploader);
      const second = await storeMedia(clean, 'image/jpeg', uploader);

      // The strongest statement the store can make about the strip: the two
      // uploads differed only in the metadata, and after the re-encode they are
      // the same file. A strip that left any of it behind would be two rows.
      expect(second.id).toBe(first.id);
      expect(second.deduped).toBe(true);
    });

    it('refuses bytes that sniff as a raster and do not decode, storing nothing', async () => {
      const uploader = await anAccount();
      const before = await getDb().selectFrom('media').select('id').execute();

      // A PNG signature with nothing behind it is not a picture. Storing it
      // unread would store exactly the payload the re-encode exists to drop, so
      // the store refuses rather than passing it through (`DATA-R02`).
      await expect(storeMedia(PNG, 'image/png', uploader)).rejects.toThrow(UndecodableImageError);

      expect(await getDb().selectFrom('media').select('id').execute()).toHaveLength(before.length);
    });

    it('names the type and never the bytes when it refuses', async () => {
      const uploader = await anAccount();
      const secret = 'a-caption-nobody-should-repeat';
      const bytes = Buffer.concat([PNG, Buffer.from(secret)]);

      const refusal = storeMedia(bytes, 'image/png', uploader);

      await expect(refusal).rejects.toThrow(/image\/png/);
      // A refusal is reported and what is reported is logged, so the file's own
      // content must not be in the message (`DATA-R02`).
      await expect(refusal).rejects.not.toThrow(new RegExp(secret));
    });

    it('refuses bytes that sniff as a PDF and will not parse, storing nothing', async () => {
      const uploader = await anAccount();
      const before = await getDb().selectFrom('media').select('id').execute();

      await expect(
        storeMedia(Buffer.from('%PDF-1.7\nnot really a document'), 'application/pdf', uploader),
      ).rejects.toThrow(UndecodableImageError);

      expect(await getDb().selectFrom('media').select('id').execute()).toHaveLength(before.length);
    });
  });

  describe('a PDF is stored without its metadata (CMS-003/T8)', () => {
    it('keeps the document and drops the Info dictionary and every XMP packet', async () => {
      const uploader = await anAccount();
      const pdf = await seededPdf('Ada');

      // The fixture is half the test: one that quietly stopped carrying the
      // metadata would pass while proving nothing.
      expect(pdf.includes('Adatown')).toBe(true);
      expect(pdf.includes('Ada-per-page')).toBe(true);

      const { id } = await storeMedia(pdf, 'application/pdf', uploader);
      const stored = await storedBytes(id);

      // Read as bytes, not only as structure. An unlinked XMP packet is invisible
      // to a structural read and still sits in the file for any text extractor to
      // find, which is the failure this task is shaped around.
      expect(stored.includes('Adatown')).toBe(false);
      expect(stored.includes('Ada-per-page')).toBe(false);
      expect(stored.includes('Lovelace')).toBe(false);
      expect(stored.includes('C:/Users')).toBe(false);

      // And read as structure, so the scrub is not merely a byte coincidence.
      const reloaded = await PDFDocument.load(stored, { updateMetadata: false });
      expect(reloaded.getAuthor()).toBeUndefined();
      expect(reloaded.getTitle()).toBeUndefined();
      expect(reloaded.getCreator()).toBeUndefined();
      expect(reloaded.getProducer()).toBeUndefined();
      expect(reloaded.catalog.get(PDFName.of('Metadata'))).toBeUndefined();

      // Still the document somebody uploaded.
      expect(sniffType(stored)).toBe('application/pdf');
      expect(reloaded.getPageCount()).toBe(1);
    });

    it('does not announce the tool that scrubbed it', async () => {
      const uploader = await anAccount();

      const { id } = await storeMedia(await seededPdf('Grace'), 'application/pdf', uploader);
      const stored = await storedBytes(id);

      // The library stamps its own name and a fresh timestamp into `/Producer` on
      // save unless told not to. A file that says which tool touched it and when
      // is metadata the upload did not arrive with.
      expect(stored.includes('pdf-lib')).toBe(false);
    });

    it('stores one row for the same document uploaded twice', async () => {
      const uploader = await anAccount();
      const pdf = await seededPdf('Hopper');

      const first = await storeMedia(pdf, 'application/pdf', uploader);
      const second = await storeMedia(pdf, 'application/pdf', uploader);

      // The scrub is deterministic, which is what keeps the hash a content key.
      // Two different documents scrubbed do not converge — their object layouts
      // differ — so this says the scrub is stable, not that metadata is all that
      // distinguishes two files.
      expect(second.id).toBe(first.id);
      expect(second.deduped).toBe(true);
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
      const { id } = await storeMedia(await bytesFor('del'), 'image/png', actor);

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
      const { id } = await storeMedia(await bytesFor('ref'), 'image/png', actor);
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
      const { id } = await storeMedia(await bytesFor('race-del'), 'image/png', actor);
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
