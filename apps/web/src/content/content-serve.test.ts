/**
 * Serving a content item's body by its audience (`CMS-006/T4`, `T6`, `CMS-R02`,
 * `CMS-R03`, `DATA-R05`).
 *
 * The property under test is reader isolation on an item: an investor-only
 * update must not reach a visitor who has its URL, a granted deck must not reach
 * an investor it was not granted to, and a draft must reach nobody but its
 * author — none of which a template check would catch, because the rule is a
 * query predicate (`content/access.ts`'s `visibleTo`) and this proves what the
 * database returns for a given reader. So it runs against a real PostgreSQL; a
 * fake would be a second copy of the one rule this design exists to have exactly
 * one of.
 *
 * It drives the real route handler, not the query: the `404` a refused read and
 * a missing item share, the narrowed response shape, and the cache header are
 * all the handler's to get right, and a test of the predicate alone would see
 * none of them. A database of its own keeps another suite's rows from
 * perturbing what it counts.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET } from '../app/content/[id]/route';
import type { Actor } from '../auth/gate';
import { issue, sessionCookieName } from '../auth/session';
import { closeDb, getDb } from '../db/index';
import type { ContentAudience } from '../db/types';

import { changeAudience } from './audience';
import type { Block } from './blocks';
import { addGrant } from './grants';
import { createItem, saveDraft } from './items';
import { publish } from './publish';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_content_serve';

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

const blocksFor = (key: string): Block[] => [{ type: 'heading', level: 2, text: key }];

/** What one served body carries, once the route has narrowed it. */
interface ServedBody {
  id: string;
  blocks: Block[];
  publishedAt: string;
}

describe.skipIf(!HAS_DATABASE)('GET /content/[id] serves by audience (CMS-006/T4, T6)', () => {
  let admin: Actor;
  let investorA: Actor;
  let investorB: Actor;

  let adminToken = '';
  let investorAToken = '';
  let investorBToken = '';

  const itemId: Record<'public' | 'investor' | 'granted' | 'draft', string> = {
    public: '',
    investor: '',
    granted: '',
    draft: '',
  };

  async function account(email: string, role: Actor['role']): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name: email, role, state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
  }

  /** A fresh item of the given audience, its draft saved and — unless a draft — published. */
  async function makeItem(
    key: 'public' | 'investor' | 'granted' | 'draft',
    audience: ContentAudience,
    publishIt: boolean,
  ): Promise<string> {
    const item = await createItem({
      type: 'update',
      slug: `read-${key}-${randomUUID()}`,
      title: key,
      kind: 'progress',
      audience,
    });
    const revision = await saveDraft(item.id, blocksFor(key), admin.id);
    if (publishIt) {
      await publish(item.id, revision.id, admin.id);
    }
    if (key === 'granted') {
      await addGrant(item.id, investorA.id, admin.id);
    }
    return item.id;
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

    admin = await account('read-admin@example.test', 'admin');
    investorA = await account('read-investor-a@example.test', 'investor');
    investorB = await account('read-investor-b@example.test', 'investor');

    adminToken = (await issue(admin.id)).value;
    investorAToken = (await issue(investorA.id)).value;
    investorBToken = (await issue(investorB.id)).value;

    itemId.public = await makeItem('public', 'public', true);
    itemId.investor = await makeItem('investor', 'investor', true);
    itemId.granted = await makeItem('granted', 'granted', true);
    itemId.draft = await makeItem('draft', 'public', false);
  }, 120_000);

  afterAll(closeDb);

  function get(id: string, token: string | null): Promise<Response> {
    const headers = new Headers();
    if (token !== null) {
      headers.set('Cookie', `${sessionCookieName()}=${token}`);
    }
    const request = new Request(`http://localhost:3100/content/${id}`, { headers });
    return GET(request, { params: Promise.resolve({ id }) });
  }

  async function expectServed(response: Response, key: string): Promise<ServedBody> {
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const body = (await response.json()) as ServedBody;
    expect(body.blocks).toEqual(blocksFor(key));
    return body;
  }

  describe('a public item', () => {
    it('serves it to a visitor, cacheable, narrowed to id, blocks and published time', async () => {
      const response = await get(itemId.public, null);
      const body = await expectServed(response, 'public');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=600');
      expect(typeof body.id).toBe('string');
      expect(typeof body.publishedAt).toBe('string');
      // The staff identifier forReader carries on the row does not reach a reader.
      expect(body).not.toHaveProperty('author_id');
      expect(body).not.toHaveProperty('authorId');
    });

    it('serves it to an investor and an admin', async () => {
      for (const token of [investorAToken, adminToken]) {
        const response = await get(itemId.public, token);
        await expectServed(response, 'public');
        // The route's own header is public; proxy.ts overlays no-store on a
        // cookie-bearing request in real HTTP.
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=600');
      }
    });
  });

  describe('an investor item', () => {
    it('is 404 to a visitor', async () => {
      expect((await get(itemId.investor, null)).status).toBe(404);
    });

    it('serves it, private and no-store, to an investor and an admin', async () => {
      for (const token of [investorAToken, adminToken]) {
        const response = await get(itemId.investor, token);
        await expectServed(response, 'investor');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
    });
  });

  describe('a granted item', () => {
    it('serves it, no-store, to the grantee and an admin', async () => {
      for (const token of [investorAToken, adminToken]) {
        const response = await get(itemId.granted, token);
        await expectServed(response, 'granted');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
    });

    it('is 404 to a non-grantee investor and to a visitor', async () => {
      expect((await get(itemId.granted, investorBToken)).status).toBe(404);
      expect((await get(itemId.granted, null)).status).toBe(404);
    });
  });

  describe('a draft, with no published revision', () => {
    it('is 404 to its author, an investor and a visitor alike', async () => {
      for (const token of [adminToken, investorAToken, null]) {
        expect((await get(itemId.draft, token)).status).toBe(404);
      }
    });
  });

  describe('not found and not visible are one answer', () => {
    it('answers a non-existent id with 404', async () => {
      expect((await get(randomUUID(), null)).status).toBe(404);
    });

    it('answers a malformed id with 404, not a 500 from a uuid cast', async () => {
      expect((await get('not-a-uuid', null)).status).toBe(404);
    });

    it('answers an unreadable item byte-for-byte as it answers a missing one', async () => {
      const missing = await get(randomUUID(), null);
      const refused = await get(itemId.investor, null);

      expect(missing.status).toBe(404);
      expect(refused.status).toBe(404);
      expect(missing.headers.get('Cache-Control')).toBe(refused.headers.get('Cache-Control'));
      expect((await missing.text()).length).toBe(0);
      expect((await refused.text()).length).toBe(0);
    });
  });

  describe('narrowing an audience takes effect for the next read (CMS-006/T6)', () => {
    it('turns a public item investor-only: the visitor is refused and the cache follows', async () => {
      const id = await makeItem('public', 'public', true);
      // Renamed away from the fixture keys, so `expectServed` reads the body it saved.
      const servedKey = 'public';

      const before = await get(id, null);
      await expectServed(before, servedKey);
      expect(before.headers.get('Cache-Control')).toBe('public, max-age=600');

      await changeAudience(id, 'investor', admin.id);

      // A visitor may no longer read it, and an investor still may — now no-store.
      expect((await get(id, null)).status).toBe(404);
      const after = await get(id, investorAToken);
      await expectServed(after, servedKey);
      expect(after.headers.get('Cache-Control')).toBe('private, no-store');
    });
  });
});
