/**
 * The portability export's surface, against a real PostgreSQL
 * (`REVIEW/T2`, `LEGAL-GLOBAL-001/T2`).
 *
 * The gathering is `exportPersonData`'s and is proven where it lives. What this
 * file proves is everything the route adds, and three of the four classes are
 * about what must not happen.
 *
 * **Who is refused, and that a refusal carries nothing.** An investor with a
 * live session gets the `404` the console gives a guess and a caller with no
 * session is sent to the form — each asserted together with the body holding
 * none of the person's record, because a refusal that still answered with the
 * data is the failure that looks exactly like a refusal.
 *
 * **What the body may never hold.** The password hash is searched for by its
 * own stored value at any depth, rather than by asking whether a field named
 * for it is absent: a hash reaching an inbox under a different key is the same
 * breach as one reaching it under the expected name.
 *
 * **That it is one person's record.** Two accounts are filled with their own
 * rows and neither appears in the other's file (`DATA-R05`).
 *
 * **What the answer is, as a file.** Unstorable, named for the account id and
 * never the address, and carrying instants rather than local times (`OPS-R02`).
 *
 * On a database of its own, because `accounts.investor_type` is folded into a
 * shipped migration (`DATA-R07`) that node-pg-migrate will not re-apply to the
 * shared development one.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../../auth/session';
import { createItem } from '../../../../../content/items';
import { closeDb, getDb } from '../../../../../db/index';
import type { AccountRole } from '../../../../../db/types';

import { GET } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_person_export';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

// Set before anything reads it: `getConfig` caches on first use and `getDb`
// builds its pool from the value.
if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', 'migrations',
);

const ORIGIN = 'http://localhost:3100';
process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);

const SUITE_DOMAIN = '@person-export.test';
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aVeryDistinctiveStoredSecret';

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

async function account(role: AccountRole, name: string): Promise<string> {
  const row = await getDb()
    .insertInto('accounts')
    .values({
      email: `${crypto.randomUUID()}${SUITE_DOMAIN}`,
      name,
      role,
      state: 'active',
      password_hash: HASH,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return row.id;
}

async function cookieFor(accountId: string): Promise<string> {
  const c = await issue(accountId);
  return `${c.name}=${c.value}`;
}

function ask(accountId: string, cookie?: string): Promise<Response> {
  return GET(
    new Request(`${ORIGIN}/admin/accounts/${accountId}/export`, {
      headers: cookie === undefined ? {} : { cookie },
    }),
    { params: Promise.resolve({ id: accountId }) },
  );
}

describe.skipIf(!HAS_DATABASE)('the portability export route (REVIEW/T2)', () => {
  let admin: string;
  let adminCookie: string;
  let person: string;
  let personEmail: string;
  let other: string;

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

    admin = await account('admin', 'An Admin');
    adminCookie = await cookieFor(admin);
    person = await account('investor', 'A Reader');
    other = await account('investor', 'Another Reader');

    personEmail = (
      await getDb().selectFrom('accounts').select('email').where('id', '=', person)
        .executeTakeFirstOrThrow()
    ).email;

    await getDb().insertInto('mail_log').values({
      account_id: person, subject: 'The Q3 report is published', kind: 'bulk', state: 'accepted',
    }).execute();
    await getDb().insertInto('mail_log').values({
      account_id: other, subject: 'A subject belonging to somebody else', kind: 'bulk', state: 'accepted',
    }).execute();
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it('answers an admin with the person’s own record', async () => {
    const response = await ask(person, adminCookie);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { account: { email: string; name: string } };
    expect(body.account.email).toBe(personEmail);
    expect(body.account.name).toBe('A Reader');
  });

  it('never carries the password hash, under any key', async () => {
    // Searched for by its stored value rather than by the absence of a field
    // named for it: a hash reaching an inbox under some other key is the same
    // breach as one reaching it under the expected name.
    const body = await (await ask(person, adminCookie)).text();

    expect(body).not.toContain(HASH);
    expect(body).not.toContain('aVeryDistinctiveStoredSecret');
    expect(body).not.toContain('password');
  });

  it('holds one person’s rows and not another’s', async () => {
    const body = await (await ask(person, adminCookie)).text();

    expect(body).toContain('The Q3 report is published');
    expect(body).not.toContain('A subject belonging to somebody else');
  });

  it('refuses an investor with the console’s 404, and answers with no record', async () => {
    const response = await ask(person, await cookieFor(person));

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(personEmail);
  });

  it('sends a caller with no session to the form, and answers with no record', async () => {
    const response = await ask(person);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in');
    expect(await response.text()).not.toContain(personEmail);
  });

  it('answers 404 for an id no account holds, as it does a non-admin', async () => {
    // The same code both ways, so an investor who guesses an id learns neither
    // that the account exists nor that the console does.
    const response = await ask(crypto.randomUUID(), adminCookie);

    expect(response.status).toBe(404);
  });

  it('is a file, named for the account and never for the address', async () => {
    const response = await ask(person, adminCookie);
    const disposition = response.headers.get('Content-Disposition') ?? '';

    expect(disposition).toContain('attachment');
    expect(disposition).toContain(person);
    // A file named for somebody's address writes that address into a downloads
    // folder, a backup of it, and any mail it is attached to.
    expect(disposition).not.toContain(personEmail);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('carries instants rather than local times', async () => {
    // Through the content module rather than its table: a read or a write of
    // content outside `src/content/` is what `check-content-access` refuses,
    // because that module is where the audience predicate is composed.
    const report = await createItem({
      type: 'report', slug: 'q3-2026', title: 'Q3', period: '2026-Q3', audience: 'investor',
    });
    await getDb()
      .insertInto('report_reads')
      .values({ account_id: person, item_id: report.id })
      .execute();

    const body = (await (await ask(person, adminCookie)).json()) as {
      reportsRead: readonly { readonly readAt: string }[];
    };

    expect(body.reportsRead).toHaveLength(1);
    expect(body.reportsRead[0]?.readAt).toMatch(/Z$/);
  });
});
