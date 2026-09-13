/**
 * A deck's overview read (`DECK-001/T2`, `DECK-001/T4`), against a real
 * PostgreSQL.
 *
 * `deriveSections` shipped with `DECK-001/T1` and had only this test's sibling
 * as a caller — nothing in the product derived a section. What this suite pins
 * is the read that finally does, and the three things it is allowed to answer
 * `null` for.
 *
 * **The overview is the author's view, so it shows the latest revision.** A deck
 * being rewritten is exactly the deck whose shape its author needs to see, and a
 * page that showed the published version instead would be answering a question
 * nobody asked here. It carries speaker context for the same reason, which is
 * why the read is `forAuthor`'s and not a reader's.
 *
 * **Only a deck has one**, and that is asserted rather than assumed: a report
 * and an update are documents read top to bottom, and sections derived from
 * their headings would be a view of something nobody asked to see in parts.
 *
 * On a database of its own: `forAuthor` is item-scoped, but the assertions are
 * about which items exist with which type, and a shared database carries other
 * suites' decks through the same read.
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
import { createItem, saveDraft } from './items';
import { reorderSections } from './sections';
import { overviewFor } from './overview';
import { publish } from './publish';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_deck_overview';

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

const heading = (text: string, context?: string): Block =>
  context === undefined ? { type: 'heading', level: 2, text } : { type: 'heading', level: 2, text, context };
const para = (text: string): Block => ({ type: 'paragraph', text, marks: [] });

// No figure or image fixture here: `saveDraft` refuses a media id nothing has
// stored (`CMS-003/T6`), so one would mean a stored file per case to prove
// counting that `sections.test.ts` already proves without a database.

describe.skipIf(!HAS_DATABASE)('overviewFor — a deck seen as its sections', () => {
  let admin: Actor;
  let investor: Actor;

  async function seed(email: string, role: 'admin' | 'investor'): Promise<Actor> {
    const account = await getDb()
      .insertInto('accounts')
      .values({ email, name: role, role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();

    return { id: account.id, role };
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
    admin = await seed('admin@deck-overview.test', 'admin');
    investor = await seed('investor@deck-overview.test', 'investor');
  }, 120_000);

  afterAll(closeDb);

  async function deck(blocks: Block[], title = 'A deck') {
    const item = await createItem({ type: 'deck', slug: `d-${randomUUID()}`, title });
    const revision = await saveDraft(item.id, blocks, admin.id);
    return { item, revision };
  }

  it('lists a card per section, in the deck order, with its totals', async () => {
    const { item } = await deck([
      heading('Where we are'),
      para('Two products shipped.'),
      heading('The numbers'),
      para('Revenue doubled.'),
      heading('What we want'),
    ]);

    const overview = await overviewFor(item.id, admin);

    expect(overview?.title).toBe('A deck');
    expect(overview?.cards.map((card) => card.heading)).toEqual(['Where we are', 'The numbers', 'What we want']);
    expect(overview?.cards[0]?.firstLine).toBe('Two products shipped.');
    expect(overview?.cards[1]?.firstLine).toBe('Revenue doubled.');
    expect(overview?.totals).toEqual({ sections: 3, words: 13, figures: 0 });
  });

  it('carries the blocks its cards came from, and a reorder saved through them comes back moved', async () => {
    const { item } = await deck([heading('One'), para('a'), heading('Two'), para('b'), heading('Three')]);

    const before = await overviewFor(item.id, admin);
    expect(before?.cards.map((card) => card.heading)).toEqual(['One', 'Two', 'Three']);
    expect(before?.blocks).toHaveLength(5);

    // The overview hands the client these blocks, the client moves a section in
    // them, and the editor’s own write path saves the result (DECK-001/T3).
    await saveDraft(item.id, reorderSections(before?.blocks ?? [], 2, 0), admin.id);

    const after = await overviewFor(item.id, admin);
    expect(after?.cards.map((card) => card.heading)).toEqual(['Three', 'One', 'Two']);
    expect(after?.totals).toEqual(before?.totals);
  });
  it('shows the latest revision, published or not, because it is the author who is looking', async () => {
    const { item, revision } = await deck([heading('First'), para('as published')]);
    await publish(item.id, revision.id, admin.id);
    await saveDraft(item.id, [heading('First'), para('as published'), heading('Second')], admin.id);

    const overview = await overviewFor(item.id, admin);

    expect(overview?.cards).toHaveLength(2);
    expect(overview?.published).toBe(true);
  });

  it('says nothing is published when nothing is, rather than leaving it to be assumed', async () => {
    const { item } = await deck([heading('First')]);

    expect((await overviewFor(item.id, admin))?.published).toBe(false);
  });

  it('carries the speaker context the investor read strips', async () => {
    const { item } = await deck([heading('First', 'pause before the number'), para('a')]);

    expect((await overviewFor(item.id, admin))?.cards[0]?.context).toBe('pause before the number');
  });

  it('has nothing to show for a deck with nothing written in it', async () => {
    const { item } = await deck([]);
    const overview = await overviewFor(item.id, admin);

    expect(overview?.cards).toEqual([]);
    expect(overview?.totals).toEqual({ sections: 0, words: 0, figures: 0 });
  });

  it('answers nothing for a report and for an update, which are not read in sections', async () => {
    const report = await createItem({
      type: 'report',
      slug: `r-${randomUUID()}`,
      title: 'A report',
      period: '9000-Q1',
    });
    await saveDraft(report.id, [heading('One'), para('a')], admin.id);

    const update = await createItem({
      type: 'update',
      slug: `u-${randomUUID()}`,
      title: 'An update',
      kind: 'progress',
    });
    await saveDraft(update.id, [heading('One'), para('a')], admin.id);

    expect(await overviewFor(report.id, admin)).toBeNull();
    expect(await overviewFor(update.id, admin)).toBeNull();
  });

  it('answers nothing to an investor, because the overview is an authoring view', async () => {
    const { item } = await deck([heading('First'), para('a')]);

    expect(await overviewFor(item.id, investor)).toBeNull();
  });

  it('answers a missing item and an identifier that is not one alike, and never raises', async () => {
    expect(await overviewFor(randomUUID(), admin)).toBeNull();
    expect(await overviewFor('not-an-identifier', admin)).toBeNull();
  });
});
