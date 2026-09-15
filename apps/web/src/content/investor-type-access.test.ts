/**
 * That `accounts.investor_type` cannot change what a reader may read
 * (`ADMIN-001/T11`, `INV-DEC-02`, `CMS-006`).
 *
 * The decision that put the column on the account made one promise that outlives
 * every surface built on it: the type decides the **order** of the blocks on the
 * hall's landing and decides **nothing** about access, because a second column
 * able to withhold a document would be a second access model, and the second one
 * is the one that goes stale when the rule changes. A reader set to the wrong
 * type must see an oddly ordered page and never a document that is not theirs.
 *
 * That promise is the clause most likely to rot, and it rots invisibly: a page
 * still renders, somebody still reads it, and nothing raises. So it is pinned
 * here, twice over and in two different ways.
 *
 * **Behaviourally.** Two investors differing only in their type, holding the same
 * grants, are put through the predicate every content query composes and through
 * the read a page calls. The sets they see are compared to each other and to what
 * they saw before either was classified. A clause reading the column into
 * `visibleTo` — in either direction, widening or withholding — moves one of those
 * sets and fails here.
 *
 * **Structurally.** The predicate is handed an `Actor`, which the gate builds from
 * an id and a role and nothing else, so `visibleTo` has no path to this column at
 * all. A clause that read it would first have to widen what the gate resolves,
 * which is a change to the auth boundary rather than a line in a query.
 *
 * On a database of its own: `accounts.investor_type` is folded into a shipped
 * migration (`DATA-R07`), which node-pg-migrate will not re-apply to the shared
 * development one.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';
import { type ContentAudience, INVESTOR_TYPES, type InvestorType } from '../db/types';

import { visibleTo } from './access';
import type { Block } from './blocks';
import { addGrant } from './grants';
import { createItem, saveDraft } from './items';
import { publish } from './publish';
import { forReader } from './read';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_investor_type_access';

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

/** The states the column has, written out so a test iterates all three. */
const EVERY_STATE: readonly (InvestorType | null)[] = [null, ...INVESTOR_TYPES];

type Fixture = 'public' | 'investor' | 'granted-to-a' | 'granted-to-neither';

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

describe.skipIf(!HAS_DATABASE)('investor_type orders the hall and gates nothing', () => {
  let admin: Actor;
  let investorA: Actor;
  let investorB: Actor;

  const id: Record<Fixture, string> = {
    public: '',
    investor: '',
    'granted-to-a': '',
    'granted-to-neither': '',
  };

  async function account(name: string, role: Actor['role']): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `${name}-${randomUUID()}@investor-type-access.test`, name, role, state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();

    return { id: row.id, role: row.role };
  }

  async function seed(name: Fixture, audience: ContentAudience): Promise<string> {
    const item = await createItem({
      type: 'update',
      slug: `investor-type-${name}-${randomUUID()}`,
      title: name,
      kind: 'progress',
      audience,
    });
    const revision = await saveDraft(item.id, body(name), admin.id);
    await publish(item.id, revision.id, admin.id);
    id[name] = item.id;

    return item.id;
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

  /** Set the column directly: this file is about the predicate, not about the act. */
  async function classify(reader: Actor, investorType: InvestorType | null): Promise<void> {
    await getDb()
      .updateTable('accounts')
      .set({ investor_type: investorType })
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
      log: () => {},
    });

    admin = await account('admin', 'admin');
    investorA = await account('investor-a', 'investor');
    investorB = await account('investor-b', 'investor');

    await seed('public', 'public');
    await seed('investor', 'investor');
    await seed('granted-to-a', 'granted');
    await seed('granted-to-neither', 'granted');

    // The two investors are made identical in the thing that does decide access,
    // so the only difference any test below introduces is the type.
    await addGrant(id['granted-to-a'], investorA.id, admin.id);
    await addGrant(id['granted-to-a'], investorB.id, admin.id);
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it('shows an unclassified investor exactly their grants and audiences', async () => {
    expect(await visible(investorA)).toEqual(['granted-to-a', 'investor', 'public']);
  });

  it('shows the same set under every state of the column', async () => {
    const unclassified = await visible(investorA);

    for (const state of EVERY_STATE) {
      await classify(investorA, state);

      expect({ state, seen: await visible(investorA) }).toEqual({ state, seen: unclassified });
    }
  });

  it('keeps two readers who differ only in type seeing exactly the same documents', async () => {
    await classify(investorA, 'current');
    await classify(investorB, 'prospect');

    expect(await visible(investorA)).toEqual(await visible(investorB));
  });

  it('opens no document to a reader recorded as having invested', async () => {
    for (const state of EVERY_STATE) {
      await classify(investorA, state);

      // Granted to nobody, so no type may reach it — the widening direction, and
      // the one that would be a disclosure rather than a nuisance.
      expect({ state, read: await forReader(id['granted-to-neither'], investorA) }).toEqual({
        state,
        read: null,
      });
    }
  });

  it('withholds no document from a reader recorded as deciding', async () => {
    for (const state of EVERY_STATE) {
      await classify(investorA, state);

      const read = await forReader(id['granted-to-a'], investorA);

      expect({ state, seen: read?.revision.blocks }).toEqual({ state, seen: body('granted-to-a') });
    }
  });

  it('hands the predicate a reader carrying no type for it to read', async () => {
    await classify(investorA, 'current');

    // `Actor` is what every content query composes its predicate from, and it is
    // an id and a role. A clause reading the column would have to widen the auth
    // boundary first, which is a deliberate act rather than a line in a query.
    expect(Object.keys(investorA).sort()).toEqual(['id', 'role']);
  });
});
