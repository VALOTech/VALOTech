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
import { deckRevisionFor } from './decks';
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
});
