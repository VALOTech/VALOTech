/**
 * Who may read an item, the words that change said before it happens, and what
 * withdrawing a report does to the archive (`RPT-001/T5`, `POST-002/T5`,
 * `RPT-002/T5`), against a real PostgreSQL.
 *
 * `changeAudience` was closed and proven as a store function with no production
 * caller (`CMS-006/T6`). What this suite pins is the surface that reaches it and
 * the facts its confirmation is allowed to state.
 *
 * **A confirmation is only worth its friction if it is true.** Every sentence
 * beyond the two fixed ones is computed from `audienceOptions`, so the suite
 * drives the facts rather than the prose: the direction of each move, the grant
 * count that decides whether `granted` means somebody or nobody, and the cache
 * window that exists only while the item is public.
 *
 * **Narrowing is asserted end to end rather than as a column write**, because
 * the claim the surface makes is that a reader loses it — a column changed while
 * a read still answers would be the leak `CMS-006` exists to prevent.
 *
 * **The report sentence is asserted against the case that falsifies it.**
 * `RPT-002` §3 says withdrawal leaves the period a gap; a report on its second
 * published revision falls back to its first and keeps the period, so the gap is
 * read rather than assumed and the suite drives both.
 *
 * On a database of its own: what the room's current report is, and which
 * accounts hold a grant, are questions about every row that exists, and a shared
 * database carries other suites' reports through the same reads.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import type { Actor } from '../../../../auth/gate';
import { audienceOptions } from '../../../../content/audience';
import type { Block } from '../../../../content/blocks';
import { addGrant } from '../../../../content/grants';
import { createItem, saveDraft } from '../../../../content/items';
import { publish, withdraw } from '../../../../content/publish';
import { forReader } from '../../../../content/read';
import { currentReport, reportWithdrawal } from '../../../../content/reports';
import { closeDb, getDb } from '../../../../db/index';

import { POST as AUDIENCE } from './audience/route';
import { POST as WITHDRAW } from './withdraw/route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_item_audience';

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

describe.skipIf(!HAS_DATABASE)('the item screen audience control (RPT-001/T5, POST-002/T5)', () => {
  let adminId: string;
  let adminCookie: string;
  let investor: Actor;
  let investorId: string;
  let investorCookie: string;
  let otherInvestorId: string;

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
    const admin = await seed('admin@item-audience.test', 'admin');
    const one = await seed('investor@item-audience.test', 'investor');
    const two = await seed('other@item-audience.test', 'investor');
    adminId = admin.id;
    adminCookie = admin.header;
    investorId = one.id;
    investorCookie = one.header;
    otherInvestorId = two.id;
    investor = { id: one.id, role: 'investor' };
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

  async function update(title: string, audience: 'public' | 'investor' | 'granted') {
    const item = await createItem({
      type: 'update',
      slug: `u-${randomUUID()}`,
      title,
      kind: 'progress',
      audience,
    });
    const revision = await saveDraft(item.id, words(title), adminId);
    await publish(item.id, revision.id, adminId);
    return item;
  }

  async function report(period: string, title: string) {
    const item = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title, period });
    const revision = await saveDraft(item.id, words(title), adminId);
    await publish(item.id, revision.id, adminId);
    return item;
  }

  function audienceMoves(itemId: string) {
    return getDb()
      .selectFrom('audit')
      .select(['action', 'before', 'after'])
      .where('action', '=', 'content.audience_change')
      .where('subject_id', '=', itemId)
      .orderBy('at', 'asc')
      .execute();
  }

  describe('the facts a confirmation states', () => {
    it('gives every move a direction from the audience the item holds', async () => {
      const item = await update('direction', 'investor');
      const moves = await audienceOptions(item.id);

      expect(moves?.public.direction).toBe('wider');
      expect(moves?.granted.direction).toBe('narrower');
      expect(moves?.investor.direction).toBe('same');
    });

    it('names a cache window only while the item is public, because only then is one left behind', async () => {
      const open = await update('cached', 'public');
      const gated = await update('not cached', 'investor');

      expect((await audienceOptions(open.id))?.investor.cachedFor).toBe(600);
      expect((await audienceOptions(gated.id))?.granted.cachedFor).toBeNull();
    });

    it('counts the grants, so narrowing to granted can say whether that is anybody', async () => {
      const none = await update('granted to nobody', 'investor');
      const some = await update('granted to two', 'investor');
      await addGrant(some.id, investorId, adminId);
      await addGrant(some.id, otherInvestorId, adminId);

      expect((await audienceOptions(none.id))?.granted.grantHolders).toBe(0);
      expect((await audienceOptions(some.id))?.granted.grantHolders).toBe(2);
    });

    it('answers nothing for an item that is not there, and for an identifier that is not one', async () => {
      expect(await audienceOptions(randomUUID())).toBeNull();
      expect(await audienceOptions('not-an-identifier')).toBeNull();
    });
  });

  describe('the route', () => {
    it('widens to public, and the change is audited with both audiences', async () => {
      const item = await update('going public', 'investor');

      const response = await call(AUDIENCE, 'audience', item.id, { audience: 'public' }, { cookie: adminCookie });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ audience: 'public' });

      const moves = await audienceMoves(item.id);
      expect(moves).toHaveLength(1);
      expect(moves[0]?.before).toMatchObject({ audience: 'investor' });
      expect(moves[0]?.after).toMatchObject({ audience: 'public' });
    });

    it('narrowing takes the item from a reader who had it, and leaves it with one who still may', async () => {
      const item = await update('narrowing', 'public');
      expect(await forReader(item.id, null)).not.toBeNull();

      expect(
        (await call(AUDIENCE, 'audience', item.id, { audience: 'investor' }, { cookie: adminCookie })).status,
      ).toBe(200);

      expect(await forReader(item.id, null)).toBeNull();
      expect(await forReader(item.id, investor)).not.toBeNull();
    });

    it('asking for the audience it already holds writes nothing and records nothing', async () => {
      const item = await update('unchanged', 'investor');

      expect(
        (await call(AUDIENCE, 'audience', item.id, { audience: 'investor' }, { cookie: adminCookie })).status,
      ).toBe(200);
      expect(await audienceMoves(item.id)).toHaveLength(0);
    });

    it('refuses a word the vocabulary does not have, naming the field, and changes nothing', async () => {
      const item = await update('bad word', 'investor');

      for (const audience of ['everyone', 'PUBLIC', '', 42, null]) {
        const response = await call(AUDIENCE, 'audience', item.id, { audience }, { cookie: adminCookie });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ field: 'audience' });
      }

      expect((await audienceOptions(item.id))?.public.from).toBe('investor');
      expect(await audienceMoves(item.id)).toHaveLength(0);
    });

    it('refuses a body that is not JSON', async () => {
      const item = await update('bad body', 'investor');
      const response = await call(AUDIENCE, 'audience', item.id, 'not json at all', { cookie: adminCookie });

      expect(response.status).toBe(400);
      expect(await audienceMoves(item.id)).toHaveLength(0);
    });

    it('answers a missing item and a malformed identifier alike, and never a 500', async () => {
      expect((await call(AUDIENCE, 'audience', randomUUID(), { audience: 'public' }, { cookie: adminCookie })).status).toBe(
        404,
      );
      expect(
        (await call(AUDIENCE, 'audience', 'not-an-identifier', { audience: 'public' }, { cookie: adminCookie })).status,
      ).toBe(404);
    });

    it('refuses an investor, a signed-out caller and a cross-origin post, each with nothing changed', async () => {
      const item = await update('gated', 'investor');

      expect((await call(AUDIENCE, 'audience', item.id, { audience: 'public' }, { cookie: investorCookie })).status).toBe(
        404,
      );
      const signedOut = await call(AUDIENCE, 'audience', item.id, { audience: 'public' });
      expect(signedOut.status).toBeGreaterThanOrEqual(300);
      expect(signedOut.status).toBeLessThan(400);
      expect(
        (
          await call(
            AUDIENCE,
            'audience',
            item.id,
            { audience: 'public' },
            { cookie: adminCookie, origin: 'https://elsewhere.test' },
          )
        ).status,
      ).toBe(403);

      expect((await audienceOptions(item.id))?.public.from).toBe('investor');
      expect(await audienceMoves(item.id)).toHaveLength(0);
    });
  });

  describe('what withdrawing a report does to the archive (RPT-002/T5)', () => {
    // What becomes current is a question about every report that exists, so each
    // case states the archive it is asking about rather than inheriting whatever
    // the case before it left published. Repeated because withdrawing a report on
    // its second revision returns it to its first, which is still published.
    beforeEach(async () => {
      const admin = { id: adminId, role: 'admin' } as const;
      for (let standing = await currentReport(admin); standing !== null; standing = await currentReport(admin)) {
        await withdraw(standing.id, adminId);
      }
      expect(await currentReport(admin)).toBeNull();
    });

    it('leaves the period a gap and names the report that becomes current', async () => {
      const older = await report('7000-Q1', 'The first quarter');
      const newer = await report('7000-Q2', 'The second quarter');

      const consequence = await reportWithdrawal(newer.id);
      expect(consequence?.period).toBe('7000-Q2');
      expect(consequence?.becomesGap).toBe(true);
      expect(consequence?.becomesCurrent).toEqual({ period: '7000-Q1', title: 'The first quarter' });

      expect((await call(WITHDRAW, 'withdraw', newer.id, {}, { cookie: adminCookie })).status).toBe(200);
      expect(await forReader(newer.id, investor)).toBeNull();
      expect(await forReader(older.id, investor)).not.toBeNull();
    });

    it('names no successor when it is the only published report there is', async () => {
      const only = await report('7100-Q1', 'The only one');
      const consequence = await reportWithdrawal(only.id);

      expect(consequence?.becomesGap).toBe(true);
      expect(consequence?.becomesCurrent).toBeNull();
    });

    it('promises no gap when an earlier revision of the same report keeps the period', async () => {
      const item = await report('7300-Q1', 'Corrected in place');
      const second = await saveDraft(item.id, words('The correction'), adminId);
      await publish(item.id, second.id, adminId);

      const consequence = await reportWithdrawal(item.id);
      expect(consequence?.becomesGap).toBe(false);
      expect(consequence?.becomesCurrent).toBeNull();

      await call(WITHDRAW, 'withdraw', item.id, {}, { cookie: adminCookie });
      expect(await forReader(item.id, investor)).not.toBeNull();
    });

    it('says nothing about anything that is not a published report', async () => {
      const post = await update('an update, not a report', 'investor');
      const unpublished = await createItem({
        type: 'report',
        slug: `r-${randomUUID()}`,
        title: 'Never published',
        period: '7400-Q1',
      });

      expect(await reportWithdrawal(post.id)).toBeNull();
      expect(await reportWithdrawal(unpublished.id)).toBeNull();
    });
  });
});
