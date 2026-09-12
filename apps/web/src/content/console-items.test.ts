/**
 * What the console lists, and in what order (`CMS-002/T8`).
 *
 * The list is how an admin finds the thing they were working on, so the two
 * claims worth pinning are that **the order is the read's** — most recently
 * changed first, and a revision counts as a change — and that **published and
 * drafted are two independent facts**. An item can be published and carry later
 * work nobody has seen, and a list that collapsed the pair into one word would
 * hide exactly the row an author came for.
 *
 * On a database of its own, because this read is the one that is not scoped to
 * anything: it answers with every item there is, so a shared development
 * database would answer with every other suite's items too.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import { createItem, itemsForConsole, saveDraft } from './items';
import { seedLocale, markReviewed } from './locales';
import { publish } from './publish';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_console_items';

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

describe.skipIf(!HAS_DATABASE)('CMS-002/T8 — what the console lists', () => {
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
      .values({ email: 'author@console-items.test', name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(closeDb);

  async function clear(): Promise<void> {
    await getDb().deleteFrom('content_locales').execute();
    await getDb().deleteFrom('content_items').execute();
  }

  const words = [{ type: 'heading' as const, level: 2 as const, text: 'Something' }];

  it('is empty before anything is written', async () => {
    await clear();

    expect(await itemsForConsole()).toEqual([]);
  });

  it('lists an item with nothing written yet, and says a reader sees nothing', async () => {
    await clear();
    const item = await createItem({
      type: 'update',
      slug: `u-${randomUUID()}`,
      title: 'Just begun',
      kind: 'progress',
    });

    const [listed] = await itemsForConsole();

    expect(listed).toMatchObject({
      id: item.id,
      type: 'update',
      title: 'Just begun',
      audience: 'investor',
      kind: 'progress',
      period: null,
      published: false,
      hasOpenDraft: false,
      reviewedLocales: 0,
    });
  });

  it('holds published and drafted apart, so later work is visible beside a live item', async () => {
    await clear();
    const item = await createItem({
      type: 'report',
      slug: `r-${randomUUID()}`,
      title: 'The quarter',
      period: '2026-Q3',
      audience: 'public',
    });

    const first = await saveDraft(item.id, words, authorId);
    expect((await itemsForConsole())[0]).toMatchObject({ published: false, hasOpenDraft: true });

    await publish(item.id, first.id, authorId);
    expect((await itemsForConsole())[0]).toMatchObject({ published: true, hasOpenDraft: false });

    await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'Later' }], authorId);
    // Both at once is the state the pair exists for: a reader sees the published
    // revision while an author has newer words nobody has been shown.
    expect((await itemsForConsole())[0]).toMatchObject({ published: true, hasOpenDraft: true });
  });

  it('counts the languages a reader could be served, and not the ones merely started', async () => {
    await clear();
    const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Translated', kind: 'progress' });
    await saveDraft(item.id, words, authorId);

    await seedLocale(item.id, 'vi');
    expect((await itemsForConsole())[0]).toMatchObject({ reviewedLocales: 0 });

    await markReviewed(item.id, 'vi', [['Điều gì đó']], authorId);
    expect((await itemsForConsole())[0]).toMatchObject({ reviewedLocales: 1 });
  });

  it('puts the most recently changed first, counting a saved revision as a change', async () => {
    await clear();
    const older = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Older', kind: 'progress' });
    const newer = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Newer', kind: 'progress' });

    expect((await itemsForConsole()).map((entry) => entry.title)).toEqual(['Newer', 'Older']);

    // Writing into the older one makes it the thing somebody was last working on.
    await saveDraft(older.id, words, authorId);

    expect((await itemsForConsole()).map((entry) => entry.title)).toEqual(['Older', 'Newer']);
    expect((await itemsForConsole()).map((entry) => entry.id)).toEqual([older.id, newer.id]);
  });
});
