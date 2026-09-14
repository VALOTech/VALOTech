/**
 * The unread update count (`INV-001/T1`).
 *
 * Four properties, each failing in a way the reader would not see as a failure.
 * The count is scoped by the reader through the one visibility predicate, so an
 * investor-only update never swells a stranger's badge (`DATA-R05`). It counts
 * updates alone, so a report does not inflate it. It counts published updates
 * alone, so a draft nobody can open is not waiting. And it falls by exactly one
 * when one is opened, which is the whole promise the number makes.
 *
 * The objection case is pinned deliberately rather than left to follow from the
 * query. `LEGAL-GLOBAL-001` §3 chose that a person who objects to read-tracking
 * sees everything as new, and a reading of that as a defect would "fix" it into
 * a silent badge — so the test states the choice, and a future change away from
 * it has to be a deliberate one against a named design rather than a tidy-up.
 *
 * All of it is a claim about what the database answers for a given reader, so
 * the suite runs against a real PostgreSQL on a database of its own and drives
 * `unreadUpdateCount` rather than a copy of its query.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { objectToReadTracking } from '../admin/accounts';
import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';

import type { Block } from './blocks';
import { addGrant } from './grants';
import { createItem, saveDraft } from './items';
import { publish } from './publish';
import { markReportRead } from './reports';
import { hasOpened, unreadUpdateCount } from './unread';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_unread';

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

const heading = (text: string): Block[] => [{ type: 'heading', level: 2, text }];

describe.skipIf(!HAS_DATABASE)('the unread update count (INV-001/T1)', () => {
  let admin: Actor;
  let investor: Actor;
  let objector: Actor;

  let publicUpdateId = '';
  let investorUpdateId = '';
  let grantedUpdateId = '';

  async function account(email: string, role: Actor['role']): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name: email, role, state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
  }

  async function publishedUpdate(slug: string, audience: 'public' | 'investor' | 'granted'): Promise<string> {
    const item = await createItem({
      type: 'update',
      slug: `${slug}-${randomUUID()}`,
      title: slug,
      kind: 'progress',
      audience,
    });
    const revision = await saveDraft(item.id, heading(slug), admin.id);
    await publish(item.id, revision.id, admin.id);
    return item.id;
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

    admin = await account('unread-admin@example.test', 'admin');
    investor = await account('unread-investor@example.test', 'investor');
    objector = await account('unread-objector@example.test', 'investor');

    publicUpdateId = await publishedUpdate('public-note', 'public');
    investorUpdateId = await publishedUpdate('investor-note', 'investor');
    grantedUpdateId = await publishedUpdate('granted-note', 'granted');

    // Granted to one investor only, so the count proves the grant is read and
    // not merely that the audience column was consulted.
    await addGrant(grantedUpdateId, investor.id, admin.id);

    // A published report, to prove the type filter: it is visible and unopened
    // and must still not appear in a count of updates.
    const report = await createItem({
      type: 'report',
      slug: `rep-${randomUUID()}`,
      title: 'A report',
      period: '2026-Q1',
      audience: 'public',
    });
    const reportRevision = await saveDraft(report.id, heading('a quarterly report'), admin.id);
    await publish(report.id, reportRevision.id, admin.id);

    // A drafted, never-published update: nobody can open it, so nobody is waiting on it.
    const draft = await createItem({
      type: 'update',
      slug: `draft-${randomUUID()}`,
      title: 'draft',
      kind: 'progress',
      audience: 'public',
    });
    await saveDraft(draft.id, heading('not published'), admin.id);
    // The budget every database-backed file here declares. The hook drops and
    // recreates a database and applies the whole migration set, which is well
    // past Vitest's ten-second default on a machine that is also serving the
    // application -- and what that produces is a hook timeout, which is evidence
    // about the machine rather than about the code.
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it('answers nothing for an anonymous reader, who has no read state at all', async () => {
    expect(await unreadUpdateCount(null)).toBeNull();
  });

  it('counts the published updates this reader may see and has not opened', async () => {
    // public + investor + granted, and neither the report nor the draft.
    expect(await unreadUpdateCount(investor)).toBe(3);
  });

  it('does not count an update the reader may not see', async () => {
    // The objector holds no grant, so the granted update is not theirs to read.
    expect(await unreadUpdateCount(objector)).toBe(2);
  });

  it('falls by exactly one when one update is opened', async () => {
    const before = await unreadUpdateCount(investor);
    await markReportRead(investor.id, publicUpdateId);
    expect(await unreadUpdateCount(investor)).toBe((before ?? 0) - 1);
  });

  it('reaches zero when everything visible has been opened, which is not null', async () => {
    await markReportRead(investor.id, investorUpdateId);
    await markReportRead(investor.id, grantedUpdateId);
    expect(await unreadUpdateCount(investor)).toBe(0);
  });

  it('shows everything as new to a reader who objected to read-tracking', async () => {
    // LEGAL-GLOBAL-001 §3: the hall keeps working and the marking degrades, which
    // is the worse experience the person chose. Their existing rows are deleted
    // and no new one is written, so the count is everything they may see — not a
    // silent badge, and not zero.
    await markReportRead(objector.id, publicUpdateId);
    expect(await unreadUpdateCount(objector)).toBe(1);

    await objectToReadTracking(objector.id, admin.id);
    expect(await unreadUpdateCount(objector)).toBe(2);

    // A read recorded after the objection changes nothing, because none is written.
    await markReportRead(objector.id, publicUpdateId);
    expect(await unreadUpdateCount(objector)).toBe(2);
  });
  // Last, deliberately: it publishes an update, and the counts asserted above
  // are counts of what this reader may see. A test that adds to the world the
  // earlier ones measure is a test that breaks them from behind.
  it('reports whether one particular item has been opened', async () => {
    // The hall says of the current report whether it has been read, which is one
    // row rather than the count: a reader with nothing outstanding still wants to
    // know they have seen this quarter's.
    const fresh = await publishedUpdate('single-read', 'public');
    expect(await hasOpened(investor.id, fresh)).toBe(false);
    await markReportRead(investor.id, fresh);
    expect(await hasOpened(investor.id, fresh)).toBe(true);
    // Scoped to the reader: one person opening it does not open it for another.
    expect(await hasOpened(objector.id, fresh)).toBe(false);
  });
});
