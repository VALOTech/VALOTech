/**
 * The access predicate and the two reads it scopes (`CMS-006`, `CMS-001/T6`).
 *
 * These run against a real PostgreSQL — `DATABASE_URL` names a development
 * target — because the property under test is what the database returns for a
 * given reader, and a fake that answered the same questions would be a second
 * implementation of the rule this design exists to have exactly one of.
 *
 * The predicate is exercised twice over: directly, as the `WHERE` clause a list
 * or a search composes, and through `forReader`, which is what a page calls.
 * Both are needed. A test only of `forReader` cannot see the published check
 * leaving the predicate, because the join to the published pointer hides its
 * absence; a test only of the predicate cannot see `forReader` reaching an
 * unpublished revision.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';
import type { ContentAudience } from '../db/types';

import { visibleTo } from './access';
import type { Block } from './blocks';
import { createItem, saveDraft } from './items';
import { publish } from './publish';
import { forAuthor, forReader } from './read';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

const EMAILS = [
  'cms-access-admin@example.test',
  'cms-access-investor-a@example.test',
  'cms-access-investor-b@example.test',
] as const;

/** The fixtures, by the name the assertions read them under. */
type Fixture =
  | 'public'
  | 'investor'
  | 'granted-to-a'
  | 'granted-to-both'
  | 'investor-with-grants'
  | 'draft'
  | 'public-draft'
  | 'published-with-open-draft';

function body(text: string): Block[] {
  return [{ type: 'heading', level: 2, text }];
}

describe.skipIf(!HAS_DATABASE)('CMS-006 audience and access', () => {
  let admin: Actor;
  let investorA: Actor;
  let investorB: Actor;

  const id: Record<Fixture, string> = {
    public: '',
    investor: '',
    'granted-to-a': '',
    'granted-to-both': '',
    'investor-with-grants': '',
    draft: '',
    'public-draft': '',
    'published-with-open-draft': '',
  };
  let openDraftRevisionId = '';
  let publishedRevisionId = '';

  async function account(email: string, role: Actor['role']): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name: email, role, state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
  }

  /**
   * An item with one revision, published unless `publishIt` says otherwise.
   * Returns the identifiers of both, so a test that needs the published
   * revision reads it from the write rather than looking it up again.
   */
  async function seed(
    name: Fixture,
    audience: ContentAudience,
    publishIt: boolean,
  ): Promise<{ itemId: string; revisionId: string }> {
    const item = await createItem({
      type: 'update',
      slug: `access-${name}-${randomUUID()}`,
      title: name,
      kind: 'progress',
      audience,
    });
    const revision = await saveDraft(item.id, body(name), admin.id);
    if (publishIt) {
      await publish(item.id, revision.id, admin.id);
    }
    id[name] = item.id;
    return { itemId: item.id, revisionId: revision.id };
  }

  beforeAll(async () => {
    await runner({
      databaseUrl: DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
      advisoryLockMode: 'wait',
    });

    await getDb().deleteFrom('accounts').where('email', 'in', EMAILS).execute();
    admin = await account(EMAILS[0], 'admin');
    investorA = await account(EMAILS[1], 'investor');
    investorB = await account(EMAILS[2], 'investor');

    await seed('public', 'public', true);
    await seed('investor', 'investor', true);
    await seed('granted-to-a', 'granted', true);
    await seed('granted-to-both', 'granted', true);
    await seed('investor-with-grants', 'investor', true);
    await seed('draft', 'investor', false);
    // An item that would be public the moment it is published. It is what
    // separates the anonymous branch's published check from the investor
    // branch's: without it, dropping the first is invisible to every test.
    await seed('public-draft', 'public', false);

    const withDraft = await seed('published-with-open-draft', 'investor', true);
    publishedRevisionId = withDraft.revisionId;
    const open = await saveDraft(withDraft.itemId, body('an unpublished edit'), admin.id);
    openDraftRevisionId = open.id;

    // Several grants on one item is the case a join multiplies, and the case
    // that bites is an item already visible by its audience: the grants outlive
    // an audience widened from `granted` to `investor`, every one of them joins,
    // and the predicate must still answer once.
    await getDb()
      .insertInto('content_grants')
      .values([
        { item_id: id['granted-to-a'], account_id: investorA.id, granted_by: admin.id },
        { item_id: id['granted-to-both'], account_id: investorA.id, granted_by: admin.id },
        { item_id: id['granted-to-both'], account_id: investorB.id, granted_by: admin.id },
        { item_id: id['investor-with-grants'], account_id: investorA.id, granted_by: admin.id },
        { item_id: id['investor-with-grants'], account_id: investorB.id, granted_by: admin.id },
      ])
      .execute();
  }, 180_000);

  afterAll(async () => {
    // Only the fixtures that were actually created: a setup that failed partway
    // leaves empty identifiers behind, and passing one to a uuid column would
    // fail the teardown with an error about the teardown rather than letting
    // the real failure be the one reported.
    const created = Object.values(id).filter((value) => value !== '');
    if (created.length > 0) {
      await getDb().deleteFrom('content_items').where('id', 'in', created).execute();
    }
    await getDb().deleteFrom('accounts').where('email', 'in', EMAILS).execute();
    await closeDb();
  });

  /**
   * The fixtures this reader may see, as the predicate alone decides it — the
   * shape a list or a search composes, with no join to hide a missing clause.
   */
  async function visible(reader: Actor | null): Promise<string[]> {
    const byId = new Map(Object.entries(id).map(([name, value]) => [value, name as Fixture]));
    const rows = await getDb()
      .selectFrom('content_items')
      .select('content_items.id')
      .where('content_items.id', 'in', Object.values(id))
      .where(visibleTo(reader))
      .execute();
    // An unmapped row shows its own identifier rather than borrowing another
    // fixture's name: a helper that mislabels turns a real failure into a
    // confusing one.
    return rows.map((row) => byId.get(row.id) ?? row.id).sort();
  }

  describe('visibleTo', () => {
    it('shows an anonymous visitor published public content and nothing else', async () => {
      expect(await visible(null)).toEqual(['public']);
    });

    it('shows an investor public and investor content, and a granted item they hold a grant for', async () => {
      expect(await visible(investorA)).toEqual([
        'granted-to-a',
        'granted-to-both',
        'investor',
        'investor-with-grants',
        'public',
        'published-with-open-draft',
      ]);
    });

    it('withholds a granted item from an investor who holds no grant for it', async () => {
      expect(await visible(investorB)).toEqual([
        'granted-to-both',
        'investor',
        'investor-with-grants',
        'public',
        'published-with-open-draft',
      ]);
    });

    it('shows an admin every audience and the unpublished item too', async () => {
      expect(await visible(admin)).toEqual([
        'draft',
        'granted-to-a',
        'granted-to-both',
        'investor',
        'investor-with-grants',
        'public',
        'public-draft',
        'published-with-open-draft',
      ]);
    });

    it('answers once for an item carrying several grants, so no caller needs a DISTINCT', async () => {
      for (const item of [id['granted-to-both'], id['investor-with-grants']]) {
        const rows = await getDb()
          .selectFrom('content_items')
          .select('content_items.id')
          .where('content_items.id', '=', item)
          .where(visibleTo(investorA))
          .execute();

        expect(rows).toHaveLength(1);
      }
    });
  });

  describe('forReader', () => {
    it('serves published public content to everyone, signed in or not', async () => {
      for (const reader of [null, investorA, investorB, admin]) {
        const view = await forReader(id.public, reader);
        expect(view?.revision.blocks).toEqual(body('public'));
      }
    });

    it('serves investor content to an investor and an admin, and not to a visitor', async () => {
      expect(await forReader(id.investor, null)).toBeNull();
      expect((await forReader(id.investor, investorA))?.revision.blocks).toEqual(body('investor'));
      expect((await forReader(id.investor, investorB))?.revision.blocks).toEqual(body('investor'));
      expect((await forReader(id.investor, admin))?.revision.blocks).toEqual(body('investor'));
    });

    it('serves a granted item to its grantee and to an admin, and to nobody else', async () => {
      const item = id['granted-to-a'];

      expect(await forReader(item, null)).toBeNull();
      expect(await forReader(item, investorB)).toBeNull();
      expect((await forReader(item, investorA))?.revision.blocks).toEqual(body('granted-to-a'));
      expect((await forReader(item, admin))?.revision.blocks).toEqual(body('granted-to-a'));
    });

    it('returns nothing for an unpublished item, to every reader including an admin', async () => {
      for (const item of [id.draft, id['public-draft']]) {
        for (const reader of [null, investorA, investorB, admin]) {
          expect(await forReader(item, reader)).toBeNull();
        }
      }
    });

    it('serves the published revision of an item that also has an open draft', async () => {
      const view = await forReader(id['published-with-open-draft'], investorA);

      expect(view?.revision.id).toBe(publishedRevisionId);
      expect(view?.revision.published_at).not.toBeNull();
      expect(view?.revision.blocks).toEqual(body('published-with-open-draft'));
    });

    it('answers an item that does not exist and one the reader may not see identically', async () => {
      const missing = await forReader(randomUUID(), investorB);
      const withheld = await forReader(id['granted-to-a'], investorB);

      expect(missing).toBeNull();
      expect(withheld).toBe(missing);
    });

    it('returns the item beside the revision, so a page has its title without a second read', async () => {
      const view = await forReader(id.public, null);

      expect(view?.item.id).toBe(id.public);
      expect(view?.item.audience).toBe('public');
      expect(view?.item.title).toBe('public');
    });
  });

  describe('forAuthor', () => {
    it('gives an admin the latest revision, unpublished, of a published item', async () => {
      const view = await forAuthor(id['published-with-open-draft'], admin);

      expect(view?.revision.id).toBe(openDraftRevisionId);
      expect(view?.revision.published_at).toBeNull();
      expect(view?.revision.blocks).toEqual(body('an unpublished edit'));
    });

    it('gives an admin an item that has never been published', async () => {
      const view = await forAuthor(id.draft, admin);

      expect(view?.item.id).toBe(id.draft);
      expect(view?.revision.published_at).toBeNull();
      expect(view?.revision.blocks).toEqual(body('draft'));
    });

    it('gives an investor nothing, whatever the item and whatever its audience', async () => {
      expect(await forAuthor(id.draft, investorA)).toBeNull();
      expect(await forAuthor(id.public, investorA)).toBeNull();
      expect(await forAuthor(id['granted-to-a'], investorA)).toBeNull();
      // The sharpest case: this item is one the investor may read, so the
      // predicate admits it, and the revision this function selects is the
      // newest rather than the published one. The role check is what stops the
      // unpublished body following the readable item out.
      expect(await forAuthor(id['published-with-open-draft'], investorA)).toBeNull();
    });

    it('gives an admin nothing for an item that does not exist', async () => {
      expect(await forAuthor(randomUUID(), admin)).toBeNull();
    });
  });

  describe('a role the vocabulary does not name', () => {
    // There is no such role today — AccountRole is investor and admin — so this
    // reader is cast past the type, standing in for a third role added later. It
    // must read nothing rather than inherit the investor's audience.
    const stranger = (): Actor => ({ id: investorA.id, role: 'auditor' as Actor['role'] });

    it('is admitted by the predicate to nothing', async () => {
      expect(await visible(stranger())).toEqual([]);
    });

    it('is served no investor content through forReader', async () => {
      expect(await forReader(id.investor, stranger())).toBeNull();
      expect(await forReader(id.public, stranger())).toBeNull();
    });
  });

  describe('forReader trusts neither invariant the pointer does not enforce', () => {
    it('returns nothing when the pointer names another item revision', async () => {
      // Point one item at another's published revision by a direct write, the
      // way a future writer's bug could. Without the join binding the revision
      // to its item, the first item's investor audience would serve the second
      // item's granted body to an investor holding no grant.
      const a = await createItem({ type: 'update', slug: `access-crossa-${randomUUID()}`, title: 'cross-a', kind: 'progress', audience: 'investor' });
      const b = await createItem({ type: 'update', slug: `access-crossb-${randomUUID()}`, title: 'cross-b', kind: 'progress', audience: 'granted' });
      try {
        const bRevision = await saveDraft(b.id, body('b-granted-secret'), admin.id);
        await publish(b.id, bRevision.id, admin.id);
        await getDb().updateTable('content_items').set({ current_revision_id: bRevision.id }).where('id', '=', a.id).execute();

        expect(await forReader(a.id, investorB)).toBeNull();
      } finally {
        await getDb().deleteFrom('content_items').where('id', 'in', [a.id, b.id]).execute();
      }
    });

    it('returns nothing when the pointer names an unpublished revision', async () => {
      const item = await createItem({ type: 'update', slug: `access-unpub-${randomUUID()}`, title: 'unpub', kind: 'progress', audience: 'public' });
      try {
        const draft = await saveDraft(item.id, body('unpublished body'), admin.id);
        // Bypass publish, which would stamp published_at: point straight at the draft.
        await getDb().updateTable('content_items').set({ current_revision_id: draft.id }).where('id', '=', item.id).execute();

        expect(await forReader(item.id, null)).toBeNull();
      } finally {
        await getDb().deleteFrom('content_items').where('id', '=', item.id).execute();
      }
    });
  });
});
