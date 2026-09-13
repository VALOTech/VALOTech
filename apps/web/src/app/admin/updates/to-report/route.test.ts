/**
 * `POST /admin/updates/to-report` (`POST-001/T5`).
 *
 * The property worth the most here is that **the destination is the server's**.
 * The request carries blocks and nothing else, and a case below proves it by
 * sending an `itemId` for a different item and watching the text land in the
 * draft report anyway — because a route that honoured it would let any admin
 * append arbitrary text to any content item in the room through a surface whose
 * whole stated purpose is one destination.
 *
 * On a database of its own.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import type { Block } from '../../../../content/blocks';
import { createItem, saveDraft } from '../../../../content/items';
import { publish } from '../../../../content/publish';
import { forAuthor } from '../../../../content/read';
import { closeDb, getDb } from '../../../../db/index';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_to_report';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'migrations');
const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
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

function para(text: string): Block {
  return { type: 'paragraph', text, marks: [] };
}

const MOVED = [para('This got long enough to be a report section.')];

/**
 * A period no earlier case has used, ascending.
 *
 * Two things need it. `RPT-002` allows one published report per period, and each
 * case publishes the draft it opened, so a shared period would collide on the
 * second. And `draftReport` answers the greatest period with an open draft, so
 * ascending is what makes the report a case just made the one it will be handed.
 */
let periods = 0;
function nextPeriod(): string {
  periods += 1;
  const year = 2026 + Math.floor((periods - 1) / 12);
  const month = ((periods - 1) % 12) + 1;

  return `${year}-${String(month).padStart(2, '0')}`;
}

describe.skipIf(!HAS_DATABASE)('POST /admin/updates/to-report (POST-001/T5)', () => {
  let adminCookie = '';
  let investorCookie = '';
  let author = '';

  function callPost(body: unknown, options: { cookie?: string; origin?: string } = {}): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.cookie !== undefined) {
      headers['Cookie'] = options.cookie;
    }
    headers['Origin'] = options.origin ?? ORIGIN;

    return POST(
      new Request(`${ORIGIN}/admin/updates/to-report`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  }

  async function seed(email: string, role: 'admin' | 'investor'): Promise<string> {
    const account = await getDb()
      .insertInto('accounts')
      .values({ email, name: role, role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(account.id);
    return `${cookie.name}=${cookie.value}`;
  }

  /**
   * An item with an open draft holding one paragraph.
   *
   * Built and read back through the content module rather than by naming a
   * content table, which only that module may do (`check-content-access`).
   * Reading through it is what the rule is for: a suite reaching past the module
   * would be checking a row rather than what the console is shown.
   */
  async function itemWithDraft(type: 'report' | 'update', text: string, period: string | null): Promise<string> {
    const item = await createItem({
      type,
      slug: `${type}-${randomUUID().slice(0, 8)}`,
      title: `A ${type}`,
      period,
      ...(type === 'update' ? { kind: 'progress' as const } : {}),
    });

    const revision = await saveDraft(item.id, [para(text)], author);
    opened.push({ item: item.id, revision: revision.id });

    return item.id;
  }

  async function textsOf(itemId: string): Promise<string[]> {
    const view = await forAuthor(itemId, { id: author, role: 'admin' });

    if (view === null) {
      throw new Error('the item has no revision to read');
    }

    return (view.revision.blocks as unknown as { text: string }[]).map((block) => block.text);
  }

  /** Whether a reader would see anything, read the way the console reads it. */
  async function isPublished(itemId: string): Promise<boolean> {
    const view = await forAuthor(itemId, { id: author, role: 'admin' });

    // Thrown rather than answered: a missing view is an item this suite did not
    // create, and `view?.x !== null` would have answered `true` for it — a
    // helper reporting "published" about a row that is not there.
    if (view === null) {
      throw new Error('the item has no revision to read');
    }

    return view.item.current_revision_id !== null;
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

    adminCookie = await seed('admin@to-report.test', 'admin');
    investorCookie = await seed('investor@to-report.test', 'investor');
    author = (
      await getDb().selectFrom('accounts').select('id').where('role', '=', 'admin').executeTakeFirstOrThrow()
    ).id;
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  /**
   * Every draft this file opens, so each case can close its own.
   *
   * Nothing outside the content module may clear a content table -- only that
   * module may name one (`check-content-access`) -- so the way to leave no open
   * draft behind is to publish it, which is an ordinary content-module call.
   * That matters because `draftReport` answers the greatest period *with an open
   * draft*: a case that left one would decide the next case's destination, and
   * the one asserting that nothing is being drafted would never see nothing.
   */
  const opened: { item: string; revision: string }[] = [];

  afterEach(async () => {
    // Every one is attempted even if an earlier publish throws, because a draft
    // left open would decide the next case's destination and the case asserting
    // that nothing is being drafted would never see nothing. The first failure
    // is raised once the rest have been closed.
    const drafts = opened.splice(0, opened.length);
    let failure: unknown = null;

    for (const draft of drafts) {
      try {
        await publish(draft.item, draft.revision, author);
      } catch (error) {
        failure ??= error;
      }
    }

    if (failure !== null) {
      throw failure;
    }
  });

  describe('who may reach it', () => {
    it('answers an investor the 404 the console gives a guess', async () => {
      await itemWithDraft('report', 'Base.', nextPeriod());

      expect((await callPost({ blocks: MOVED }, { cookie: investorCookie })).status).toBe(404);
    });

    it('sends a signed-out caller to sign in', async () => {
      const response = await callPost({ blocks: MOVED });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toContain('/sign-in');
    });

    it('refuses a cross-site origin before anything else', async () => {
      const response = await callPost(
        { blocks: MOVED },
        { cookie: adminCookie, origin: 'https://not-this-room.example' },
      );

      expect(response.status).toBe(403);
    });
  });

  describe('what it refuses', () => {
    it('refuses an empty move', async () => {
      await itemWithDraft('report', 'Base.', nextPeriod());

      const response = await callPost({ blocks: [] }, { cookie: adminCookie });

      expect(response.status).toBe(400);
      expect((await response.json()) as { field?: string }).toMatchObject({ field: 'blocks' });
    });

    it('says so when no report is being drafted, rather than inventing one', async () => {
      // Nothing open. The composer does not offer the control in this state, so
      // reaching here means the draft was published while the page was open.
      const response = await callPost({ blocks: MOVED }, { cookie: adminCookie });

      expect(response.status).toBe(409);
      expect((await response.json()) as { error?: string }).toMatchObject({ error: 'no_draft_report' });
    });

    it('answers a fragment it cannot store with 422, not a 500', async () => {
      await itemWithDraft('report', 'Base.', nextPeriod());

      const response = await callPost({ blocks: [{ type: 'not-a-block' }] }, { cookie: adminCookie });

      expect(response.status).toBe(422);
      expect((await response.json()) as { error?: string }).toMatchObject({ error: 'invalid_blocks' });
    });
  });

  describe('what it does', () => {
    it('appends to the draft report and answers where it went', async () => {
      const report = await itemWithDraft('report', 'The period in one paragraph.', nextPeriod());

      const response = await callPost({ blocks: MOVED }, { cookie: adminCookie });

      expect(response.status).toBe(200);
      expect((await response.json()) as { reportId?: string }).toMatchObject({ reportId: report });
      expect(await textsOf(report)).toEqual([
        'The period in one paragraph.',
        'This got long enough to be a report section.',
      ]);
    });

    it('ignores a destination the caller supplies, and uses the one it chose', async () => {
      // **The security property.** A route that honoured an `itemId` from the
      // request would let an admin append text to any item in the room through a
      // surface that exists to reach exactly one.
      const report = await itemWithDraft('report', 'The report.', nextPeriod());
      const someoneElse = await itemWithDraft('update', 'Not the destination.', null);

      const response = await callPost(
        { blocks: MOVED, itemId: someoneElse, reportId: someoneElse },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
      expect((await response.json()) as { reportId?: string }).toMatchObject({ reportId: report });
      expect(await textsOf(someoneElse)).toEqual(['Not the destination.']);
      expect(await textsOf(report)).toHaveLength(2);
    });

    it('leaves the report a draft, so nobody has read it', async () => {
      const report = await itemWithDraft('report', 'Base.', nextPeriod());

      await callPost({ blocks: MOVED }, { cookie: adminCookie });

      expect(await isPublished(report)).toBe(false);
    });
  });
});
