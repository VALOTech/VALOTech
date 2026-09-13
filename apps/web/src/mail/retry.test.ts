/**
 * Retrying the recipients whose last attempt failed (`MAIL-001/T6`).
 *
 * The claim these tests exist for is the one that cannot be taken back: **a
 * retry must never reach somebody who already received the message.** Everything
 * else here is in service of it — which ids are eligible, what a changed subject
 * does, what an audit row counts — and the load-bearing test is the concurrent
 * one, because the window this feature could get wrong is two admins pressing
 * retry at the same moment, not one admin pressing it twice.
 *
 * Against a real PostgreSQL on a database of its own, because the guarantee is a
 * partial unique index over `retry_of` and not a predicate in TypeScript
 * ([`MAIL-DEC-02`](../../../../docs/decisions-log.md)). A fake would have proved
 * the shape of the code and nothing about the property. The port is a fake: the
 * orchestration is what is under test, and `MAIL-001/T8` owns the wire.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';

import { compose, type Mailer, type Receipt } from './mailer';
import { resend, resolveRetries } from './retry';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_mail_retry';

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

const SUBJECT = 'The third quarter is closed';
const REFUSAL = '451 4.3.0 temporary local problem';

/** A port that remembers every message handed to it, and refuses nothing. */
function fakeMailer(): Mailer & { readonly handed: readonly string[] } {
  const handed: string[] = [];

  return {
    handed,
    async send(to: string): Promise<Receipt> {
      handed.push(to);
      return { queueId: `q-${handed.length}` };
    },
  };
}

describe.skipIf(!HAS_DATABASE)('retrying the ones that failed (MAIL-001/T6)', () => {
  const message = compose(SUBJECT, 'Hello.\n\nThe numbers are in the room.');

  async function account(name: string): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `${randomUUID()}@example.test`, name, role: 'investor', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /**
   * A `mail_log` row as a send would have left it. Written directly rather than
   * by running a send first: what is under test is what happens *given* a
   * failure, and producing one through the send loop would make every test here
   * also a test of that loop.
   */
  async function attemptRow(
    accountId: string,
    state: 'failed' | 'accepted',
    subject = SUBJECT,
  ): Promise<string> {
    const row = await getDb()
      .insertInto('mail_log')
      .values({
        account_id: accountId,
        subject,
        kind: 'bulk',
        state,
        error: state === 'failed' ? REFUSAL : null,
        queue_id: state === 'accepted' ? 'q-original' : null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function rowsFor(accountId: string) {
    return getDb()
      .selectFrom('mail_log')
      .select(['id', 'state', 'retry_of', 'queue_id', 'error'])
      .where('account_id', '=', accountId)
      .orderBy('id')
      .execute();
  }

  let actor = '';

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
    // A fresh admin per test, because `audit` refuses DELETE — it is append-only
    // by trigger (`SEC-R04`), which is the property that makes the trail worth
    // reading and makes "clear the table between tests" unavailable. Scoping
    // every trail assertion to this test's own actor is the isolation instead,
    // and it is the better one: it would still hold if the rows were shared.
    actor = await account('An Admin');
    await getDb().deleteFrom('mail_log').execute();
  });

  /** This test's own trail rows, which is every row it could have caused. */
  async function auditOf(actorId: string) {
    return getDb()
      .selectFrom('audit')
      .select(['action', 'after'])
      .where('actor_id', '=', actorId)
      .execute();
  }

  describe('which failures are eligible', () => {
    it('takes a failed attempt that nothing has superseded', async () => {
      const id = await account('A Refused Investor');
      const failed = await attemptRow(id, 'failed');

      const resolved = await resolveRetries([failed], SUBJECT);

      expect(resolved.candidates.map((candidate) => candidate.failedId)).toEqual([failed]);
      expect(resolved.candidates[0]?.recipient.id).toBe(id);
      expect(resolved.spent).toEqual([]);
      expect(resolved.missing).toEqual([]);
      expect(resolved.excluded).toEqual([]);
    });

    it('reports a failure that has already been retried as spent, not as a candidate', async () => {
      const id = await account('An Already Retried Investor');
      const failed = await attemptRow(id, 'failed');
      await resend(
        (await resolveRetries([failed], SUBJECT)).candidates,
        message,
        fakeMailer(),
        actor,
      );

      const again = await resolveRetries([failed], SUBJECT);

      // The whole point of the column: the row still reads `failed`, because it
      // did, and it is nonetheless spent.
      expect((await rowsFor(id))[0]?.state).toBe('failed');
      expect(again.candidates).toEqual([]);
      expect(again.spent).toEqual([failed]);
    });

    it('does not take an attempt that was accepted', async () => {
      const id = await account('An Accepted Investor');
      const accepted = await attemptRow(id, 'accepted');

      const resolved = await resolveRetries([accepted], SUBJECT);

      expect(resolved.candidates).toEqual([]);
      expect(resolved.missing).toEqual([accepted]);
    });

    it('does not take a failure of a different message', async () => {
      const id = await account('An Investor Of Another Send');
      const failed = await attemptRow(id, 'failed', 'A different subject entirely');

      const resolved = await resolveRetries([failed], SUBJECT);

      // A subject that no longer matches means the admin edited the message
      // between the send and the retry. Sending it would deliver one text to
      // these recipients and another to everybody else.
      expect(resolved.candidates).toEqual([]);
      expect(resolved.missing).toEqual([failed]);
    });

    it('does not take a transactional failure, whatever its subject', async () => {
      const id = await account('An Investor Whose Invitation Bounced');
      const row = await getDb()
        .insertInto('mail_log')
        .values({ account_id: id, subject: SUBJECT, kind: 'transactional', state: 'failed', error: REFUSAL })
        .returning('id')
        .executeTakeFirstOrThrow();

      const resolved = await resolveRetries([row.id], SUBJECT);

      // A failed invitation and a failed investor mail sit in one table. Retrying
      // the first as the second would send that person the bulk body and spend
      // their invitation's one retry slot for ever.
      expect(resolved.candidates).toEqual([]);
      expect(resolved.missing).toEqual([row.id]);
    });

    it('excludes an account suspended since the send, rather than retrying it', async () => {
      const id = await account('A Suspended Investor');
      const failed = await attemptRow(id, 'failed');
      await getDb().updateTable('accounts').set({ state: 'suspended' }).where('id', '=', id).execute();

      const resolved = await resolveRetries([failed], SUBJECT);

      expect(resolved.candidates).toEqual([]);
      expect(resolved.excluded.map((account) => account.id)).toEqual([id]);
    });

    it('excludes an account that unsubscribed since the send', async () => {
      const id = await account('An Unsubscribed Investor');
      const failed = await attemptRow(id, 'failed');
      // Each source carries its own evidence: a link-sourced row must name the
      // token it came from and an admin-sourced one must say who asked and how.
      // Which of the two recorded the wish is not what this test is about; that
      // the wish is honoured by a retry is.
      await getDb()
        .insertInto('unsubscribes')
        .values({ account_id: id, source: 'admin', reason: 'asked by telephone' })
        .execute();

      const resolved = await resolveRetries([failed], SUBJECT);

      expect(resolved.candidates).toEqual([]);
      expect(resolved.excluded.map((account) => account.id)).toEqual([id]);
    });
  });

  describe('sending again', () => {
    it('writes a new row naming the failure it supersedes, and accepts it', async () => {
      const id = await account('A Retried Investor');
      const failed = await attemptRow(id, 'failed');
      const mailer = fakeMailer();

      const outcome = await resend(
        (await resolveRetries([failed], SUBJECT)).candidates,
        message,
        mailer,
        actor,
      );

      expect(mailer.handed).toHaveLength(1);
      expect(outcome.results.map((result) => result.state)).toEqual(['accepted']);

      const rows = await rowsFor(id);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ id: failed, state: 'failed', retry_of: null, error: REFUSAL });
      expect(rows[1]).toMatchObject({ state: 'accepted', retry_of: failed });
    });

    it('reaches nobody whose attempt was accepted, even when the caller names them', async () => {
      const refused = await account('A Refused Investor');
      const delivered = await account('A Delivered Investor');
      const failed = await attemptRow(refused, 'failed');
      const accepted = await attemptRow(delivered, 'accepted');
      const mailer = fakeMailer();

      // The caller names both. The resolve is what keeps the accepted one out,
      // and this is the test that would notice if it stopped doing so.
      const resolved = await resolveRetries([failed, accepted], SUBJECT);
      await resend(resolved.candidates, message, mailer, actor);

      expect(mailer.handed).toHaveLength(1);
      expect(await rowsFor(delivered)).toHaveLength(1);
    });

    it('sends once when two retries of one failure run together', async () => {
      const id = await account('A Contested Investor');
      const failed = await attemptRow(id, 'failed');
      const first = fakeMailer();
      const second = fakeMailer();

      // Both resolve before either claims, which is the interleaving that
      // matters: each sees an unspent failure and believes it may send. Only the
      // database can settle it, and the partial unique index over `retry_of` is
      // what does — with it removed, both of these send and somebody receives
      // the message twice.
      const [a, b] = await Promise.all([
        resolveRetries([failed], SUBJECT),
        resolveRetries([failed], SUBJECT),
      ]);
      expect(a.candidates).toHaveLength(1);
      expect(b.candidates).toHaveLength(1);

      await Promise.all([
        resend(a.candidates, message, first, actor),
        resend(b.candidates, message, second, actor),
      ]);

      expect(first.handed.length + second.handed.length).toBe(1);
      expect(await rowsFor(id)).toHaveLength(2);
    });

    it('can try again after a retry fails in its turn, without superseding a row twice', async () => {
      const id = await account('A Twice Refused Investor');
      const failed = await attemptRow(id, 'failed');

      const refusing: Mailer = {
        async send(): Promise<Receipt> {
          throw new Error(REFUSAL);
        },
      };
      await resend((await resolveRetries([failed], SUBJECT)).candidates, message, refusing, actor);

      const rows = await rowsFor(id);
      const secondFailure = rows[1]?.id ?? '';
      expect(rows[1]).toMatchObject({ state: 'failed', retry_of: failed });

      // The chain is the answer to "can a recipient be tried a third time": the
      // second attempt is itself an unspent failure, so it is named in its turn
      // and no row is superseded more than once.
      const third = await resolveRetries([secondFailure], SUBJECT);
      expect(third.candidates.map((candidate) => candidate.failedId)).toEqual([secondFailure]);

      const mailer = fakeMailer();
      await resend(third.candidates, message, mailer, actor);

      expect(mailer.handed).toHaveLength(1);
      expect((await rowsFor(id))[2]).toMatchObject({ state: 'accepted', retry_of: secondFailure });
    });
  });

  describe('a claim somebody else took', () => {
    it('is named in the answer rather than dropped from it', async () => {
      const id = await account('A Contested Investor');
      const failed = await attemptRow(id, 'failed');
      const resolved = await resolveRetries([failed], SUBJECT);

      // Claimed out from under this retry between the resolve and the send, which
      // is the only window in which the typed count and the sent count can differ.
      await resend(
        (await resolveRetries([failed], SUBJECT)).candidates,
        message,
        fakeMailer(),
        actor,
      );

      const mailer = fakeMailer();
      const outcome = await resend(resolved.candidates, message, mailer, actor);

      // Neither accepted nor failed: nothing was attempted. An admin who typed a
      // count is owed the difference rather than left to notice it.
      expect(mailer.handed).toEqual([]);
      expect(outcome.results).toEqual([]);
      expect(outcome.unclaimed).toEqual([failed]);
    });

    it('is empty when every claim was taken', async () => {
      const id = await account('An Uncontested Investor');
      const failed = await attemptRow(id, 'failed');

      const outcome = await resend(
        (await resolveRetries([failed], SUBJECT)).candidates,
        message,
        fakeMailer(),
        actor,
      );

      expect(outcome.unclaimed).toEqual([]);
    });
  });

  describe('what the trail records', () => {
    it('counts the claims that were taken, never the ones that were proposed', async () => {
      const first = await account('A First Refused');
      const second = await account('A Second Refused');
      const failedFirst = await attemptRow(first, 'failed');
      const failedSecond = await attemptRow(second, 'failed');

      // The second failure is claimed out from under this retry between the
      // resolve and the send, which is the only way the proposed count and the
      // sent count can differ.
      const resolved = await resolveRetries([failedFirst, failedSecond], SUBJECT);
      await resend(
        (await resolveRetries([failedSecond], SUBJECT)).candidates,
        message,
        fakeMailer(),
        actor,
      );
      const mailer = fakeMailer();
      await resend(resolved.candidates, message, mailer, actor);

      expect(mailer.handed).toHaveLength(1);
      // Two rows: the claim above took one recipient, this one took the other.
      // The second is the assertion — it counts one, not the two proposed.
      const rows = await auditOf(actor);
      expect(rows).toHaveLength(2);
      expect(rows[1]?.action).toBe('mail.send');
      expect(rows[1]?.after).toMatchObject({ subject: SUBJECT, recipient_count: 1 });
    });

    it('records nothing when every named failure was already claimed', async () => {
      const id = await account('An Already Claimed Investor');
      const failed = await attemptRow(id, 'failed');
      const resolved = await resolveRetries([failed], SUBJECT);
      await resend(
        (await resolveRetries([failed], SUBJECT)).candidates,
        message,
        fakeMailer(),
        actor,
      );
      const before = (await auditOf(actor)).length;
      const mailer = fakeMailer();
      const outcome = await resend(resolved.candidates, message, mailer, actor);

      // No message left, so no send happened, so the trail says none did.
      expect(mailer.handed).toEqual([]);
      expect(outcome.results).toEqual([]);
      expect(await auditOf(actor)).toHaveLength(before);
    });

    it('holds no address, in the row or in the trail', async () => {
      const id = await account('A Retried Investor');
      const failed = await attemptRow(id, 'failed');

      await resend(
        (await resolveRetries([failed], SUBJECT)).candidates,
        message,
        fakeMailer(),
        actor,
      );

      const audit = await getDb()
        .selectFrom('audit')
        .selectAll()
        .where('actor_id', '=', actor)
        .execute();
      expect(JSON.stringify(audit)).not.toContain('@');
      const rows = await getDb().selectFrom('mail_log').selectAll().execute();
      expect(JSON.stringify(rows)).not.toContain('@');
    });
  });

  describe('the guarantee is the database’s', () => {
    it('refuses a second row naming one failure, whatever the application believes', async () => {
      const id = await account('A Directly Written Investor');
      const failed = await attemptRow(id, 'failed');

      await getDb()
        .insertInto('mail_log')
        .values({ account_id: id, subject: SUBJECT, kind: 'bulk', state: 'queued', retry_of: failed })
        .execute();

      // A write that reaches the table without going through `resend` — a second
      // retry path added later, a direct statement — is refused here rather than
      // quietly delivering the message a second time.
      await expect(
        getDb()
          .insertInto('mail_log')
          .values({ account_id: id, subject: SUBJECT, kind: 'bulk', state: 'queued', retry_of: failed })
          .execute(),
      ).rejects.toThrow(/mail_log_one_retry_per_attempt/);
    });

    it('still admits any number of first attempts, which name no failure', async () => {
      const id = await account('A Repeatedly Mailed Investor');
      await attemptRow(id, 'failed');
      await attemptRow(id, 'accepted');
      await attemptRow(id, 'failed');

      // The index is partial for this reason: `retry_of` is null on every first
      // attempt, and a plain unique index would admit exactly one of them in the
      // whole table.
      expect(await rowsFor(id)).toHaveLength(3);
    });
  });
});
