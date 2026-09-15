/**
 * The report archive (`RPT-002/T3`).
 *
 * Three classes of claim, and the first is the one the design turns on.
 *
 * **A gap discloses nothing.** `RPT-002` §3 asks that a report an investor may
 * not read appear as a gap "rather than as a refusal — which is the same answer
 * they would get if it did not exist". That is asserted the only way it can be:
 * two readers, one who may see a report and one who may not, and their archives
 * compared for any difference at all. A range anchored on the earliest report in
 * the database rather than on the reader's own would pass a row-by-row check and
 * fail this one, because the list would *begin* at a period whose only evidence
 * is a document the second reader is not allowed to know exists.
 *
 * **What a gap is.** A period between the reader's first report and now with
 * nothing in it for them, drawn to the period we are in rather than to the newest
 * report, because a quarter that has arrived with nothing published is the gap an
 * investor most wants to see.
 *
 * **What is not asserted.** A year reported quarterly is measured against four
 * slots and one reported monthly against twelve, so neither invents the other's
 * gaps; a year carrying both cadences draws none, because the set it is missing
 * from is genuinely unknown and a fabricated gap is information that is false.
 *
 * On a database of its own, kept clear of other suites' reports, because every
 * claim here is about which periods the whole table yields.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';
import type { ContentAudience } from '../db/types';

import { createItem, saveDraft } from './items';
import { publish } from './publish';
import { type ArchiveYear, markReportRead, reportArchive } from './reports';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_report_archive';

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

const THIS_YEAR = String(new Date().getUTCFullYear());
const THIS_QUARTER = Math.floor(new Date().getUTCMonth() / 3) + 1;
const THIS_MONTH = new Date().getUTCMonth() + 1;
// A year already over, which is the shape the archive is actually kept in. A
// far-future year would exercise a state the product is never in and would say
// nothing about the one it is.
const LAST_YEAR = String(new Date().getUTCFullYear() - 1);

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

/** Every period the archive drew, newest first, flattened across its years. */
function periods(years: readonly ArchiveYear[]): string[] {
  return years.flatMap((year) => year.entries.map((entry) => entry.period));
}

/** The periods the archive drew as gaps. */
function gaps(years: readonly ArchiveYear[]): string[] {
  return years.flatMap((year) =>
    year.entries.filter((entry) => entry.report === null).map((entry) => entry.period),
  );
}

describe.skipIf(!HAS_DATABASE)('the report archive (RPT-002/T3)', () => {
  let authorId = '';
  const admin = (): Actor => ({ id: authorId, role: 'admin' });

  async function publishReport(period: string, audience: ContentAudience = 'investor'): Promise<string> {
    const item = await createItem({ type: 'report', slug: `r-${randomUUID()}`, title: period, period, audience });
    const revision = await saveDraft(item.id, [{ type: 'heading', level: 2, text: period }], authorId);
    await publish(item.id, revision.id, authorId);
    return item.id;
  }

  async function investor(): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `inv-${randomUUID()}@example.test`, name: 'An investor', role: 'investor', state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
  }

  async function clearReports(): Promise<void> {
    await getDb().deleteFrom('content_items').where('type', '=', 'report').execute();
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
      .values({ email: 'archive-author@example.test', name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(closeDb);

  it('is empty when the reader has no report to walk back through', async () => {
    // Empty rather than a run of gaps from some arbitrary start: an archive of
    // nothing but gaps states that reports exist and are being withheld.
    expect(await reportArchive(await investor())).toEqual([]);
  });

  it('draws every period from the reader’s first report to the one we are in', async () => {
    await clearReports();
    await publishReport(`${THIS_YEAR}-Q1`);

    const drawn = periods(await reportArchive(admin()));

    expect(drawn[0]).toBe(`${THIS_YEAR}-Q${THIS_QUARTER}`);
    expect(drawn[drawn.length - 1]).toBe(`${THIS_YEAR}-Q1`);
    expect(drawn).toHaveLength(THIS_QUARTER);
  });

  it('shows a period with no report as a gap, and groups by year', async () => {
    await clearReports();
    await publishReport(`${LAST_YEAR}-Q1`);
    await publishReport(`${LAST_YEAR}-Q3`);

    const years = await reportArchive(admin());
    const past = years.find((year) => year.year === LAST_YEAR);

    expect(years.map((year) => year.year)).toEqual([THIS_YEAR, LAST_YEAR]);
    expect(past?.entries.map((entry) => entry.period)).toEqual([
      `${LAST_YEAR}-Q4`, `${LAST_YEAR}-Q3`, `${LAST_YEAR}-Q2`, `${LAST_YEAR}-Q1`,
    ]);
    expect(gaps([past as ArchiveYear])).toEqual([`${LAST_YEAR}-Q4`, `${LAST_YEAR}-Q2`]);

    // A year that has arrived with nothing published in it is all gap, drawn to
    // the period we are in and no further.
    const current = years.find((year) => year.year === THIS_YEAR);
    expect(gaps([current as ArchiveYear])).toHaveLength(THIS_QUARTER);
  });

  it('tells a reader which of them they have opened', async () => {
    await clearReports();
    const reader = await investor();
    const read = await publishReport(`${LAST_YEAR}-Q1`);
    await publishReport(`${LAST_YEAR}-Q2`);
    await markReportRead(reader.id, read);

    const entries = (await reportArchive(reader)).flatMap((year) => year.entries);

    expect(entries.find((entry) => entry.period === `${LAST_YEAR}-Q1`)?.readAt).toBeInstanceOf(Date);
    expect(entries.find((entry) => entry.period === `${LAST_YEAR}-Q2`)?.readAt).toBeNull();
  });

  it('leaves a report that has never been published out of the list', async () => {
    // A draft is not a report anyone may read, and a period holding only a draft
    // is a gap. The join on the current revision is what enforces it.
    await clearReports();
    const item = await createItem({
      type: 'report', slug: `r-${randomUUID()}`, title: 'A draft', period: `${LAST_YEAR}-Q2`, audience: 'investor',
    });
    await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'A draft' }], authorId);
    await publishReport(`${LAST_YEAR}-Q1`);

    const years = await reportArchive(admin());

    expect(periods(years)).toContain(`${LAST_YEAR}-Q2`);
    expect(gaps(years)).toContain(`${LAST_YEAR}-Q2`);
  });

  it('dates a report by when it was published, not when its row was last touched', async () => {
    // An audience change or a correction moves `updated_at` without republishing
    // anything, and a list dated from it would say a report from last year came
    // out this morning.
    await clearReports();
    const id = await publishReport(`${LAST_YEAR}-Q1`);
    const published = (
      await getDb().selectFrom('content_revisions').select('published_at')
        .where('item_id', '=', id).where('published_at', 'is not', null)
        .executeTakeFirstOrThrow()
    ).published_at;

    await getDb().updateTable('content_items').set({ updated_at: new Date() })
      .where('id', '=', id).execute();

    const row = (await reportArchive(admin()))
      .flatMap((year) => year.entries)
      .find((entry) => entry.period === `${LAST_YEAR}-Q1`);

    expect(row?.publishedAt).toEqual(published);
    expect(row?.publishedAt).not.toEqual(row?.report?.updated_at);
  });

  it('reports only this reader’s own read state, never another’s', async () => {
    // Without this, dropping the account scope on the read-state query passes
    // every other test here: one reader cannot show whose rows were counted.
    await clearReports();
    const mine = await investor();
    const theirs = await investor();
    const report = await publishReport(`${LAST_YEAR}-Q1`);
    await markReportRead(theirs.id, report);

    const entries = (await reportArchive(mine)).flatMap((year) => year.entries);
    const row = entries.find((entry) => entry.period === `${LAST_YEAR}-Q1`);

    expect(row?.report).not.toBeNull();
    expect(row?.readAt).toBeNull();
  });

  it('gives a reader who may not see a report exactly what they would see if it did not exist', async () => {
    // The disclosure rule, asserted as a whole-structure comparison rather than
    // row by row: a range anchored on the earliest report in the database would
    // begin the withheld reader's list at 3000-Q1 and so announce a document
    // they are not allowed to know about.
    await clearReports();
    const withheld = await investor();
    await publishReport(`${LAST_YEAR}-Q1`, 'granted'); // reachable only by a deck grant
    await publishReport(`${LAST_YEAR}-Q3`);

    const theirs = await reportArchive(withheld);

    await clearReports();
    await publishReport(`${LAST_YEAR}-Q3`); // the same world, with Q1 never written
    const asIfAbsent = await reportArchive(withheld);

    // The shape, not the rows: rebuilding the world mints a new id and new
    // timestamps for the report both archives share, and neither tells this
    // reader anything. What must match is every period drawn and which of them
    // are gaps — the range included, since a range anchored on the earliest
    // report in the database would begin their list at a period whose only
    // evidence is a document they are not allowed to know exists.
    expect(periods(theirs)).toEqual(periods(asIfAbsent));
    expect(gaps(theirs)).toEqual(gaps(asIfAbsent));
    expect(theirs.map((year) => year.year)).toEqual(asIfAbsent.map((year) => year.year));
    expect(periods(theirs)).not.toContain(`${LAST_YEAR}-Q1`);
  });

  it('measures a monthly year against twelve months and not four quarters', async () => {
    await clearReports();
    await publishReport(`${LAST_YEAR}-03`);

    const past = (await reportArchive(admin())).find((year) => year.year === LAST_YEAR);

    expect(past?.entries.map((entry) => entry.period)).toEqual([
      `${LAST_YEAR}-12`, `${LAST_YEAR}-11`, `${LAST_YEAR}-10`, `${LAST_YEAR}-09`,
      `${LAST_YEAR}-08`, `${LAST_YEAR}-07`, `${LAST_YEAR}-06`, `${LAST_YEAR}-05`,
      `${LAST_YEAR}-04`, `${LAST_YEAR}-03`,
    ]);
    // And the cadence reaches the year with no reports in it, rather than that
    // year quietly defaulting to quarters.
    const current = (await reportArchive(admin())).find((year) => year.year === THIS_YEAR);
    expect(current?.entries).toHaveLength(THIS_MONTH);
  });

  it('asserts no gap in an archive that was kept both ways', async () => {
    // The one case where the expected set is unknown. Listing what exists and
    // drawing nothing is the honest answer; four slots or twelve would both
    // invent gaps that mean nothing.
    await clearReports();
    await publishReport(`${LAST_YEAR}-Q1`);
    await publishReport(`${LAST_YEAR}-07`);

    const years = await reportArchive(admin());

    expect(gaps(years)).toEqual([]);
    expect(periods(years)).toEqual([`${LAST_YEAR}-Q1`, `${LAST_YEAR}-07`]);
  });
});
