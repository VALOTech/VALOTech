/**
 * The update stream (`POST-002/T1`, `T2`, `T3`, `T4`, `CMS-R03`, `DATA-R05`).
 *
 * Four properties, each of which fails in a way a caller does not see. The read
 * is scoped by the reader through the one predicate, so an investor-only update
 * does not reach the market and a public update does reach the people it was
 * written for (T1, T4). Paging is by keyset, so an update published while a
 * reader is between pages does not silently drop the entry beneath it (T2). And
 * the order is by publication, not creation, so a note drafted early and
 * published late lands where the reader looks for it (T3). All are claims about
 * what the database returns for a given reader, so the suite runs against a real
 * PostgreSQL on a database of its own and drives `updateStream`, not a copy of
 * its query.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';

import type { Block } from './blocks';
import { addGrant } from './grants';
import { createItem, saveDraft } from './items';
import { publish } from './publish';
import { STREAM_PAGE_SIZE, type StreamPage, updateStream } from './stream';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_content_stream';

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

const heading = (text: string): Block[] => [{ type: 'heading', level: 2, text }];

// Enough public updates that a page does not hold them all, so keyset paging is
// exercised across a real page boundary rather than asserted on a single page.
const BULK_PUBLIC = STREAM_PAGE_SIZE + 2;

describe.skipIf(!HAS_DATABASE)('the update stream (POST-002/T1, T2, T3, T4)', () => {
  let admin: Actor;
  let investorA: Actor;
  let investorB: Actor;

  let yId = ''; // created first, published last  -> newest by publication
  let xId = ''; // created second, published first -> older by publication
  let investorUpdateId = '';
  let grantedUpdateId = '';
  const bulkIds: string[] = [];

  async function account(email: string, role: Actor['role']): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name: email, role, state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
  }

  async function publishedUpdate(
    slug: string,
    audience: 'public' | 'investor' | 'granted',
    text: string,
  ): Promise<string> {
    const item = await createItem({ type: 'update', slug: `${slug}-${randomUUID()}`, title: slug, kind: 'progress', audience });
    const revision = await saveDraft(item.id, heading(text), admin.id);
    await publish(item.id, revision.id, admin.id);
    return item.id;
  }

  function ids(page: StreamPage): string[] {
    return page.entries.map((entry) => entry.item.id);
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

    admin = await account('stream-admin@example.test', 'admin');
    investorA = await account('stream-investor-a@example.test', 'investor');
    investorB = await account('stream-investor-b@example.test', 'investor');

    // The bulk of the public feed, oldest publications first.
    for (let n = 0; n < BULK_PUBLIC; n += 1) {
      bulkIds.push(await publishedUpdate(`bulk-${n}`, 'public', `bulk update ${n}`));
    }

    // A report, to prove the type filter: it is published and public but is not an update.
    const report = await createItem({ type: 'report', slug: `rep-${randomUUID()}`, title: 'A report', period: '2026-Q1', audience: 'public' });
    const reportRev = await saveDraft(report.id, heading('a quarterly report'), admin.id);
    await publish(report.id, reportRev.id, admin.id);

    // Y is created before X but published after it: publication order, not
    // creation order, is what the stream must sort by (T3).
    const yItem = await createItem({ type: 'update', slug: `y-${randomUUID()}`, title: 'Y', kind: 'progress', audience: 'public' });
    const xItem = await createItem({ type: 'update', slug: `x-${randomUUID()}`, title: 'X', kind: 'progress', audience: 'public' });
    const xRev = await saveDraft(xItem.id, heading('x update'), admin.id);
    await publish(xItem.id, xRev.id, admin.id);
    const yRev = await saveDraft(yItem.id, heading('y update'), admin.id);
    await publish(yItem.id, yRev.id, admin.id);
    xId = xItem.id;
    yId = yItem.id;

    // Published last, so newest: they lead every entitled reader's first page.
    investorUpdateId = await publishedUpdate('inv', 'investor', 'investor update');
    grantedUpdateId = await publishedUpdate('gr', 'granted', 'granted update');
    await addGrant(grantedUpdateId, investorA.id, admin.id);
  }, 120_000);

  afterAll(closeDb);

  describe('audience scopes the feed through visibleTo (T1, T4)', () => {
    it('shows a visitor only public updates, and never the investor or granted one', async () => {
      const first = await updateStream(null);
      const second = await updateStream(null, first.nextCursor ?? undefined);
      const seen = new Set([...ids(first), ...ids(second)]);

      expect(seen.has(investorUpdateId)).toBe(false);
      expect(seen.has(grantedUpdateId)).toBe(false);
      // Every public update is reachable across the visitor's pages.
      for (const id of [...bulkIds, xId, yId]) {
        expect(seen.has(id)).toBe(true);
      }
    });

    it('shows an investor the investor update, and a grantee also the granted one', async () => {
      const forB = ids(await updateStream(investorB));
      expect(forB).toContain(investorUpdateId);
      expect(forB).not.toContain(grantedUpdateId);

      const forA = ids(await updateStream(investorA));
      expect(forA).toContain(investorUpdateId);
      expect(forA).toContain(grantedUpdateId);

      const forAdmin = ids(await updateStream(admin));
      expect(forAdmin).toContain(investorUpdateId);
      expect(forAdmin).toContain(grantedUpdateId);
    });

    it('never includes a report — the feed is updates only', async () => {
      const forAdmin = await updateStream(admin);
      const second = await updateStream(admin, forAdmin.nextCursor ?? undefined);
      const third = await updateStream(admin, second.nextCursor ?? undefined);
      const everyType = new Set(
        [...forAdmin.entries, ...second.entries, ...third.entries].map((entry) => entry.item.type),
      );
      expect([...everyType]).toEqual(['update']);
    });
  });

  describe('order is by publication, not creation (T3)', () => {
    it('places the later-published update first, though it was created earlier', async () => {
      const first = ids(await updateStream(null));
      // Y was created before X but published after it; publication order wins.
      expect(first[0]).toBe(yId);
      expect(first[1]).toBe(xId);
      expect(first.indexOf(yId)).toBeLessThan(first.indexOf(xId));
    });
  });

  describe('paging is by keyset on (published_at, id) (T2)', () => {
    it('returns a full first page with a cursor, then the remainder with none', async () => {
      const first = await updateStream(null);
      expect(first.entries).toHaveLength(STREAM_PAGE_SIZE);
      expect(first.nextCursor).not.toBeNull();

      const second = await updateStream(null, first.nextCursor ?? undefined);
      // BULK_PUBLIC + X + Y public updates in total, so the second page holds the rest.
      expect(second.entries).toHaveLength(BULK_PUBLIC + 2 - STREAM_PAGE_SIZE);
      expect(second.nextCursor).toBeNull();
    });

    it('does not repeat or skip an entry across the boundary, and stays ordered', async () => {
      const first = await updateStream(null);
      const second = await updateStream(null, first.nextCursor ?? undefined);
      const all = [...ids(first), ...ids(second)];

      expect(new Set(all).size).toBe(all.length); // no repeat
      expect(all).toHaveLength(BULK_PUBLIC + 2); // every public update, once

      const times = [...first.entries, ...second.entries].map((entry) => entry.publishedAt.getTime());
      const descending = [...times].sort((a, b) => b - a);
      expect(times).toEqual(descending);
    });

    it('an update published after the first page was read does not shift the second', async () => {
      const first = await updateStream(null);
      // A brand-new public update, newer than anything on the first page.
      await publishedUpdate('late', 'public', 'a late arrival');

      const second = await updateStream(null, first.nextCursor ?? undefined);
      // The cursor is older than the new update, so the second page is unchanged:
      // the new arrival belongs on a fresh first page, not spliced into this one.
      expect(second.entries).toHaveLength(BULK_PUBLIC + 2 - STREAM_PAGE_SIZE);
      expect(ids(second)).not.toContain(first.entries[STREAM_PAGE_SIZE - 1]?.item.id);
    });
  });
});
