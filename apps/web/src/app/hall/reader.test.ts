/**
 * Which blocks the hall's landing is composed from for a reader still deciding
 * (`AUTH-005/T4`, `INV-DEC-02`).
 *
 * The board is withheld from a prospect because it carries a stage and a
 * headline per product that the public gateway does not publish: a block shown
 * to anybody who can type an address would make it public by a side door,
 * without anybody deciding it should be.
 *
 * That is the order and weight `INV-DEC-02` reserves to the reader's type, and
 * the half of that decision this file cannot see is the other half: that
 * withholding the block changes nothing about any document. That claim lives
 * beside the predicate it is about, in `src/content/prospect-access.test.ts`,
 * because a read of a content table belongs in the content module and nowhere
 * else (`check-content-access.py`).
 *
 * On a database of its own, because the rows are this suite's.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../../auth/gate';
import { closeDb, getDb } from '../../db/index';
import { PORTFOLIO_PRODUCTS, type InvestorType } from '../../db/types';

import { progressBoardFor } from './reader';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_hall_reader';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'migrations');

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

describe.skipIf(!HAS_DATABASE)('the progress board a reader is composed (AUTH-005/T4)', () => {
  let admin: Actor;
  let prospect: Actor;
  let invested: Actor;

  async function account(name: string, role: Actor['role'], type: InvestorType | null): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({
        email: `${name}-${randomUUID()}@hall-reader.test`,
        name,
        role,
        state: 'active',
        investor_type: type,
      })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();

    return { id: row.id, role: row.role };
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

    await getDb()
      .insertInto('portfolio')
      .values(
        PORTFOLIO_PRODUCTS.map((product) => ({
          product,
          stage: 'building' as const,
          headline: `${product} is not published on the gateway`,
          updated_by: admin.id,
        })),
      )
      .execute();
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it('is not composed for a reader recorded as still deciding', async () => {
    // `null` and not an empty board: an empty board is a state the landing has
    // words for, and this reader must not be told it.
    expect(await progressBoardFor(prospect.id)).toBeNull();
  });

  it('is composed for a reader who has invested, and for one nobody has classified', async () => {
    const unclassified = await account('unclassified', 'investor', null);

    for (const reader of [invested, unclassified, admin]) {
      const board = await progressBoardFor(reader.id);
      expect({ reader: reader.id, products: board?.map((entry) => entry.product) }).toEqual({
        reader: reader.id,
        products: [...PORTFOLIO_PRODUCTS],
      });
    }
  });

  it('carries the headline the gateway does not publish, which is why it is withheld', async () => {
    const board = await progressBoardFor(invested.id);

    expect(board?.every((entry) => entry.headline !== null)).toBe(true);
    expect(await progressBoardFor(prospect.id)).toBeNull();
  });

  it('follows the type rather than the account, so reclassifying moves it', async () => {
    const mover = await account('mover', 'investor', 'current');

    expect(await progressBoardFor(mover.id)).not.toBeNull();
    await classify(mover, 'prospect');
    expect(await progressBoardFor(mover.id)).toBeNull();
    await classify(mover, 'current');
    expect(await progressBoardFor(mover.id)).not.toBeNull();
  });
});
