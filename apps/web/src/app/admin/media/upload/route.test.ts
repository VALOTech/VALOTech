/**
 * The upload route against a real PostgreSQL (`CMS-003/T9`).
 *
 * Three classes of claim. **Who is refused** — an investor with a live session
 * gets the `404` the console gives a guess, a caller with no session is sent to
 * sign in, and a cross-origin post is refused before anything else; each asserted
 * together with nothing having been stored, because a refusal that stored the file
 * anyway is the failure that looks like a refusal. **What is refused** — no file,
 * an empty one, one over the cap, a kind the library does not take, and the case
 * the filename cannot decide: bytes of one kind wearing another kind's name.
 * **That an accepted upload is the whole act** — one row, attributed to the admin
 * who posted, holding the store's own output rather than the bytes that arrived,
 * and a second upload of the same file answering that it is already there.
 *
 * On a database of its own, so the row counts are exactly what this suite wrote.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Jimp } from 'jimp';
import { runner } from 'node-pg-migrate';
import { PDFDocument } from 'pdf-lib';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { issue, tokenOfCookie } from '../../../../auth/session';
import { closeDb, getDb } from '../../../../db/index';
import type { AccountRole } from '../../../../db/types';
import { MAX_UPLOAD_BYTES } from '../../../../content/upload-limits';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_media_upload';

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
  'migrations',
);

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);

const SUITE_DOMAIN = '@media-upload.test';

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

/** A real PNG the store can decode, distinct per colour. */
async function png(colour: number): Promise<Buffer> {
  return new Jimp({ width: 8, height: 6, color: colour }).getBuffer('image/png');
}

/**
 * A GIF the decoder can genuinely read. It matters that this decodes: a
 * malformed file is refused by the decoder whatever the sniff decided, so a
 * fixture that cannot be read proves nothing about which of the two turned it
 * away.
 */
async function gif(): Promise<Buffer> {
  return new Jimp({ width: 6, height: 4, color: 0x99aabbff }).getBuffer('image/gif');
}

async function onePagePdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([120, 120]);

  return Buffer.from(await document.save());
}

async function storedRows() {
  return getDb().selectFrom('media').select(['id', 'mime', 'uploaded_by', 'bytes']).execute();
}

function callPost(
  file: { bytes: Buffer; name: string } | null,
  options: { cookie?: string; origin?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.cookie !== undefined) {
    headers['Cookie'] = options.cookie;
  }
  if (options.origin !== undefined) {
    headers['Origin'] = options.origin;
  }

  const body = new FormData();
  if (file !== null) {
    body.set('file', new File([new Uint8Array(file.bytes)], file.name));
  }

  return POST(new Request(`${ORIGIN}/admin/media/upload`, { method: 'POST', headers, body }));
}

describe.skipIf(!HAS_DATABASE)('POST /admin/media/upload', () => {
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
    await getDb().deleteFrom('media').execute();
    await getDb().deleteFrom('accounts').execute();
    admin = await signedIn('admin');
  });

  afterAll(closeDb);

  describe('who is refused', () => {
    it('answers an investor 404, and stores nothing', async () => {
      const investor = await signedIn('investor');

      const response = await callPost({ bytes: await png(0x112233ff), name: 'a.png' }, { cookie: investor.cookie });

      expect(response.status).toBe(404);
      expect(await storedRows()).toHaveLength(0);
    });

    it('sends a caller with no session to sign in, and stores nothing', async () => {
      const response = await callPost({ bytes: await png(0x223344ff), name: 'a.png' });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in');
      expect(await storedRows()).toHaveLength(0);
    });

    it('refuses a cross-origin post before it reads anything, and stores nothing', async () => {
      const response = await callPost(
        { bytes: await png(0x334455ff), name: 'a.png' },
        { cookie: admin.cookie, origin: 'https://elsewhere.test' },
      );

      expect(response.status).toBe(403);
      expect(await storedRows()).toHaveLength(0);
    });
  });

  describe('what is refused', () => {
    it('refuses a request carrying no file', async () => {
      const response = await callPost(null, { cookie: admin.cookie });

      expect(response.status).toBe(400);
      expect(await storedRows()).toHaveLength(0);
    });

    it('refuses an empty file', async () => {
      const response = await callPost({ bytes: Buffer.alloc(0), name: 'empty.png' }, { cookie: admin.cookie });

      expect(response.status).toBe(400);
      expect(await storedRows()).toHaveLength(0);
    });

    it('refuses a file over the cap, by its bytes rather than its header', async () => {
      // A real PNG padded past the limit: it is refused for its size, and the
      // size is the one the body actually carries rather than the one a
      // Content-Length written by the uploader would claim.
      const oversize = Buffer.concat([await png(0x445566ff), Buffer.alloc(MAX_UPLOAD_BYTES)]);

      const response = await callPost({ bytes: oversize, name: 'big.png' }, { cookie: admin.cookie });

      expect(response.status).toBe(413);
      expect(await storedRows()).toHaveLength(0);
    });

    it('refuses a kind the library does not take', async () => {
      const response = await callPost({ bytes: await gif(), name: 'a.gif' }, { cookie: admin.cookie });

      expect(response.status).toBe(415);
      expect(await storedRows()).toHaveLength(0);
    });

    it('refuses bytes wearing another kind name, which is what the sniff is for', async () => {
      // The filename says PNG and the bytes say GIF, and this GIF decodes: a
      // route that trusted the name would hand it to the encoder, which would
      // read it happily and store it. So the refusal here can only be the
      // sniff's, which is the whole failure `CMS-003/T1` exists to prevent.
      const response = await callPost({ bytes: await gif(), name: 'innocent.png' }, { cookie: admin.cookie });

      expect(response.status).toBe(415);
      expect(await storedRows()).toHaveLength(0);
    });

    it('refuses a PNG signature with nothing decodable behind it', async () => {
      const notAPicture = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

      const response = await callPost({ bytes: notAPicture, name: 'a.png' }, { cookie: admin.cookie });

      expect(response.status).toBe(415);
      expect(await storedRows()).toHaveLength(0);
    });
  });

  describe('an accepted upload', () => {
    it('stores one row, attributed to the admin, holding the store output', async () => {
      const sent = await png(0x556677ff);

      const response = await callPost({ bytes: sent, name: 'chart.png' }, { cookie: admin.cookie });

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = (await response.json()) as { id: string; deduped: boolean; mime: string };
      expect(body.deduped).toBe(false);
      expect(body.mime).toBe('image/png');

      const rows = await storedRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.uploaded_by).toBe(admin.id);
      expect(rows[0]?.mime).toBe('image/png');
      expect(rows[0]?.id).toBe(body.id);
    });

    it('takes a PDF as well, and stores it without what it arrived with', async () => {
      const response = await callPost({ bytes: await onePagePdf(), name: 'report.pdf' }, { cookie: admin.cookie });

      expect(response.status).toBe(200);
      const rows = await storedRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.mime).toBe('application/pdf');
    });

    it('answers the same file twice as already there, leaving one row', async () => {
      const sent = await png(0x667788ff);

      const first = await callPost({ bytes: sent, name: 'once.png' }, { cookie: admin.cookie });
      const second = await callPost({ bytes: sent, name: 'again.png' }, { cookie: admin.cookie });

      expect(((await first.json()) as { deduped: boolean }).deduped).toBe(false);
      const body = (await second.json()) as { id: string; deduped: boolean };
      expect(body.deduped).toBe(true);
      expect(await storedRows()).toHaveLength(1);
    });

    it('accepts the session cookie the gate issues, signature and all', async () => {
      // The route reads the cookie through the same parser every surface shares,
      // so a token presented without its signature is no session here either
      // (`AUTH-002/T5`).
      const bare = tokenOfCookie(admin.cookie.slice(admin.cookie.indexOf('=') + 1));
      expect(bare).not.toBeNull();

      const response = await callPost(
        { bytes: await png(0x778899ff), name: 'a.png' },
        { cookie: `${admin.cookie.slice(0, admin.cookie.indexOf('='))}=${bare as string}` },
      );

      expect(response.status).toBe(303);
      expect(await storedRows()).toHaveLength(0);
    });
  });
});
