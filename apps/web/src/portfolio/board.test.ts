/**
 * The board's read (`INV-003`).
 *
 * One property carries most of the weight: **always all six**. A product omitted
 * because nobody has written its row reads as a product that no longer exists,
 * and a board that quietly drops a product is worse than one that admits it has
 * nothing to say — so the test that matters is the one against an empty table.
 *
 * Against a real PostgreSQL on a database of its own, because the fill happens
 * around what a query returned and a fake would be asserting the fill against
 * itself.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import { PORTFOLIO_PRODUCTS } from '../db/types';

import { standing, standingOf } from './board';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_portfolio_board';

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

describe.skipIf(!HAS_DATABASE)('where each product stands (INV-003)', () => {
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
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await getDb().deleteFrom('portfolio').execute();
  });

  it('answers all six even when the table is empty', async () => {
    const board = await standing();

    expect(board.map((entry) => entry.product)).toEqual([...PORTFOLIO_PRODUCTS]);
    // Filled, and marked as filled: the stage is this module's assumption and a
    // surface has to be able to tell that from a statement somebody made.
    expect(board.every((entry) => entry.stage === 'building')).toBe(true);
    expect(board.every((entry) => entry.set === false)).toBe(true);
    expect(board.every((entry) => entry.headline === null)).toBe(true);
    expect(board.every((entry) => entry.changedAt === null)).toBe(true);
  });

  it('answers all six when only some have rows, and says which are which', async () => {
    await getDb()
      .insertInto('portfolio')
      .values({ product: 'shimmra', stage: 'in market', headline: 'Open to idols in Japan.' })
      .execute();

    const board = await standing();

    expect(board).toHaveLength(PORTFOLIO_PRODUCTS.length);

    const shimmra = standingOf(board, 'shimmra');
    expect(shimmra).toMatchObject({ stage: 'in market', headline: 'Open to idols in Japan.', set: true });
    expect(shimmra?.changedAt).toBeInstanceOf(Date);

    // The other five are still there, and still honestly unset.
    expect(board.filter((entry) => !entry.set)).toHaveLength(PORTFOLIO_PRODUCTS.length - 1);
  });

  it('keeps the products in one order however the rows were written', async () => {
    // Written in reverse, so a read that returned the database's order would
    // come back reversed and a reader would have to re-scan the board.
    for (const product of [...PORTFOLIO_PRODUCTS].reverse()) {
      await getDb().insertInto('portfolio').values({ product, stage: 'paused' }).execute();
    }

    expect((await standing()).map((entry) => entry.product)).toEqual([...PORTFOLIO_PRODUCTS]);
  });

  it('reads a paused product as paused, because that is the word nobody wants to write', async () => {
    await getDb()
      .insertInto('portfolio')
      .values({ product: 'farola', stage: 'paused', headline: 'Held while the others ship.' })
      .execute();

    expect(standingOf(await standing(), 'farola')).toMatchObject({ stage: 'paused', set: true });
  });

  describe('one product out of the board', () => {
    it('answers null for the company, which is a tag and not a product', async () => {
      // `company` is what an update may be tagged with (`POST-001/T3`) and is
      // deliberately not a board row: the board is where products stand.
      expect(standingOf(await standing(), 'company')).toBeNull();
    });

    it('answers null for anything that names nothing', async () => {
      expect(standingOf(await standing(), '')).toBeNull();
      expect(standingOf(await standing(), 'not-a-product')).toBeNull();
    });
  });
});
