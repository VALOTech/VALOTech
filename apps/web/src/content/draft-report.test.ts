/**
 * Where a too-long update goes (`POST-001/T5`): the report being drafted, and the
 * append that puts text into it without taking anything out.
 *
 * **The load-bearing property is that appending keeps what is already there,
 * under concurrency.** A lost update here costs a report section somebody wrote,
 * and the failure is silent — the second writer sees its own text arrive and has
 * no way to notice the first one's is gone. So the concurrent case is driven by a
 * forced interleaving rather than by two calls started together: started
 * together, the scheduler runs them in sequence, the second reads what the first
 * committed, and the test passes whether or not the lock exists.
 *
 * Against a real PostgreSQL on a database of its own.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';

import type { Block } from './blocks';
import { appendToDraft, UnreadableDraftError } from './items';
import { draftReport } from './reports';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_draft_report';

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

/** The advisory-lock key the parking trigger waits on: this file's own number. */
const PARK_KEY = 918_244_002;

function para(text: string): Block {
  return { type: 'paragraph', text, marks: [] };
}

describe.skipIf(!HAS_DATABASE)('moving an update into the report being drafted (POST-001/T5)', () => {
  let author = '';

  /** A report for `period`, with an open draft holding `blocks` unless published. */
  async function report(period: string, blocks: Block[], published: boolean): Promise<string> {
    const item = await getDb()
      .insertInto('content_items')
      .values({ type: 'report', slug: `report-${period.toLowerCase()}-${randomUUID().slice(0, 8)}`, title: `Report ${period}`, period })
      .returning('id')
      .executeTakeFirstOrThrow();

    const revision = await getDb()
      .insertInto('content_revisions')
      .values({
        item_id: item.id,
        blocks: sql`${JSON.stringify(blocks)}::jsonb`,
        author_id: author,
        ...(published ? { published_at: sql`now()` } : {}),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    if (published) {
      await getDb()
        .updateTable('content_items')
        .set({ current_revision_id: revision.id })
        .where('id', '=', item.id)
        .execute();
    }

    return item.id;
  }

  async function blocksOf(itemId: string): Promise<Block[]> {
    const row = await getDb()
      .selectFrom('content_revisions')
      .select('blocks')
      .where('item_id', '=', itemId)
      .where('published_at', 'is', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();

    return row.blocks as unknown as Block[];
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
      .values({ email: 'author@draft-report.test', name: 'An Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    author = row.id;
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await getDb().deleteFrom('content_items').execute();
    // A trigger left armed by a failed case would park an unrelated write for
    // ever, so it goes before each rather than after the one that used it.
    await sql`drop trigger if exists append_park_trigger on content_revisions`.execute(getDb());
    await sql`drop function if exists append_park_write()`.execute(getDb());
  });

  describe('which report is being drafted', () => {
    it('answers the one with an open draft', async () => {
      const drafting = await report('2026-Q4', [para('Opening.')], false);
      await report('2026-Q3', [para('Published.')], true);

      expect((await draftReport())?.id).toBe(drafting);
    });

    it('answers nothing when every report is published', async () => {
      await report('2026-Q3', [para('Published.')], true);

      // An ordinary state, not an error: between publishing one report and
      // starting the next, nothing is being written.
      expect(await draftReport()).toBeNull();
    });

    it('answers the greatest period when two are open', async () => {
      await report('2026-Q3', [para('Late.')], false);
      const newer = await report('2026-Q4', [para('Current.')], false);

      // By period, not by which draft was touched last: the period is what a
      // person means by "the report I am writing".
      expect((await draftReport())?.id).toBe(newer);
    });

    it('is a staff read and does not consult an audience', async () => {
      // A draft reaches no reader at all, so asking who may see it is a question
      // with no answer. The item is `investor` by default and this answers it.
      const drafting = await report('2026-Q4', [para('Unpublished.')], false);

      expect((await draftReport())?.id).toBe(drafting);
    });
  });

  describe('appending', () => {
    it('adds at the end and keeps what was there', async () => {
      const item = await report('2026-Q4', [para('The period in one paragraph.')], false);

      await appendToDraft(item, [para('Moved from an update.')]);

      expect((await blocksOf(item)).map((block) => (block as { text: string }).text)).toEqual([
        'The period in one paragraph.',
        'Moved from an update.',
      ]);
    });

    it('answers null when the item has no open draft, and writes nothing', async () => {
      const item = await report('2026-Q3', [para('Published.')], true);

      // Not a place to open one: an item whose latest revision is published is a
      // document somebody finished, and a paragraph appearing in it is the
      // failure this refuses.
      expect(await appendToDraft(item, [para('Nowhere to go.')])).toBeNull();

      const revisions = await getDb()
        .selectFrom('content_revisions')
        .select('id')
        .where('item_id', '=', item)
        .execute();
      expect(revisions).toHaveLength(1);
    });

    it('reports the translations it dropped, and leaves the draft’s author alone', async () => {
      const item = await report('2027-Q1', [para('The period in one paragraph.')], false);
      const draft = await getDb()
        .selectFrom('content_revisions')
        .select(['id', 'author_id'])
        .where('item_id', '=', item)
        .executeTakeFirstOrThrow();

      await getDb()
        .insertInto('content_locales')
        .values([
          // A reviewed row must name who reviewed it and when
          // (`content_locales_reviewed_has_time`), which is the state that makes
          // the loss worth reporting: somebody read this and signed it off.
          {
            revision_id: draft.id,
            locale: 'vi',
            blocks: sql`'[]'::jsonb`,
            state: 'reviewed',
            reviewed_by: author,
            reviewed_at: sql`now()`,
          },
          { revision_id: draft.id, locale: 'fr', blocks: sql`'[]'::jsonb`, state: 'machine' },
        ])
        .execute();

      const appended = await appendToDraft(item, [para('Moved from an update.')]);

      // Dropping is right — CMS-005 will not carry a translation across a change
      // of text — but the count comes back so a surface can say what the move
      // cost. The person who reviewed those locales is rarely the one who moved.
      expect(appended?.translationsDropped).toBe(2);
      expect(
        await getDb().selectFrom('content_locales').select('locale').where('revision_id', '=', draft.id).execute(),
      ).toEqual([]);

      // The author of the report draft is whoever is writing it, not whoever
      // appended a paragraph: grants.ts counts revisions by author_id and shows
      // that number in an erasure confirmation.
      const after = await getDb()
        .selectFrom('content_revisions')
        .select('author_id')
        .where('id', '=', draft.id)
        .executeTakeFirstOrThrow();
      expect(after.author_id).toBe(draft.author_id);
    });

    it('raises its own error when the stored draft cannot be read back', async () => {
      const item = await report('2027-Q2', [para('Legal when written.')], false);

      // A validator that tightened since the draft was saved. The fragment this
      // caller sends is fine; the document already in the database is not, and
      // answering them a block index into it would ask for nothing they can do.
      await getDb()
        .updateTable('content_revisions')
        .set({ blocks: sql`'[{"type":"paragraph"}]'::jsonb` })
        .where('item_id', '=', item)
        .execute();

      await expect(appendToDraft(item, [para('Perfectly good.')])).rejects.toThrow(UnreadableDraftError);
    });

    it('refuses a malformed fragment without touching the draft', async () => {
      const item = await report('2026-Q4', [para('Intact.')], false);

      await expect(appendToDraft(item, [{ type: 'not-a-block' }])).rejects.toThrow();

      expect((await blocksOf(item)).map((block) => (block as { text: string }).text)).toEqual(['Intact.']);
    });

    it('loses neither append when two land on one draft at once', async () => {
      const item = await report('2026-Q4', [para('Base.')], false);

      // **The interleaving is forced.** Two appends started together do not
      // exercise the lock: the scheduler runs them in sequence and the second
      // reads what the first committed, so the assertion passes with or without
      // `forUpdate`. Here the first is parked at its UPDATE -- after it has read
      // the draft, while it still holds the item lock -- and the second is
      // started into that window, which is exactly where a lost update would
      // happen.
      await sql`
        create or replace function append_park_write() returns trigger as $$
        begin
          if new.blocks::text like '%FIRST-APPEND%' then
            perform pg_advisory_xact_lock(${sql.lit(PARK_KEY)});
          end if;
          return new;
        end;
        $$ language plpgsql
      `.execute(getDb());
      await sql`
        create trigger append_park_trigger before update on content_revisions
        for each row execute function append_park_write()
      `.execute(getDb());

      let release = (): void => {};
      const until = new Promise<void>((resolve) => {
        release = resolve;
      });
      let acquired = (): void => {};
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });

      const barrier = getDb()
        .transaction()
        .execute(async (trx) => {
          await sql`select pg_advisory_xact_lock(${sql.lit(PARK_KEY)})`.execute(trx);
          acquired();
          await until;
        });

      await ready;

      try {
        const first = appendToDraft(item, [para('FIRST-APPEND')]);

        // Wait until the first is genuinely parked, and **fail if it never is**.
        // A poll that simply falls out of its loop would start the second append
        // into no window at all, and the case would silently become the weaker
        // one this comment exists to rule out.
        let parked = false;
        for (let attempt = 0; attempt < 100 && !parked; attempt += 1) {
          const waiting = await sql<{ n: number }>`
            select count(*)::int as n from pg_locks
            where locktype = 'advisory' and objid = ${sql.lit(PARK_KEY)} and not granted
          `.execute(getDb());
          parked = (waiting.rows[0]?.n ?? 0) > 0;
          if (!parked) {
            await new Promise((resolve) => {
              setTimeout(resolve, 20);
            });
          }
        }
        expect(parked).toBe(true);

        const second = appendToDraft(item, [para('SECOND-APPEND')]);

        release();
        await barrier;
        await Promise.all([first, second]);
      } finally {
        release();
        await barrier;
      }

      const texts = (await blocksOf(item)).map((block) => (block as { text: string }).text);
      expect(texts).toContain('FIRST-APPEND');
      expect(texts).toContain('SECOND-APPEND');
      expect(texts[0]).toBe('Base.');
    });
  });
});
