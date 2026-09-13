/**
 * Writing an update in one act (`POST-001/T1`–`T4`).
 *
 * Against a real PostgreSQL on a database of its own, because every claim here is
 * about what the database holds afterwards: that the item and its first words
 * arrive together or not at all, that the address the author never chose is
 * unique, and that the tag and the kind are on the row where a filter can narrow
 * by them. A fake would have proved the shape of the code and none of that.
 *
 * The address sequence is the part worth the most attention. It is derived from
 * what was written, so two updates that begin the same way collide by design, and
 * the test that matters is the one where they collide at the same moment.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { sql } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';

import { UnknownMediaError } from './items';
import { blocksFromText } from './paste';
import { composeUpdate } from './updates';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_update_compose';

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

// Built by the rule the composer uses, so the fixture cannot drift from what
// the surface actually sends -- a hand-written block is a second opinion about
// the document shape, and the one that is wrong is the one nothing checks.
const BLOCKS = blocksFromText('We raised a round.');

/**
 * The advisory-lock key the parking trigger waits on. Arbitrary and this file's
 * own: an advisory lock is a number two sessions agree about and nothing else.
 */
const PARK_KEY = 918_244_001;

/**
 * Make an insert of one particular update wait on `PARK_KEY`.
 *
 * A trigger rather than a hook in the code under test, because the property is
 * about what happens between a read and an insert, and a seam there would be
 * production code that exists only for this.
 *
 * It parks on the **title** and not on the slug, which is what keeps the test
 * from deadlocking against itself: the colliding row this test writes carries
 * the same slug -- that is the point of it -- but a different title, so it walks
 * straight through while the compose waits. An earlier version armed the trigger
 * from a row in a table, and the parked transaction held that row's lock, so the
 * colliding insert blocked on the very transaction it was meant to overtake.
 *
 * The retry hits this trigger again and that is harmless: by then nothing holds
 * the lock, so it is taken and released inside the retry's own transaction.
 */
async function parkInsertOf(title: string): Promise<void> {
  await sql`
    create or replace function compose_park_insert() returns trigger as $$
    begin
      if new.title = ${sql.lit(title)} then
        perform pg_advisory_xact_lock(${sql.lit(PARK_KEY)});
      end if;
      return new;
    end;
    $$ language plpgsql
  `.execute(getDb());
  await sql`drop trigger if exists compose_park_trigger on content_items`.execute(getDb());
  await sql`
    create trigger compose_park_trigger before insert on content_items
    for each row execute function compose_park_insert()
  `.execute(getDb());
}

/** Wait until the parked insert is actually waiting, rather than assuming it is. */
async function waitForParked(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const waiting = await sql<{ n: number }>`
      select count(*)::int as n from pg_locks
      where locktype = 'advisory' and objid = ${sql.lit(PARK_KEY)} and not granted
    `.execute(getDb());

    if ((waiting.rows[0]?.n ?? 0) > 0) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }

  throw new Error('the insert never parked on the lock');
}

interface HeldLock {
  readonly ready: Promise<void>;
  readonly held: Promise<void>;
  readonly release: () => void;
}

/**
 * Hold an advisory lock on one connection until the returned release is called.
 *
 * Held inside a transaction rather than at session level: a session lock would
 * be taken on whichever pooled connection was handed over and released on
 * whichever came next. `ready` is what makes it a barrier rather than a race --
 * starting the call under test before the lock is actually held leaves which
 * side wins to the scheduler.
 */
function holdLock(key: number): HeldLock {
  let release = (): void => {};
  let acquired = (): void => {};
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });

  const held = getDb()
    .transaction()
    .execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(${sql.lit(key)})`.execute(trx);
      acquired();
      await until;
    });

  return { ready, held, release };
}

describe.skipIf(!HAS_DATABASE)('composing an update (POST-001)', () => {
  let author = '';

  async function revisionsOf(itemId: string) {
    return getDb()
      .selectFrom('content_revisions')
      .select(['item_id', 'blocks', 'author_id', 'published_at'])
      .where('item_id', '=', itemId)
      .orderBy('created_at')
      .execute();
  }

  beforeAll(async () => {
    await recreateIsolatedDatabase();
    await runner({
      databaseUrl: ISOLATED_DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      verbose: false,
    });

    const row = await getDb()
      .insertInto('accounts')
      .values({ email: 'author@example.test', name: 'An Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    author = row.id;
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    // Every test reasons about the addresses in the table, so it starts with an
    // empty one. The revisions go with the items: `item_id` cascades.
    await getDb().deleteFrom('content_items').execute();
    // A trigger left armed by a failed test would park an unrelated insert for
    // ever, so it is removed before each rather than after the one that used it.
    await sql`drop trigger if exists compose_park_trigger on content_items`.execute(getDb());
  });

  it('writes the item and its first words together', async () => {
    const item = await composeUpdate({
      kind: 'announcement',
      product: 'shimmra',
      title: 'We raised a round.',
      blocks: BLOCKS,
      authorId: author,
    });

    expect(item.type).toBe('update');
    expect(item.kind).toBe('announcement');
    expect(item.product).toBe('shimmra');
    expect(item.title).toBe('We raised a round.');

    // Creating is not publishing: the pointer every reader query consults is
    // still null, so nothing here is visible to an investor.
    expect(item.current_revision_id).toBeNull();

    const revisions = await revisionsOf(item.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.author_id).toBe(author);
    expect(revisions[0]?.published_at).toBeNull();
    expect(revisions[0]?.blocks).toEqual(BLOCKS);
  });

  it('derives the address from the title, and never asks for one', async () => {
    const item = await composeUpdate({
      kind: 'progress',
      product: null,
      title: 'Third quarter closed ahead of plan',
      blocks: BLOCKS,
      authorId: author,
    });

    expect(item.slug).toBe('third-quarter-closed-ahead-of-plan');
  });

  it('records that the author did not say what it is about', async () => {
    const item = await composeUpdate({
      kind: 'progress',
      product: null,
      title: 'Something happened',
      blocks: BLOCKS,
      authorId: author,
    });

    // Null rather than `company`: not saying is a different answer from saying
    // it is about the company, and the column keeps the difference.
    expect(item.product).toBeNull();
  });

  it('suffixes the address when two updates begin the same way', async () => {
    const first = await composeUpdate({
      kind: 'achievement', product: null, title: 'We shipped it', blocks: BLOCKS, authorId: author,
    });
    const second = await composeUpdate({
      kind: 'achievement', product: null, title: 'We shipped it', blocks: BLOCKS, authorId: author,
    });
    const third = await composeUpdate({
      kind: 'achievement', product: null, title: 'We shipped it', blocks: BLOCKS, authorId: author,
    });

    // Refused would have been the wrong answer: two updates can honestly begin
    // with the same line, and an author writing two sentences should not meet an
    // address collision.
    expect([first.slug, second.slug, third.slug]).toEqual(['we-shipped-it', 'we-shipped-it-2', 'we-shipped-it-3']);
  });

  it('falls back to a plain address when the title yields none', async () => {
    const first = await composeUpdate({
      kind: 'announcement', product: null, title: '第三季度进展', blocks: BLOCKS, authorId: author,
    });
    const second = await composeUpdate({
      kind: 'announcement', product: null, title: '!!!', blocks: BLOCKS, authorId: author,
    });

    expect([first.slug, second.slug]).toEqual(['update', 'update-2']);
  });

  it('re-derives when another writer takes the address between the read and the insert', async () => {
    // **The interleaving is forced, not hoped for.** Two composes started
    // together do not exercise this at all: the scheduler runs them one after
    // the other, the second reads a table the first has already committed to,
    // and it derives `-2` without the retry ever running. That version of this
    // test passed with the retry removed, which is the shape of test that
    // reports on a property it did not exercise.
    //
    // So the first insert is parked on a lock this test holds, the colliding
    // address is taken from another connection while it waits, and only then is
    // the lock released -- which puts the compose exactly where the race would:
    // holding a proposal that went stale after it was read.
    await parkInsertOf('A number moved');
    const barrier = holdLock(PARK_KEY);
    await barrier.ready;

    const composing = composeUpdate({
      kind: 'progress', product: 'amavo', title: 'A number moved', blocks: BLOCKS, authorId: author,
    });

    // Released in a `finally`: without it, a throw from `waitForParked` or from
    // the insert leaves the barrier holding its lock, the parked compose never
    // finishes, and `closeDb` waits on a client blocked inside
    // `pg_advisory_xact_lock` -- a hang at the hook timeout, which reads exactly
    // like flake and sends the next reader down the wrong path entirely.
    try {
      await waitForParked();
      await getDb()
        .insertInto('content_items')
        .values({ type: 'update', slug: 'a-number-moved', title: 'Taken first', kind: 'progress' })
        .execute();
    } finally {
      barrier.release();
      await barrier.held;
    }

    // The proposal it was holding is gone, so it read again and took the next.
    expect((await composing).slug).toBe('a-number-moved-2');
  });

  it('registers the media a first revision names, and refuses one that is not stored', async () => {
    // `syncMediaRefs` is reused here from `saveDraft`, and until this test every
    // document in this file was paragraphs only -- so `named` was always empty,
    // the call was inert, and deleting it reddened nothing. That is a passing
    // suite reporting on a line it never ran.
    const stored = await getDb()
      .insertInto('media')
      .values({
        sha256: 'a'.repeat(64),
        mime: 'image/png',
        // `bigint`, which Kysely surfaces as a string rather than a number.
        byte_size: '3',
        bytes: Buffer.from([1, 2, 3]),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const withImage = await composeUpdate({
      kind: 'achievement',
      product: null,
      title: 'We shipped the thing',
      blocks: [{ type: 'image', mediaId: stored.id, alt: 'A screenshot of it', caption: null }],
      authorId: author,
    });

    const refs = await getDb()
      .selectFrom('media_refs')
      .select(['item_id', 'media_id'])
      .where('item_id', '=', withImage.id)
      .execute();
    expect(refs).toEqual([{ item_id: withImage.id, media_id: stored.id }]);

    // And the other half: a document naming a file nothing holds is refused
    // inside the transaction, so the item it would have belonged to is gone too.
    const before = (await getDb().selectFrom('content_items').select('id').execute()).length;
    await expect(
      composeUpdate({
        kind: 'achievement',
        product: null,
        title: 'This names nothing',
        blocks: [{ type: 'image', mediaId: '00000000-0000-4000-8000-000000000000', alt: 'Nothing', caption: null }],
        authorId: author,
      }),
    ).rejects.toThrow(UnknownMediaError);
    expect((await getDb().selectFrom('content_items').select('id').execute()).length).toBe(before);
  });

  it('writes neither the item nor the words when the document is malformed', async () => {
    await expect(
      composeUpdate({
        kind: 'progress',
        product: null,
        title: 'This will not be written',
        blocks: [{ type: 'not-a-block' }],
        authorId: author,
      }),
    ).rejects.toThrow();

    // The validation happens before the transaction opens, so there is no lock
    // to hold and no half-written item to find. An item with a title and no
    // words is the drafts folder POST-001 §6 refuses to build.
    const items = await getDb().selectFrom('content_items').select('id').execute();
    expect(items).toEqual([]);
  });

  it('refuses a product on anything but an update, at the database', async () => {
    // The composer only ever writes updates, so this is the constraint standing
    // behind a writer added later: a report or a deck carrying a product tag is
    // a value no surface reads and no filter means.
    await expect(
      getDb()
        .insertInto('content_items')
        .values({ type: 'deck', slug: 'a-deck', title: 'A deck', product: 'amavo' })
        .execute(),
    ).rejects.toThrow(/content_items_product_for_update/);
  });
});
