/**
 * The item screen's two acts, and the facts its confirmation states
 * (`CMS-004/T4`), against a real PostgreSQL.
 *
 * `publish` and `withdraw` were closed and proven as store functions before any
 * surface reached them. What this suite pins is the surface and the sentence it
 * is allowed to say.
 *
 * **The confirmation must be true before the pointer moves.** It names the
 * version being replaced and how many languages will be served against how many
 * will read the English, so the counts are asserted against a revision with
 * translations in both states — a count taken from the item rather than from the
 * revision would report a translation of text nobody is about to be shown.
 *
 * **The revision is posted explicitly.** Publishing "the latest" would make the
 * confirmation a lie the moment another tab saved, so the suite publishes an
 * older revision by name and checks that is what a reader gets.
 *
 * **Withdrawing says which of its two outcomes will happen.** Returning readers
 * to an earlier version and leaving nothing visible are different, and the
 * control carries no dialogue, so the sentence has to be right beforehand.
 *
 * On a database of its own: these assertions are about which revision a pointer
 * names, and a shared database carries other suites' items through the same
 * reads.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import type { Block } from '../../../../content/blocks';
import { createItem, saveDraft } from '../../../../content/items';
import { localeGrid, markReviewed, seedLocale } from '../../../../content/locales';
import { publishConsequences, withdrawReturnsTo } from '../../../../content/publish';
import { forReader } from '../../../../content/read';
import { closeDb, getDb } from '../../../../db/index';

import { POST as PUBLISH } from './publish/route';
import { POST as WITHDRAW } from './withdraw/route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_item_publish';

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

const words = (text: string): Block[] => [{ type: 'heading', level: 2, text }];

describe.skipIf(!HAS_DATABASE)('CMS-004/T4 — publishing and withdrawing from the item screen', () => {
  let adminId: string;
  let adminCookie: string;
  let investorCookie: string;

  async function seed(email: string, role: 'admin' | 'investor') {
    const account = await getDb()
      .insertInto('accounts')
      .values({ email, name: role, role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(account.id);

    return { id: account.id, header: `${cookie.name}=${cookie.value}` };
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
    const admin = await seed('admin@item-publish.test', 'admin');
    const investor = await seed('investor@item-publish.test', 'investor');
    adminId = admin.id;
    adminCookie = admin.header;
    investorCookie = investor.header;
  }, 120_000);

  afterAll(closeDb);

  function call(
    handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>,
    path: string,
    itemId: string,
    body: unknown,
    options: { cookie?: string; origin?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.cookie !== undefined) {
      headers['Cookie'] = options.cookie;
    }
    if (options.origin !== undefined) {
      headers['Origin'] = options.origin;
    }

    return handler(
      new Request(`${ORIGIN}/admin/content/${itemId}/${path}`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
      }),
      { params: Promise.resolve({ id: itemId }) },
    );
  }

  async function publicItem(title: string) {
    return createItem({
      type: 'update',
      slug: `u-${randomUUID()}`,
      title,
      kind: 'progress',
      audience: 'public',
    });
  }

  /** What a signed-out reader is served today, or `null`. */
  async function servedText(itemId: string): Promise<string | null> {
    const view = await forReader(itemId, null);
    const blocks = (view?.revision.blocks ?? null) as Block[] | null;

    return blocks === null ? null : ((blocks[0] as { text?: string }).text ?? null);
  }

  describe('what the confirmation states', () => {
    it('says nothing is replaced before a first publication', async () => {
      const item = await publicItem('First');
      const draft = await saveDraft(item.id, words('One'), adminId);

      expect(await publishConsequences(item.id, draft.id)).toEqual({
        replacing: null,
        reviewedLocales: 0,
        fallbackLocales: 19,
      });
    });

    it('names the version being replaced once one is published', async () => {
      const item = await publicItem('Second');
      const first = await saveDraft(item.id, words('One'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: first.id }, { cookie: adminCookie });
      const second = await saveDraft(item.id, words('Two'), adminId);

      const facts = await publishConsequences(item.id, second.id);

      expect(facts.replacing?.revisionId).toBe(first.id);
      expect(facts.replacing?.publishedAt).toBeInstanceOf(Date);
    });

    it('counts the reviewed languages of the revision being published, not the item', async () => {
      const item = await publicItem('Translated');
      const first = await saveDraft(item.id, words('One'), adminId);
      await seedLocale(item.id, 'vi');
      await markReviewed(item.id, 'vi', [['Một']], adminId);
      await seedLocale(item.id, 'fr');

      // One reviewed, one seeded-but-unreviewed which is served to nobody, and
      // eighteen never started: nineteen read the English either way.
      expect(await publishConsequences(item.id, first.id)).toMatchObject({
        reviewedLocales: 1,
        fallbackLocales: 18,
      });

      // A second revision carries none of the first's translations (`CMS-005`
      // section 3). Counting the item's would report the one above, which is a
      // translation of text nobody is about to be shown.
      await call(PUBLISH, 'publish', item.id, { revisionId: first.id }, { cookie: adminCookie });
      const second = await saveDraft(item.id, words('Two'), adminId);

      expect(await publishConsequences(item.id, second.id)).toMatchObject({
        reviewedLocales: 0,
        fallbackLocales: 19,
      });
    });
  });

  describe('publishing', () => {
    it('moves the pointer to the revision named, and a reader sees it', async () => {
      const item = await publicItem('Named');
      const draft = await saveDraft(item.id, words('What a reader gets'), adminId);

      const response = await call(
        PUBLISH,
        'publish',
        item.id,
        { revisionId: draft.id },
        { cookie: adminCookie },
      );

      expect(response.status).toBe(200);
      expect(await servedText(item.id)).toBe('What a reader gets');
    });

    it('publishes the revision asked for rather than the latest', async () => {
      const item = await publicItem('Two tabs');
      const older = await saveDraft(item.id, words('The one I read'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: older.id }, { cookie: adminCookie });
      // A second tab saves newer words; the confirmation on screen named the
      // revision above, so publishing it again must not pick up the newer ones.
      await saveDraft(item.id, words('What the other tab saved'), adminId);

      await call(PUBLISH, 'publish', item.id, { revisionId: older.id }, { cookie: adminCookie });

      expect(await servedText(item.id)).toBe('The one I read');
    });

    it('refuses a body with no revision named', async () => {
      const item = await publicItem('No revision');
      await saveDraft(item.id, words('One'), adminId);

      for (const body of [{}, { revisionId: '' }, { revisionId: 7 }]) {
        expect((await call(PUBLISH, 'publish', item.id, body, { cookie: adminCookie })).status).toBe(400);
      }
      expect(await servedText(item.id)).toBeNull();
    });
  });

  describe('withdrawing', () => {
    it('says it will leave nothing visible when there is no earlier version', async () => {
      const item = await publicItem('Only one');
      const draft = await saveDraft(item.id, words('One'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: draft.id }, { cookie: adminCookie });

      expect(await withdrawReturnsTo(item.id)).toBeNull();

      const response = await call(WITHDRAW, 'withdraw', item.id, {}, { cookie: adminCookie });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ published: false });
      expect(await servedText(item.id)).toBeNull();
    });

    it('says which version it returns to, and returns to it', async () => {
      const item = await publicItem('Two versions');
      const first = await saveDraft(item.id, words('The first'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: first.id }, { cookie: adminCookie });
      const second = await saveDraft(item.id, words('The second'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: second.id }, { cookie: adminCookie });

      expect((await withdrawReturnsTo(item.id))?.revisionId).toBe(first.id);

      const response = await call(WITHDRAW, 'withdraw', item.id, {}, { cookie: adminCookie });

      expect(await response.json()).toMatchObject({ published: true });
      expect(await servedText(item.id)).toBe('The first');
    });

    it('returns to the version immediately before, not to the first ever', async () => {
      const item = await publicItem('Three versions');
      const first = await saveDraft(item.id, words('The first'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: first.id }, { cookie: adminCookie });
      const second = await saveDraft(item.id, words('The second'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: second.id }, { cookie: adminCookie });
      const third = await saveDraft(item.id, words('The third'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: third.id }, { cookie: adminCookie });

      // One step back is what an operator needs; a jump to the oldest version
      // would be a different act wearing the same word.
      expect((await withdrawReturnsTo(item.id))?.revisionId).toBe(second.id);

      await call(WITHDRAW, 'withdraw', item.id, {}, { cookie: adminCookie });

      expect(await servedText(item.id)).toBe('The second');
    });

    it('is not deletion: the revisions and the item stay', async () => {
      const item = await publicItem('Kept');
      const draft = await saveDraft(item.id, words('One'), adminId);
      await call(PUBLISH, 'publish', item.id, { revisionId: draft.id }, { cookie: adminCookie });

      await call(WITHDRAW, 'withdraw', item.id, {}, { cookie: adminCookie });

      // Counted through the content module, which is the only place a content
      // table may be named (check-content-access); the grid lists an item every
      // revision, published or not.
      expect(await localeGrid(item.id)).toHaveLength(1);
    });
  });

  describe('who may move the pointer', () => {
    it('answers an investor 404 on both, moving nothing', async () => {
      const item = await publicItem('Theirs');
      const draft = await saveDraft(item.id, words('One'), adminId);

      expect(
        (await call(PUBLISH, 'publish', item.id, { revisionId: draft.id }, { cookie: investorCookie }))
          .status,
      ).toBe(404);
      expect(await servedText(item.id)).toBeNull();

      await call(PUBLISH, 'publish', item.id, { revisionId: draft.id }, { cookie: adminCookie });
      expect((await call(WITHDRAW, 'withdraw', item.id, {}, { cookie: investorCookie })).status).toBe(404);
      expect(await servedText(item.id)).toBe('One');
    });

    it('sends a caller with no session to sign in', async () => {
      const item = await publicItem('Nobody');
      const draft = await saveDraft(item.id, words('One'), adminId);

      expect((await call(PUBLISH, 'publish', item.id, { revisionId: draft.id })).status).toBe(303);
      expect((await call(WITHDRAW, 'withdraw', item.id, {})).status).toBe(303);
      expect(await servedText(item.id)).toBeNull();
    });

    it('refuses a cross-origin post on both before anything else', async () => {
      const item = await publicItem('Elsewhere');
      const draft = await saveDraft(item.id, words('One'), adminId);
      const elsewhere = { cookie: adminCookie, origin: 'https://elsewhere.test' };

      expect(
        (await call(PUBLISH, 'publish', item.id, { revisionId: draft.id }, elsewhere)).status,
      ).toBe(403);
      expect((await call(WITHDRAW, 'withdraw', item.id, {}, elsewhere)).status).toBe(403);
      expect(await servedText(item.id)).toBeNull();
    });
  });

  describe('what the trail records', () => {
    it('audits the publish and the withdraw to the admin who made each', async () => {
      const item = await publicItem('Audited');
      const draft = await saveDraft(item.id, words('One'), adminId);

      await call(PUBLISH, 'publish', item.id, { revisionId: draft.id }, { cookie: adminCookie });
      await call(WITHDRAW, 'withdraw', item.id, {}, { cookie: adminCookie });

      const audit = await getDb()
        .selectFrom('audit')
        .select(['action', 'actor_id'])
        .where('subject_id', '=', item.id)
        .orderBy('id')
        .execute();

      expect(audit).toEqual([
        { action: 'content.publish', actor_id: adminId },
        { action: 'content.withdraw', actor_id: adminId },
      ]);
    });
  });
});
