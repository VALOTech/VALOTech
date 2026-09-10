/**
 * Content survives the erasure of the account that authored or was granted it
 * (`DATA-002/T5`). The erasure function is `admin/accounts`' `eraseAccount`
 * (`DATA-002/T2`); this proves the content side of the manifest's split — what a
 * person did on the company's behalf stays behind with a null actor, while what
 * was about them goes. It lives in the content module because the content tables
 * are reachable only from here (`CMS-006`), so a test that reads them to check
 * the cascade is a content-module test whichever feature drives the deletion.
 *
 * It runs against the development database (`DATABASE_URL`), not the isolated one
 * `admin/accounts.test.ts` needs: the subject of every erasure here is an
 * investor, so `eraseAccount`'s last-active-admin guard never fires and the
 * result does not depend on what other suites have written to the admin set.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eraseAccount } from '../admin/accounts';
import { closeDb, getDb } from '../db/index';
import type { AccountRole } from '../db/types';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

/** A recognisable label on every account this suite mints; the UUID makes it unique. */
const SUITE_DOMAIN = '@erasure-survival.test';

describe.skipIf(!HAS_DATABASE)('DATA-002/T5 content survives erasure', () => {
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
  }, 120_000);

  afterAll(async () => {
    // The accounts this suite mints are erased by the tests or removed here; the
    // revisions they authored survive by design, with a null author, and are
    // left behind the way the CMS suite leaves its own content.
    await getDb().deleteFrom('accounts').where('email', 'like', `%${SUITE_DOMAIN}`).execute();
    await closeDb();
  });

  async function newAccount(role: AccountRole = 'investor'): Promise<string> {
    const account = await getDb()
      .insertInto('accounts')
      .values({ email: `${randomUUID()}${SUITE_DOMAIN}`, name: 'An Investor', role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();

    return account.id;
  }

  async function newItem(): Promise<string> {
    const item = await getDb()
      .insertInto('content_items')
      .values({ type: 'update', slug: randomUUID(), title: 'An update' })
      .returning('id')
      .executeTakeFirstOrThrow();

    return item.id;
  }

  it('keeps a revision its author wrote, with the author nulled', async () => {
    const author = await newAccount();
    const itemId = await newItem();
    const revision = await getDb()
      .insertInto('content_revisions')
      .values({ item_id: itemId, blocks: sql`'[]'::jsonb`, author_id: author })
      .returning('id')
      .executeTakeFirstOrThrow();

    expect(await eraseAccount(author, randomUUID())).toBe(true);

    // The document stays; only the author leaves. A published revision is the
    // company's record, not the person's, so erasing the author nulls the column
    // and keeps the revision — the manifest's set-null half, made concrete.
    const surviving = await getDb()
      .selectFrom('content_revisions')
      .select(['id', 'author_id'])
      .where('id', '=', revision.id)
      .executeTakeFirst();

    expect(surviving).toBeDefined();
    expect(surviving?.author_id).toBeNull();
  });

  it('cascades a grant to the subject and nulls the granter of one the subject made', async () => {
    const admin = await newAccount('admin');
    const subject = await newAccount();
    const other = await newAccount();
    const toSubject = await newItem();
    const bySubject = await newItem();

    // One grant is about the subject — an item they may read; the other is an act
    // the subject performed for somebody else. Erasure treats them differently,
    // which is the manifest's cascade-versus-set-null split on the one table that
    // carries both dispositions.
    await getDb()
      .insertInto('content_grants')
      .values({ item_id: toSubject, account_id: subject, granted_by: admin })
      .execute();
    await getDb()
      .insertInto('content_grants')
      .values({ item_id: bySubject, account_id: other, granted_by: subject })
      .execute();

    expect(await eraseAccount(subject, randomUUID())).toBe(true);

    // About the subject: gone with them.
    const toSubjectRow = await getDb()
      .selectFrom('content_grants')
      .select(['granted_by'])
      .where('item_id', '=', toSubject)
      .where('account_id', '=', subject)
      .executeTakeFirst();

    expect(toSubjectRow).toBeUndefined();

    // Done for another: the grant stays, its granter forgotten.
    const madeRow = await getDb()
      .selectFrom('content_grants')
      .select(['granted_by'])
      .where('item_id', '=', bySubject)
      .where('account_id', '=', other)
      .executeTakeFirst();

    expect(madeRow).toBeDefined();
    expect(madeRow?.granted_by).toBeNull();
  });
});
