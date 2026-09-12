/**
 * Serving a stored file by its audience (`CMS-003/T5`, `T6`, `CMS-R06`).
 *
 * The property under test is member isolation on a file: an investor-only
 * screenshot must not reach anyone who has its URL, and a gated file must not be
 * marked cacheable, because a cached gated file is one a CDN serves to the next
 * person (`DATA-R05`, `CMS-R06`). That is a claim about what the database returns
 * for a given reader joined through `media_refs` and `content_items`, so it runs
 * against a real PostgreSQL — a fake would be a second copy of the audience rule
 * this design exists to have exactly one of.
 *
 * It drives the real route handler, not the query: the `404` that a refused read
 * and a missing file share, the cache header, and the bytes are all the handler's
 * to get right, and a test of the predicate alone would see none of them. A
 * database of its own keeps another suite's rows from perturbing what it counts.
 *
 * Every placed file is uploaded by `uploader` and read by others, so a placed
 * file that a reader may see is reached through the reference and never through
 * the uploader clause — the one exception is the unplaced file, which is how the
 * uploader clause itself is exercised.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Jimp } from 'jimp';

import { GET } from '../app/media/[id]/route';
import type { Actor } from '../auth/gate';
import { issue, sessionCookieName } from '../auth/session';
import { closeDb, getDb } from '../db/index';
import type { ContentAudience } from '../db/types';

import type { Block } from './blocks';
import { addGrant } from './grants';
import { createItem, saveDraft } from './items';
import type { AcceptedMime } from './media';
import { storeMedia } from './media';
import { publish } from './publish';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_media_serve';

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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Distinct bytes per fixture, so a body assertion tells the files apart. */
/** A distinct real image per marker: the store decodes what it is handed. */
const bytesFor = async (marker: string, mime: AcceptedMime): Promise<Buffer> =>
  mime === 'application/pdf'
    ? Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from(marker)])
    : new Jimp({
        width: 8,
        height: 6,
        color: (marker.split('').reduce((n, c) => n * 31 + c.charCodeAt(0), 7) % 0xffffff) * 0x100 + 0xff,
      }).getBuffer(mime === 'image/jpeg' ? 'image/jpeg' : 'image/png');

const heading = (text: string): Block[] => [{ type: 'heading', level: 2, text }];

/** What a row actually holds, which after the re-encode is not what was sent. */
async function storedBytes(id: string): Promise<Buffer> {
  const row = await getDb()
    .selectFrom('media')
    .select('bytes')
    .where('id', '=', id)
    .executeTakeFirstOrThrow();

  return Buffer.from(row.bytes);
}

/** A stored file and the facts a serve assertion reads about it. */
interface Fixture {
  mediaId: string;
  bytes: Buffer;
  mime: AcceptedMime;
}

describe.skipIf(!HAS_DATABASE)('GET /media/[id] serves by audience (CMS-003/T5, T6)', () => {
  let admin: Actor;
  let uploader: Actor;
  let investorA: Actor;
  let investorB: Actor;

  let adminCookie = '';
  let uploaderCookie = '';
  let investorACookie = '';
  let investorBCookie = '';

  const fx: Record<'public' | 'investor' | 'granted' | 'draft' | 'unplaced', Fixture> = {
    public: { mediaId: '', bytes: Buffer.alloc(0), mime: 'image/png' },
    investor: { mediaId: '', bytes: Buffer.alloc(0), mime: 'application/pdf' },
    granted: { mediaId: '', bytes: Buffer.alloc(0), mime: 'image/jpeg' },
    draft: { mediaId: '', bytes: Buffer.alloc(0), mime: 'image/png' },
    unplaced: { mediaId: '', bytes: Buffer.alloc(0), mime: 'image/jpeg' },
  };

  async function account(email: string, role: Actor['role']): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name: email, role, state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
  }

  /** Store a file and tie it to a fresh item of the given audience. */
  async function placedFile(
    key: 'public' | 'investor' | 'granted' | 'draft',
    audience: ContentAudience,
    publishIt: boolean,
  ): Promise<void> {
    const fixture = fx[key];
    const item = await createItem({
      type: 'update',
      slug: `serve-${key}-${randomUUID()}`,
      title: key,
      kind: 'progress',
      audience,
    });
    const revision = await saveDraft(item.id, heading(key), admin.id);
    if (publishIt) {
      await publish(item.id, revision.id, admin.id);
    }

    const bytes = await bytesFor(key, fixture.mime);
    const { id } = await storeMedia(bytes, fixture.mime, uploader.id);
    await getDb().insertInto('media_refs').values({ media_id: id, item_id: item.id }).execute();

    fixture.mediaId = id;
    // What the row holds, not what was uploaded: a raster is re-encoded on the
    // way in (`CMS-003/T2`), and what a serve hands back is the stored file.
    fixture.bytes = await storedBytes(id);

    if (key === 'granted') {
      await addGrant(item.id, investorA.id, admin.id);
    }
  }

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

    admin = await account('serve-admin@example.test', 'admin');
    uploader = await account('serve-uploader@example.test', 'admin');
    investorA = await account('serve-investor-a@example.test', 'investor');
    investorB = await account('serve-investor-b@example.test', 'investor');

    adminCookie = (await issue(admin.id)).value;
    uploaderCookie = (await issue(uploader.id)).value;
    investorACookie = (await issue(investorA.id)).value;
    investorBCookie = (await issue(investorB.id)).value;

    await placedFile('public', 'public', true);
    await placedFile('investor', 'investor', true);
    await placedFile('granted', 'granted', true);
    await placedFile('draft', 'public', false);

    const unplacedBytes = await bytesFor('unplaced', fx.unplaced.mime);
    const { id: unplacedId } = await storeMedia(unplacedBytes, fx.unplaced.mime, uploader.id);
    fx.unplaced.mediaId = unplacedId;
    fx.unplaced.bytes = await storedBytes(unplacedId);
  }, 120_000);

  afterAll(closeDb);

  function get(id: string, cookie: string | null): Promise<Response> {
    const headers = new Headers();
    if (cookie !== null) {
      headers.set('Cookie', `${sessionCookieName()}=${cookie}`);
    }
    const request = new Request(`http://localhost:3100/media/${id}`, { headers });
    return GET(request, { params: Promise.resolve({ id }) });
  }

  async function bodyOf(response: Response): Promise<Buffer> {
    return Buffer.from(await response.arrayBuffer());
  }

  async function expectServed(response: Response, fixture: Fixture): Promise<void> {
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(fixture.mime);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await bodyOf(response)).toEqual(fixture.bytes);
  }

  describe("a public item's file", () => {
    it('serves it to a visitor, cacheable', async () => {
      const response = await get(fx.public.mediaId, null);
      await expectServed(response, fx.public);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=600');
      expect(response.headers.get('Content-Disposition')).toBe(
        `inline; filename="${fx.public.mediaId}.png"`,
      );
    });

    it('serves it to an investor and an admin', async () => {
      for (const token of [investorACookie, adminCookie]) {
        const response = await get(fx.public.mediaId, token);
        await expectServed(response, fx.public);
        // The route's own header is public; proxy.ts overlays no-store on a
        // cookie-bearing request in real HTTP (the HTTP verification asserts it).
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=600');
      }
    });
  });

  describe("an investor item's file", () => {
    it('is 404 to a visitor', async () => {
      expect((await get(fx.investor.mediaId, null)).status).toBe(404);
    });

    it('serves it, private and no-store, to an investor and an admin', async () => {
      for (const token of [investorACookie, adminCookie]) {
        const response = await get(fx.investor.mediaId, token);
        await expectServed(response, fx.investor);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
    });

    it('serves the stored type and a filename derived from it', async () => {
      const response = await get(fx.investor.mediaId, investorACookie);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');
      expect(response.headers.get('Content-Disposition')).toBe(
        `inline; filename="${fx.investor.mediaId}.pdf"`,
      );
    });
  });

  describe("a granted item's file", () => {
    it('serves it, no-store, to the grantee and an admin', async () => {
      for (const token of [investorACookie, adminCookie]) {
        const response = await get(fx.granted.mediaId, token);
        await expectServed(response, fx.granted);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
    });

    it('is 404 to a non-grantee investor and to a visitor', async () => {
      expect((await get(fx.granted.mediaId, investorBCookie)).status).toBe(404);
      expect((await get(fx.granted.mediaId, null)).status).toBe(404);
    });
  });

  describe('an unplaced file, referenced by nothing', () => {
    it('serves it, no-store, to its uploader', async () => {
      const response = await get(fx.unplaced.mediaId, uploaderCookie);
      await expectServed(response, fx.unplaced);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('is 404 to another admin, an investor and a visitor — the uploader, not any admin', async () => {
      for (const token of [adminCookie, investorACookie, null]) {
        expect((await get(fx.unplaced.mediaId, token)).status).toBe(404);
      }
    });
  });

  describe('a file referenced only by an unpublished item', () => {
    it('is 404 to a visitor and an investor, the item having no audience yet', async () => {
      expect((await get(fx.draft.mediaId, null)).status).toBe(404);
      expect((await get(fx.draft.mediaId, investorACookie)).status).toBe(404);
    });
  });

  describe('not found and not visible are one answer', () => {
    it('answers a non-existent id with 404', async () => {
      expect((await get(randomUUID(), null)).status).toBe(404);
    });

    it('answers a malformed id with 404, not a 500 from a uuid cast', async () => {
      expect((await get('not-a-uuid', null)).status).toBe(404);
    });

    it('answers an unreadable file byte-for-byte as it answers a missing one', async () => {
      const missing = await get(randomUUID(), null);
      const refused = await get(fx.investor.mediaId, null);

      expect(missing.status).toBe(404);
      expect(refused.status).toBe(404);
      expect(missing.headers.get('Cache-Control')).toBe(refused.headers.get('Cache-Control'));
      expect(await bodyOf(missing)).toEqual(await bodyOf(refused));
      expect((await bodyOf(missing)).length).toBe(0);
    });
  });
});
