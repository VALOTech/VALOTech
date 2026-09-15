/**
 * That a registration changes nothing about who may read what (`AUTH-005/T4`,
 * `INV-DEC-02`, `CMS-R03`, `DATA-R05`).
 *
 * `AUTH-005` introduces a second kind of reader and withholds one block of the
 * landing from them, and the promise it makes in exchange is that the withholding
 * stops at the landing: what a reader may open stays entirely with their grants
 * and the item's audience, through the one predicate every content query
 * composes. That promise is the clause most likely to rot, and it rots invisibly
 * — a page still renders, somebody still reads it, and nothing raises.
 *
 * So the same fixtures are put through the predicate for two readers identical in
 * everything that does decide access and differing only in the type, and the sets
 * are compared to each other and across every state of the column. A clause that
 * had crept from the board into a content read, in either direction, moves one of
 * those sets and fails here.
 *
 * It sits beside the predicate rather than beside the landing because a read of a
 * content table belongs in this module and nowhere else, which
 * `check-content-access.py` enforces rather than trusts. The landing's own half —
 * that the board is withheld at all — is `src/app/hall/reader.test.ts`.
 *
 * The last case is the one that reads as a defect and is the measurement the door
 * is shut on. It is pinned rather than described, so the question it raises
 * cannot quietly stop being true.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';
import { INVESTOR_TYPES, type ContentAudience, type InvestorType } from '../db/types';

import { visibleTo } from './access';
import type { Block } from './blocks';
import { grantedDecksForAccount } from './decks';
import { addGrant } from './grants';
import { createItem, saveDraft } from './items';
import { publish } from './publish';
import { forReader } from './read';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_prospect_access';

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

/** Every state the column has, so no case is reached by only one of them. */
const EVERY_TYPE: readonly (InvestorType | null)[] = [null, ...INVESTOR_TYPES];

type Fixture = 'open-to-all' | 'for-investors' | 'granted-to-prospect' | 'granted-to-neither';

function body(text: string): Block[] {
  return [{ type: 'heading', level: 2, text }];
}

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

describe.skipIf(!HAS_DATABASE)('what a reader still deciding may read (AUTH-005/T4)', () => {
  let admin: Actor;
  let prospect: Actor;
  let invested: Actor;

  const id: Record<Fixture, string> = {
    'open-to-all': '',
    'for-investors': '',
    'granted-to-prospect': '',
    'granted-to-neither': '',
  };

  async function account(name: string, role: Actor['role'], type: InvestorType | null): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({
        email: `${name}-${randomUUID()}@prospect-access.test`,
        name,
        role,
        state: 'active',
        investor_type: type,
      })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();

    return { id: row.id, role: row.role };
  }

  async function seed(name: Fixture, audience: ContentAudience): Promise<void> {
    const item = await createItem({
      type: 'update',
      slug: `prospect-access-${name}-${randomUUID()}`,
      title: name,
      kind: 'progress',
      audience,
    });
    const revision = await saveDraft(item.id, body(name), admin.id);
    await publish(item.id, revision.id, admin.id);
    id[name] = item.id;
  }

  /** What the predicate alone admits for this reader, by fixture name. */
  async function visible(reader: Actor): Promise<string[]> {
    const byId = new Map(Object.entries(id).map(([name, value]) => [value, name]));
    const rows = await getDb()
      .selectFrom('content_items')
      .select('content_items.id')
      .where('content_items.id', 'in', Object.values(id))
      .where(visibleTo(reader))
      .execute();

    return rows.map((row) => byId.get(row.id) ?? row.id).sort();
  }

  async function classify(reader: Actor, type: InvestorType | null): Promise<void> {
    await getDb()
      .updateTable('accounts')
      .set({ investor_type: type })
      .where('id', '=', reader.id)
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

    admin = await account('admin', 'admin', null);
    prospect = await account('prospect', 'investor', 'prospect');
    invested = await account('invested', 'investor', 'current');

    await seed('open-to-all', 'public');
    await seed('for-investors', 'investor');
    await seed('granted-to-prospect', 'granted');
    await seed('granted-to-neither', 'granted');

    // Made identical in the thing that does decide access, so the only
    // difference any case below introduces is the type itself.
    await addGrant(id['granted-to-prospect'], prospect.id, admin.id);
    await addGrant(id['granted-to-prospect'], invested.id, admin.id);
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it('shows a prospect and a reader who has invested exactly the same documents', async () => {
    expect(await visible(prospect)).toEqual(await visible(invested));
  });

  it('shows the same set under every state of the column', async () => {
    const mover = await account('mover', 'investor', null);
    await addGrant(id['granted-to-prospect'], mover.id, admin.id);
    const unclassified = await visible(mover);

    for (const type of EVERY_TYPE) {
      await classify(mover, type);
      expect({ type, seen: await visible(mover) }).toEqual({ type, seen: unclassified });
    }
  });

  it('opens no granted document to a prospect who holds no grant', async () => {
    // The widening direction, and the one that would be a disclosure rather than
    // a nuisance. A registration writes no grant at all, so this is the state
    // every account it creates starts in.
    const fresh = await account('fresh', 'investor', 'prospect');

    expect(await forReader(id['granted-to-neither'], prospect)).toBeNull();
    expect(await forReader(id['granted-to-prospect'], fresh)).toBeNull();
    expect(await grantedDecksForAccount(fresh.id)).toEqual([]);
  });

  it('withholds no granted document from a prospect who holds one', async () => {
    const read = await forReader(id['granted-to-prospect'], prospect);

    expect(read?.revision.blocks).toEqual(body('granted-to-prospect'));
  });

  it('hands the predicate a reader carrying no type for it to read', async () => {
    // `Actor` is what every content query composes its predicate from, and it is
    // an id and a role. A clause reading the column would have to widen the auth
    // boundary first, which is a deliberate act rather than a line in a query —
    // and the landing reads the column without ever putting it on this object.
    expect(Object.keys(prospect).sort()).toEqual(['id', 'role']);
  });

  it('admits an invited reader to the investor audience whatever their type says', async () => {
    // The type has never gated and still does not. Somebody an admin invited by
    // name holds the `investor` role, so `CMS-006` admits them to the `investor`
    // audience — whether the company has recorded them as having invested or as
    // still deciding.
    expect(await visible(prospect)).toContain('for-investors');
  });

  it('withholds the investor audience from somebody who registered themselves', async () => {
    // `AUTH-DEC-06`, and the reason it is a role rather than a habit. The two
    // readers below differ in nothing an admin chose per document: one was
    // invited and one arrived through `AUTH-005`, and only the second is held to
    // what the company publishes openly.
    const registered = await account('registered', 'prospect', 'prospect');

    expect(await visible(registered)).toEqual(['open-to-all']);
    expect(await visible(prospect)).toContain('for-investors');
  });

  it('is fail-closed for an item nobody thought about, because the column defaults to investor', async () => {
    // This is what makes the role worth its cost. An admin who creates a report
    // and never touches the audience has published it to investors, and the
    // registered reader is outside that by construction rather than by anybody
    // having remembered a dropdown.
    const defaulted = await createItem({
      type: 'report',
      slug: `prospect-access-default-${randomUUID()}`,
      title: 'a report nobody narrowed',
      period: '2026-Q3',
    });
    expect(defaulted.audience).toBe('investor');

    // Both halves, because `not.toContain` alone is satisfied by a reader who
    // sees nothing at all -- which is what a broken predicate returns, and it
    // would look like a pass. The open item is what tells the two apart.
    const registered = await account('unnarrowed', 'prospect', null);
    const seen = await visible(registered);

    expect(seen).toContain('open-to-all');
    expect(seen).not.toContain(defaulted.slug);
  });

  it('opens a granted document to a registered reader who is named on it', async () => {
    // An admin who wants one named person to read one document should not have
    // to promote them to do it, so the grant clause is the registered reader's
    // too — the role narrows the audience and never the grant.
    const registered = await account('granted-registered', 'prospect', null);

    expect(await visible(registered)).not.toContain('granted-to-neither');
    await addGrant(id['granted-to-neither'], registered.id, admin.id);
    expect(await visible(registered)).toContain('granted-to-neither');
  });
});
