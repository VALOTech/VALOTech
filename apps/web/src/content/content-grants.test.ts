/**
 * Granting and revoking deck access, audited, with a suspended account refused
 * (`DECK-004/T1`, `DECK-004/T3`, `SEC-R04`).
 *
 * These are claims about what the writes record and refuse, so they run against a
 * real PostgreSQL — and on a database of their own, because `content_grants`
 * carries the `pinned_version` column folded into a shipped migration
 * (`DATA-R07`) node-pg-migrate will not re-apply to the shared development one.
 * The audit assertions read the `audit` table directly: a grant that did not
 * record is a privileged write with no trail, which is the failure `SEC-R04`
 * exists to forbid.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AccountState } from '../db/types';
import { closeDb, getDb } from '../db/index';

import { addGrant, grantsForAccount, removeGrant } from './grants';
import { createItem } from './items';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_grants';

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

describe.skipIf(!HAS_DATABASE)('deck access grants (DECK-004)', () => {
  let grantorId = '';

  async function aDeck(): Promise<string> {
    const item = await createItem({ type: 'deck', slug: `d-${randomUUID()}`, title: 'A deck', audience: 'granted' });
    return item.id;
  }

  async function account(state: AccountState): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `a-${randomUUID()}@example.test`, name: 'An investor', role: 'investor', state })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** The audit actions recorded against one account, oldest first. */
  async function auditActionsFor(subjectId: string): Promise<string[]> {
    const rows = await getDb()
      .selectFrom('audit')
      .select('action')
      .where('subject_id', '=', subjectId)
      .orderBy('id')
      .execute();
    return rows.map((row) => row.action);
  }

  async function grantExists(itemId: string, accountId: string): Promise<boolean> {
    const row = await getDb()
      .selectFrom('content_grants')
      .select('account_id')
      .where('item_id', '=', itemId)
      .where('account_id', '=', accountId)
      .executeTakeFirst();
    return row !== undefined;
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

    const grantor = await getDb()
      .insertInto('accounts')
      .values({ email: 'grants-admin@example.test', name: 'Admin', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    grantorId = grantor.id;
  }, 120_000);

  afterAll(closeDb);

  describe('grant and revoke, audited (T1)', () => {
    it('creates the grant and records a grant.add against the account', async () => {
      const deck = await aDeck();
      const grantee = await account('active');

      expect(await addGrant(deck, grantee, grantorId)).toBe(true);
      expect(await grantExists(deck, grantee)).toBe(true);
      expect(await auditActionsFor(grantee)).toEqual(['grant.add']);
    });

    it('removes the grant and records a grant.remove against the account', async () => {
      const deck = await aDeck();
      const grantee = await account('active');
      await addGrant(deck, grantee, grantorId);

      expect(await removeGrant(deck, grantee, grantorId)).toBe(true);
      expect(await grantExists(deck, grantee)).toBe(false);
      expect(await auditActionsFor(grantee)).toEqual(['grant.add', 'grant.remove']);
    });

    it('is idempotent: a repeated grant is a no-op that records nothing', async () => {
      const deck = await aDeck();
      const grantee = await account('active');

      expect(await addGrant(deck, grantee, grantorId)).toBe(true);
      expect(await addGrant(deck, grantee, grantorId)).toBe(false);
      expect(await auditActionsFor(grantee)).toEqual(['grant.add']);
    });

    it('revoking a grant that does not exist returns false and records nothing', async () => {
      const deck = await aDeck();
      const grantee = await account('active');

      expect(await removeGrant(deck, grantee, grantorId)).toBe(false);
      expect(await auditActionsFor(grantee)).toEqual([]);
    });
  });

  describe('a grant against an account state (T3)', () => {
    it('refuses a suspended account, writing neither the grant nor an audit row', async () => {
      const deck = await aDeck();
      const suspended = await account('suspended');

      await expect(addGrant(deck, suspended, grantorId)).rejects.toThrow(/suspended/);
      expect(await grantExists(deck, suspended)).toBe(false);
      expect(await auditActionsFor(suspended)).toEqual([]);
    });

    it('allows an invited account, since access begins when they accept', async () => {
      const deck = await aDeck();
      const invited = await account('invited');

      expect(await addGrant(deck, invited, grantorId)).toBe(true);
      expect(await grantExists(deck, invited)).toBe(true);
    });

    it('allows an active account', async () => {
      const deck = await aDeck();
      const active = await account('active');

      expect(await addGrant(deck, active, grantorId)).toBe(true);
    });
  });

  describe('the grants an account holds (LEGAL-GLOBAL-001/T2, DECK-004/T5)', () => {
    it('lists the account grants with the pin, and nothing for another account', async () => {
      const deckA = await aDeck();
      const deckB = await aDeck();
      const grantee = await account('active');
      const other = await account('active');
      await addGrant(deckA, grantee, grantorId, 2);
      await addGrant(deckB, grantee, grantorId); // unpinned
      await addGrant(deckA, other, grantorId); // a different account's grant

      const grants = await grantsForAccount(grantee);
      expect(grants).toHaveLength(2);
      expect(grants.find((g) => g.itemId === deckA)?.pinnedVersion).toBe(2);
      expect(grants.find((g) => g.itemId === deckB)?.pinnedVersion).toBeNull();
    });

    it('returns nothing for an account with no grants', async () => {
      const grantee = await account('active');
      expect(await grantsForAccount(grantee)).toEqual([]);
    });
  });
});
