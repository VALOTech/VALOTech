/**
 * A deck's monotonic publication version (`DECK-002/T1`, `CMS-R01`).
 *
 * The requirement this exists for is that an investor shown one version must not
 * be silently shown another, and the only truthful answer to "which version did
 * they read" is one recorded at the time. So a deck revision takes a monotonic
 * version at publication, never reused and never renumbered — a withdrawn version
 * leaves a hole so a pin to it keeps resolving. It is a claim about what
 * `publish` writes, so it runs against a real PostgreSQL, and on a database of
 * its own because the `version` column is folded into a shipped migration
 * (`DATA-R07`) node-pg-migrate will not re-apply to the shared development one.
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
import { deckRevisionFor, decksGrantedButNeverOpened, recordDeckRead } from './decks';
import { addGrant } from './grants';
import { createItem, saveDraft } from './items';
import { publish, withdraw } from './publish';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_decks';

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

const body = (text: string): Block[] => [{ type: 'heading', level: 2, text }];

describe.skipIf(!HAS_DATABASE)('a deck publication version (DECK-002/T1)', () => {
  let authorId = '';

  async function aDeck(): Promise<string> {
    const item = await createItem({ type: 'deck', slug: `d-${randomUUID()}`, title: 'A deck', audience: 'granted' });
    return item.id;
  }

  /** Save a new revision of the item and publish it, returning the revision id. */
  async function publishRevision(itemId: string, text: string): Promise<string> {
    const revision = await saveDraft(itemId, body(text), authorId);
    await publish(itemId, revision.id, authorId);
    return revision.id;
  }

  /** The version stored on a revision — read straight from the column the DTO omits. */
  async function versionOf(revisionId: string): Promise<number | null> {
    const row = await getDb()
      .selectFrom('content_revisions')
      .select('version')
      .where('id', '=', revisionId)
      .executeTakeFirstOrThrow();
    return row.version;
  }

  async function investor(email: string): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name: email, role: 'investor', state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
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

    const author = await getDb()
      .insertInto('accounts')
      .values({ email: 'decks-author@example.test', name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(closeDb);

  it('numbers successive publications of a deck monotonically from one', async () => {
    const deck = await aDeck();
    const first = await publishRevision(deck, 'first');
    const second = await publishRevision(deck, 'second');

    expect(await versionOf(first)).toBe(1);
    expect(await versionOf(second)).toBe(2);
  });

  it('numbers each deck from its own one, not a global sequence', async () => {
    const deckA = await aDeck();
    const deckB = await aDeck();
    const a = await publishRevision(deckA, 'a');
    const b = await publishRevision(deckB, 'b');

    expect(await versionOf(a)).toBe(1);
    expect(await versionOf(b)).toBe(1);
  });

  it('keeps a revision its version when it is re-published, so the version they read resolves', async () => {
    const deck = await aDeck();
    const first = await publishRevision(deck, 'first');
    await publishRevision(deck, 'second');

    // Re-publish the first revision: it keeps v1 rather than taking a new number.
    await publish(deck, first, authorId);
    expect(await versionOf(first)).toBe(1);
  });

  it('leaves a hole rather than reusing a number when a version is withdrawn', async () => {
    const deck = await aDeck();
    await publishRevision(deck, 'one'); // v1
    await publishRevision(deck, 'two'); // v2
    await publishRevision(deck, 'three'); // v3
    await withdraw(deck, authorId); // pointer back to v2; v3 keeps its number

    const next = await publishRevision(deck, 'four');
    expect(await versionOf(next)).toBe(4);
  });

  it('assigns no version to a report or an update — the column stays null', async () => {
    const update = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'An update', kind: 'progress' });
    const revision = await publishRevision(update.id, 'news');
    expect(await versionOf(revision)).toBeNull();
  });

  describe('a pinned grant (DECK-002/T2, T6)', () => {
    it('stores the pin on the grant, and null when unpinned', async () => {
      const deck = await aDeck();
      await publishRevision(deck, 'v1');
      const pinned = await investor(`pin-${randomUUID()}@example.test`);
      const unpinned = await investor(`nopin-${randomUUID()}@example.test`);
      await addGrant(deck, pinned.id, authorId, 1);
      await addGrant(deck, unpinned.id, authorId);

      const rows = await getDb()
        .selectFrom('content_grants')
        .select(['account_id', 'pinned_version'])
        .where('item_id', '=', deck)
        .execute();
      expect(rows.find((r) => r.account_id === pinned.id)?.pinned_version).toBe(1);
      expect(rows.find((r) => r.account_id === unpinned.id)?.pinned_version).toBeNull();
    });

    it('serves a pinned grantee their version and an unpinned grantee the current one', async () => {
      const deck = await aDeck();
      await publishRevision(deck, 'v1'); // v1 current
      const pinned = await investor(`pin-${randomUUID()}@example.test`);
      const unpinned = await investor(`nopin-${randomUUID()}@example.test`);
      await addGrant(deck, pinned.id, authorId, 1);
      await addGrant(deck, unpinned.id, authorId);
      await publishRevision(deck, 'v2'); // v2 current now

      expect((await deckRevisionFor(deck, pinned))?.version).toBe(1);
      expect((await deckRevisionFor(deck, unpinned))?.version).toBe(2);
    });

    it('keeps a pin resolving after the pinned version is withdrawn (T6)', async () => {
      const deck = await aDeck();
      await publishRevision(deck, 'v1');
      await publishRevision(deck, 'v2'); // v2 current
      const pinned = await investor(`pin-${randomUUID()}@example.test`);
      await addGrant(deck, pinned.id, authorId, 2);

      await withdraw(deck, authorId); // pointer back to v1; v2's revision survives

      expect((await deckRevisionFor(deck, pinned))?.version).toBe(2);
    });

    it('refuses a non-grantee and serves an admin the current version', async () => {
      const deck = await aDeck();
      await publishRevision(deck, 'v1');
      const stranger = await investor(`stranger-${randomUUID()}@example.test`);

      expect(await deckRevisionFor(deck, stranger)).toBeNull();
      expect((await deckRevisionFor(deck, { id: authorId, role: 'admin' }))?.version).toBe(1);
    });
  });

  describe('speaker context (DECK-001/T5)', () => {
    it('strips a heading speaker context from the read path, leaving the rest intact', async () => {
      const deck = await aDeck();
      const withContext: Block[] = [
        { type: 'heading', level: 2, text: 'Section', context: 'what the presenter says' },
        { type: 'paragraph', text: 'on the page', marks: [] },
      ];
      const revision = await saveDraft(deck, withContext, authorId);
      await publish(deck, revision.id, authorId);
      const reader = await investor(`ctx-${randomUUID()}@example.test`);
      await addGrant(deck, reader.id, authorId);

      const view = await deckRevisionFor(deck, reader);
      const blocks = view?.revision.blocks as { type: string; level: number; text: string; context?: string }[];
      // The heading is served without its context; the paragraph is untouched.
      expect(blocks[0]).toEqual({ type: 'heading', level: 2, text: 'Section' });
      expect(blocks[1]).toEqual({ type: 'paragraph', text: 'on the page', marks: [] });
    });
  });

  describe('the read record (DECK-002/T4)', () => {
    const OLD = new Date('2020-01-01T00:00:00.000Z');

    async function readsFor(accountId: string, deckId: string) {
      return getDb()
        .selectFrom('deck_reads')
        .selectAll()
        .where('account_id', '=', accountId)
        .where('deck_id', '=', deckId)
        .orderBy('version')
        .execute();
    }

    it('records the version the reader was shown', async () => {
      const deck = await aDeck();
      const reader = await investor(`read-${randomUUID()}@example.test`);
      await recordDeckRead(reader.id, deck, 2);

      const rows = await readsFor(reader.id, deck);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.version).toBe(2);
    });

    it('keeps a distinct row for each version of the same deck', async () => {
      const deck = await aDeck();
      const reader = await investor(`read-${randomUUID()}@example.test`);
      await recordDeckRead(reader.id, deck, 1);
      await recordDeckRead(reader.id, deck, 2);

      expect((await readsFor(reader.id, deck)).map((row) => row.version)).toEqual([1, 2]);
    });

    it('keeps first_opened_at and advances last_opened_at on a re-open, in one row', async () => {
      const deck = await aDeck();
      const reader = await investor(`read-${randomUUID()}@example.test`);
      await recordDeckRead(reader.id, deck, 1);
      // Backdate both stamps so a re-open's now() is distinguishable from the first.
      await getDb()
        .updateTable('deck_reads')
        .set({ first_opened_at: OLD, last_opened_at: OLD })
        .where('account_id', '=', reader.id)
        .where('deck_id', '=', deck)
        .where('version', '=', 1)
        .execute();
      await recordDeckRead(reader.id, deck, 1);

      const rows = await readsFor(reader.id, deck);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.first_opened_at).toEqual(OLD);
      const last = rows[0]?.last_opened_at ?? OLD;
      expect(last.getTime()).toBeGreaterThan(OLD.getTime());
    });

    it('deletes the read record with the account (DATA-002)', async () => {
      const deck = await aDeck();
      const reader = await investor(`read-${randomUUID()}@example.test`);
      await recordDeckRead(reader.id, deck, 1);

      await getDb().deleteFrom('accounts').where('id', '=', reader.id).execute();
      expect(await readsFor(reader.id, deck)).toHaveLength(0);
    });

    it('records nothing for an account that objected to read-tracking (LEGAL-GLOBAL-001/T3)', async () => {
      const deck = await aDeck();
      const reader = await investor(`obj-${randomUUID()}@example.test`);
      await getDb().updateTable('accounts').set({ read_tracking_objected: true }).where('id', '=', reader.id).execute();

      await recordDeckRead(reader.id, deck, 1);
      expect(await readsFor(reader.id, deck)).toHaveLength(0);
    });
  });

  describe('decks granted but never opened (ADMIN-002/T2)', () => {
    /** One account's unopened-deck rows, by its unique name — the isolated database accumulates other tests' grants. */
    async function unopenedFor(accountName: string) {
      return (await decksGrantedButNeverOpened()).filter((row) => row.accountName === accountName);
    }

    /** An investor in a chosen state, named uniquely so the whole-table read can be filtered to it. */
    async function accountInState(state: 'active' | 'suspended' | 'invited'): Promise<{ id: string; name: string }> {
      const name = `att-${state}-${randomUUID()}@example.test`;
      const row = await getDb()
        .insertInto('accounts')
        .values({ email: name, name, role: 'investor', state })
        .returning('id')
        .executeTakeFirstOrThrow();
      return { id: row.id, name };
    }

    it('lists a deck an active investor was granted and has never opened', async () => {
      const deck = await aDeck();
      const reader = await accountInState('active');
      await addGrant(deck, reader.id, authorId);

      const mine = await unopenedFor(reader.name);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ deckTitle: 'A deck', accountName: reader.name });
      expect(mine[0]?.grantedAt).toBeInstanceOf(Date);
    });

    it('drops the grant once the deck has been opened, at any version', async () => {
      const deck = await aDeck();
      const reader = await accountInState('active');
      await addGrant(deck, reader.id, authorId);
      await recordDeckRead(reader.id, deck, 1);

      expect(await unopenedFor(reader.name)).toHaveLength(0);
    });

    it('omits an account that is not active, who cannot open the deck', async () => {
      const deck = await aDeck();

      // Invited: a grant is allowed, but they cannot sign in to open it yet.
      const invited = await accountInState('invited');
      await addGrant(deck, invited.id, authorId);

      // Suspended after the grant: granted while active, then suspended.
      const suspended = await accountInState('active');
      await addGrant(deck, suspended.id, authorId);
      await getDb().updateTable('accounts').set({ state: 'suspended' }).where('id', '=', suspended.id).execute();

      expect(await unopenedFor(invited.name)).toHaveLength(0);
      expect(await unopenedFor(suspended.name)).toHaveLength(0);
    });

    it('omits a granted item that is not a deck', async () => {
      const report = await createItem({
        type: 'report',
        slug: `att-r-${randomUUID()}`,
        title: 'A report',
        period: '2027-Q1',
        audience: 'granted',
      });
      const reader = await accountInState('active');
      await addGrant(report.id, reader.id, authorId);

      expect(await unopenedFor(reader.name)).toHaveLength(0);
    });

    it('orders the longest-waiting grant first', async () => {
      const older = await aDeck();
      const newer = await aDeck();
      const reader = await accountInState('active');
      await addGrant(older, reader.id, authorId);
      await addGrant(newer, reader.id, authorId);

      const OLD = new Date('2019-01-01T00:00:00.000Z');
      await getDb()
        .updateTable('content_grants')
        .set({ granted_at: OLD })
        .where('item_id', '=', older)
        .where('account_id', '=', reader.id)
        .execute();

      const mine = await unopenedFor(reader.name);
      expect(mine).toHaveLength(2);
      expect(mine[0]?.grantedAt).toEqual(OLD);
      expect(mine[1]?.grantedAt.getTime() ?? 0).toBeGreaterThan(OLD.getTime());
    });
  });
});
