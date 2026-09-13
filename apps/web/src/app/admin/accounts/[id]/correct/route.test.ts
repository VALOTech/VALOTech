/**
 * Correcting a person's name and the address they sign in with, against a real
 * PostgreSQL (`ADMIN-001/T10`, `LEGAL-SG-001` §3).
 *
 * Four classes of claim, and the third is the reason the file exists.
 *
 * **Who is refused.** An investor with a live session gets the `404` the console
 * gives a guess, a caller with no session is sent to sign in, and a cross-origin
 * post is refused before anything else. Each is asserted together with the record
 * being untouched, because a refusal that still wrote is the failure that looks
 * like a refusal.
 *
 * **What the act does.** Each field alone and both together; a request for values
 * the row already holds, which is not an error and not an act; a taken address
 * refused by name with nothing written; and the outstanding invitation that goes
 * with an address, because the link was sent to the mailbox that has just been
 * found wrong. Sessions are read on both sides of a correction, since not ending
 * them is a decision rather than an omission.
 *
 * **What the trail may hold.** Every audit row the act writes is read back and
 * searched for the old and the new name and the old and the new address — in
 * `before` and in `after`, at any depth. No action's allow-list may name a
 * personal field (`SEC-DEC-01`), and this is the one act whose entire subject is
 * the two fields it may not record, so the assertion is over the serialised row
 * rather than over the key the call site happened to use (`DATA-R02`).
 *
 * **That two admins pressing at once produce one act.** Two corrections of one
 * account, and two accounts corrected onto one address, are each driven
 * concurrently: the first proves the narrowed `UPDATE` is the check, the second
 * that the address lock is what lets a lookup decide a refusal rather than a
 * unique index raising.
 *
 * On a database of its own. The address is unique across every row that exists,
 * so "already taken" and "still free" are only deterministic where this suite
 * owns the whole table, and the development database it would otherwise share
 * carries other files minting accounts at the same time.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { correctIdentity } from '../../../../../admin/accounts';
import { INVITATION_TTL_SECONDS, issueToken } from '../../../../../auth/invitation';
import { issue } from '../../../../../auth/session';
import { closeDb, getDb } from '../../../../../db/index';
import type { AccountRole, AccountState } from '../../../../../db/types';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_account_correct';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

// Set before anything reads it: `getConfig` caches on first use and `getDb` builds
// its pool from the value, so this is what sends every query below to the isolated
// database, in this file's worker alone.
if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'migrations',
);

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);

const SUITE_DOMAIN = '@account-correct.test';

/** The record a correction starts from, distinctive enough to search a trail for. */
const HELD_NAME = 'Adah Lovelacce';
const CORRECT_NAME = 'Ada Lovelace';

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

/** An account, and a cookie header presenting a live session for it. */
async function signedIn(
  role: AccountRole,
  state: AccountState = 'active',
): Promise<{ id: string; cookie: string }> {
  const account = await getDb()
    .insertInto('accounts')
    .values({ email: `${crypto.randomUUID()}${SUITE_DOMAIN}`, name: role, role, state })
    .returning('id')
    .executeTakeFirstOrThrow();
  const cookie = await issue(account.id);

  return { id: account.id, cookie: `${cookie.name}=${cookie.value}` };
}

/** A fresh address nothing else in the suite holds. */
function freeAddress(): string {
  return `${crypto.randomUUID()}${SUITE_DOMAIN}`;
}

async function newAccount(
  state: AccountState = 'active',
  email: string = freeAddress(),
): Promise<{ id: string; email: string }> {
  const account = await getDb()
    .insertInto('accounts')
    .values({ email, name: HELD_NAME, role: 'investor', state })
    .returning('id')
    .executeTakeFirstOrThrow();

  return { id: account.id, email };
}

async function recordOf(accountId: string) {
  return getDb()
    .selectFrom('accounts')
    .select(['name', 'email', 'state', 'updated_at'])
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
}

async function sessionCount(accountId: string): Promise<number> {
  return (
    await getDb().selectFrom('sessions').select('id').where('account_id', '=', accountId).execute()
  ).length;
}

/** Outstanding means unconsumed — the rows that could still be presented. */
async function outstandingInvitations(accountId: string): Promise<number> {
  return (
    await getDb()
      .selectFrom('invitations')
      .select('id')
      .where('account_id', '=', accountId)
      .where('consumed_at', 'is', null)
      .execute()
  ).length;
}

async function auditFor(accountId: string) {
  return getDb()
    .selectFrom('audit')
    .select(['action', 'actor_id', 'before', 'after'])
    .where('subject_id', '=', accountId)
    .orderBy('at', 'asc')
    .execute();
}

function callPost(
  accountId: string,
  body: unknown,
  options: { cookie?: string; origin?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.cookie !== undefined) {
    headers['Cookie'] = options.cookie;
  }
  if (options.origin !== undefined) {
    headers['Origin'] = options.origin;
  }

  const request = new Request(`${ORIGIN}/admin/accounts/${accountId}/correct`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  return POST(request, { params: Promise.resolve({ id: accountId }) });
}

interface Answer {
  readonly outcome?: string;
  readonly fields?: readonly string[];
  readonly invitationDestroyed?: boolean;
  readonly error?: string;
  readonly field?: string;
}

describe.skipIf(!HAS_DATABASE)('POST /admin/accounts/<id>/correct', () => {
  let admin: { id: string; cookie: string };

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
  }, 120_000);

  beforeEach(async () => {
    // One admin and no other account per test, so an address is free or taken
    // because this test made it so. Sessions and invitations cascade on
    // account_id; the audit trail is keyed by the fresh ids each test mints.
    await getDb().deleteFrom('accounts').execute();
    admin = await signedIn('admin');
  });

  afterAll(async () => {
    await closeDb();
  });

  async function answerOf(response: Response): Promise<Answer> {
    expect(response.status).toBe(200);

    return (await response.json()) as Answer;
  }

  describe('who is refused', () => {
    it('answers an investor 404 and writes nothing', async () => {
      const investor = await signedIn('investor');
      const subject = await newAccount();

      const response = await callPost(
        subject.id,
        { name: CORRECT_NAME, email: subject.email },
        { cookie: investor.cookie },
      );

      expect(response.status).toBe(404);
      expect((await recordOf(subject.id)).name).toBe(HELD_NAME);
      expect(await auditFor(subject.id)).toHaveLength(0);
    });

    it('redirects a caller with no session to sign in, writing nothing', async () => {
      const subject = await newAccount();

      const response = await callPost(subject.id, { name: CORRECT_NAME, email: subject.email });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in');
      expect((await recordOf(subject.id)).name).toBe(HELD_NAME);
      expect(await auditFor(subject.id)).toHaveLength(0);
    });

    it('refuses a cross-origin post before anything else', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject.id,
        { name: CORRECT_NAME, email: subject.email },
        { cookie: admin.cookie, origin: 'https://evil.example' },
      );

      expect(response.status).toBe(403);
      expect((await recordOf(subject.id)).name).toBe(HELD_NAME);
      expect(await auditFor(subject.id)).toHaveLength(0);
    });

    it('accepts a post carrying our own origin', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject.id,
        { name: CORRECT_NAME, email: subject.email },
        { cookie: admin.cookie, origin: ORIGIN },
      );

      expect((await answerOf(response)).outcome).toBe('changed');
    });
  });

  describe('the request shape', () => {
    it('answers 400 for a body that is not a JSON object', async () => {
      const subject = await newAccount();

      expect((await callPost(subject.id, 'not json at all', { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject.id, [], { cookie: admin.cookie })).status).toBe(400);
      expect((await recordOf(subject.id)).name).toBe(HELD_NAME);
    });

    it('answers 400 for a body naming neither field, and for a field that is not a string', async () => {
      const subject = await newAccount();

      expect((await callPost(subject.id, {}, { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject.id, { name: 7 }, { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject.id, { email: null }, { cookie: admin.cookie })).status).toBe(400);
      expect(await auditFor(subject.id)).toHaveLength(0);
    });

    it('answers 404 for an id no account holds, and for a segment that is not an id', async () => {
      expect(
        (await callPost(crypto.randomUUID(), { name: CORRECT_NAME }, { cookie: admin.cookie })).status,
      ).toBe(404);
      expect((await callPost('latest', { name: CORRECT_NAME }, { cookie: admin.cookie })).status).toBe(404);
    });

    it('names the field a value cannot be stored in, and writes nothing', async () => {
      const subject = await newAccount();

      const blank = await callPost(subject.id, { name: '   ' }, { cookie: admin.cookie });
      expect(blank.status).toBe(400);
      expect((await blank.json()) as Answer).toEqual({ error: 'invalid_field', field: 'name' });

      const shapeless = await callPost(subject.id, { email: 'not-an-address' }, { cookie: admin.cookie });
      expect(shapeless.status).toBe(400);
      expect((await shapeless.json()) as Answer).toEqual({ error: 'invalid_field', field: 'email' });

      const overlong = await callPost(
        subject.id,
        { email: `${'a'.repeat(254)}@x.test` },
        { cookie: admin.cookie },
      );
      expect(overlong.status).toBe(400);
      expect((await overlong.json()) as Answer).toEqual({ error: 'invalid_field', field: 'email' });

      const record = await recordOf(subject.id);
      expect(record.name).toBe(HELD_NAME);
      expect(record.email).toBe(subject.email);
      expect(await auditFor(subject.id)).toHaveLength(0);
    });

    it('tells no cache to keep the answer', async () => {
      const subject = await newAccount();

      const response = await callPost(subject.id, { name: CORRECT_NAME }, { cookie: admin.cookie });

      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe('what it corrects', () => {
    it('corrects the name alone, leaving the address and the invitation where they were', async () => {
      const subject = await newAccount('invited');
      await issueToken(subject.id, INVITATION_TTL_SECONDS);

      const answer = await answerOf(
        await callPost(subject.id, { name: CORRECT_NAME }, { cookie: admin.cookie }),
      );

      expect(answer).toEqual({ outcome: 'changed', fields: ['name'], invitationDestroyed: false });

      const record = await recordOf(subject.id);
      expect(record.name).toBe(CORRECT_NAME);
      expect(record.email).toBe(subject.email);
      // The address did not move, so the link the person is holding is still for
      // the mailbox it was sent to.
      expect(await outstandingInvitations(subject.id)).toBe(1);
    });

    it('corrects the address alone, and the name is left exactly as it was', async () => {
      const subject = await newAccount();
      const corrected = freeAddress();

      const answer = await answerOf(
        await callPost(subject.id, { email: corrected }, { cookie: admin.cookie }),
      );

      expect(answer).toEqual({ outcome: 'changed', fields: ['email'], invitationDestroyed: false });

      const record = await recordOf(subject.id);
      expect(record.email).toBe(corrected);
      expect(record.name).toBe(HELD_NAME);
    });

    it('corrects both at once, and names both in that order', async () => {
      const subject = await newAccount();
      const corrected = freeAddress();

      const answer = await answerOf(
        await callPost(subject.id, { name: CORRECT_NAME, email: corrected }, { cookie: admin.cookie }),
      );

      expect(answer).toEqual({
        outcome: 'changed',
        fields: ['name', 'email'],
        invitationDestroyed: false,
      });

      const record = await recordOf(subject.id);
      expect(record.name).toBe(CORRECT_NAME);
      expect(record.email).toBe(corrected);
    });

    it('stores the address as it is compared and keyed — trimmed and lower-cased', async () => {
      const subject = await newAccount();
      const corrected = freeAddress();

      const answer = await answerOf(
        await callPost(
          subject.id,
          { name: `  ${CORRECT_NAME}  `, email: `  ${corrected.toUpperCase()}  ` },
          { cookie: admin.cookie },
        ),
      );

      expect(answer.outcome).toBe('changed');

      const record = await recordOf(subject.id);
      expect(record.name).toBe(CORRECT_NAME);
      expect(record.email).toBe(corrected);
    });

    it('moves updated_at, which is the row saying its defining attributes changed', async () => {
      const subject = await newAccount();
      const before = (await recordOf(subject.id)).updated_at;

      expect((await answerOf(await callPost(subject.id, { name: CORRECT_NAME }, { cookie: admin.cookie }))).outcome).toBe('changed');

      expect((await recordOf(subject.id)).updated_at.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  describe('asking for what the row already holds', () => {
    it('writes nothing, records nothing, and is not an error', async () => {
      const subject = await newAccount();

      const answer = await answerOf(
        await callPost(
          subject.id,
          { name: HELD_NAME, email: subject.email },
          { cookie: admin.cookie },
        ),
      );

      expect(answer).toEqual({ outcome: 'unchanged' });
      expect(await auditFor(subject.id)).toHaveLength(0);
    });

    it('treats an address that differs only in case as unchanged, because citext does', async () => {
      const subject = await newAccount('invited');
      await issueToken(subject.id, INVITATION_TTL_SECONDS);

      const answer = await answerOf(
        await callPost(
          subject.id,
          { name: HELD_NAME, email: subject.email.toUpperCase() },
          { cookie: admin.cookie },
        ),
      );

      expect(answer).toEqual({ outcome: 'unchanged' });
      expect(await auditFor(subject.id)).toHaveLength(0);
      // The address did not change, so nothing was sent anywhere it should not
      // have been, and the link stands.
      expect(await outstandingInvitations(subject.id)).toBe(1);
    });

    it('records only the field that moved when the other is restated unchanged', async () => {
      const subject = await newAccount();

      const answer = await answerOf(
        await callPost(
          subject.id,
          { name: CORRECT_NAME, email: subject.email },
          { cookie: admin.cookie },
        ),
      );

      expect(answer).toEqual({ outcome: 'changed', fields: ['name'], invitationDestroyed: false });

      const trail = await auditFor(subject.id);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.after).toEqual({ fields: 'name' });
    });
  });

  describe('an address another account holds', () => {
    it('is refused by name, and nothing is written', async () => {
      const held = await newAccount();
      const subject = await newAccount();

      const response = await callPost(
        subject.id,
        { name: CORRECT_NAME, email: held.email },
        { cookie: admin.cookie },
      );

      expect(response.status).toBe(409);
      expect((await response.json()) as Answer).toEqual({ error: 'email_taken' });

      // Neither field moved: the refusal is of the correction, not of half of it.
      const record = await recordOf(subject.id);
      expect(record.email).toBe(subject.email);
      expect(record.name).toBe(HELD_NAME);
      expect(await auditFor(subject.id)).toHaveLength(0);
      expect((await recordOf(held.id)).email).toBe(held.email);
    });

    it('is refused for an address differing only in case, because the column folds it', async () => {
      const held = await newAccount();
      const subject = await newAccount();

      const response = await callPost(
        subject.id,
        { email: held.email.toUpperCase() },
        { cookie: admin.cookie },
      );

      expect(response.status).toBe(409);
      expect((await recordOf(subject.id)).email).toBe(subject.email);
    });
  });

  describe('what an address takes with it', () => {
    it('destroys the outstanding invitation, and says so', async () => {
      const subject = await newAccount('invited');
      await issueToken(subject.id, INVITATION_TTL_SECONDS);
      expect(await outstandingInvitations(subject.id)).toBe(1);

      const answer = await answerOf(
        await callPost(subject.id, { email: freeAddress() }, { cookie: admin.cookie }),
      );

      expect(answer).toEqual({ outcome: 'changed', fields: ['email'], invitationDestroyed: true });
      expect(await outstandingInvitations(subject.id)).toBe(0);
    });

    it('reports no invitation destroyed when the account was holding none', async () => {
      const subject = await newAccount();

      const answer = await answerOf(
        await callPost(subject.id, { email: freeAddress() }, { cookie: admin.cookie }),
      );

      expect(answer.invitationDestroyed).toBe(false);
    });

    it('leaves a consumed invitation standing, because it records a fact rather than a capability', async () => {
      const subject = await newAccount();
      const token = await issueToken(subject.id, INVITATION_TTL_SECONDS);
      await getDb()
        .updateTable('invitations')
        .set({ consumed_at: new Date() })
        .where('account_id', '=', subject.id)
        .execute();

      expect(
        (await answerOf(await callPost(subject.id, { email: freeAddress() }, { cookie: admin.cookie })))
          .outcome,
      ).toBe('changed');

      const rows = await getDb()
        .selectFrom('invitations')
        .select('id')
        .where('account_id', '=', subject.id)
        .execute();
      expect(rows).toHaveLength(1);
      expect(token.length).toBeGreaterThan(0);
    });

    it('leaves every live session alone: the person is the same person', async () => {
      const subject = await newAccount();
      await issue(subject.id);
      await issue(subject.id);
      expect(await sessionCount(subject.id)).toBe(2);

      expect(
        (
          await answerOf(
            await callPost(
              subject.id,
              { name: CORRECT_NAME, email: freeAddress() },
              { cookie: admin.cookie },
            ),
          )
        ).outcome,
      ).toBe('changed');

      // A correction grants nothing and takes nothing away, so there is no
      // privilege change for a live session's claims to be stale about.
      expect(await sessionCount(subject.id)).toBe(2);
      expect((await recordOf(subject.id)).state).toBe('active');
    });
  });

  describe('what the trail holds', () => {
    it('names the fields that moved, against the admin who asked, and holds neither value', async () => {
      const subject = await newAccount();
      const corrected = freeAddress();

      expect(
        (
          await answerOf(
            await callPost(
              subject.id,
              { name: CORRECT_NAME, email: corrected },
              { cookie: admin.cookie },
            ),
          )
        ).outcome,
      ).toBe('changed');

      const trail = await auditFor(subject.id);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('account.correct');
      // The actor is the session's, never the subject: a route that passed the
      // account id where the actor belongs would write a trail saying the person
      // corrected themselves.
      expect(trail[0]?.actor_id).toBe(admin.id);
      expect(trail[0]?.after).toEqual({ fields: 'name,email' });
      // Nothing on the other side: there is no prior value this row may carry,
      // because the two fields a correction moves are the two no list may name.
      expect(trail[0]?.before).toBeNull();

      // The assertion the allow-list exists for, made over the whole row rather
      // than over the key the call site happened to use (`DATA-R02`).
      const written = JSON.stringify([trail[0]?.before, trail[0]?.after]).toLowerCase();
      for (const personal of [HELD_NAME, CORRECT_NAME, subject.email, corrected]) {
        expect(written).not.toContain(personal.toLowerCase());
      }
    });

    it('writes one row for one act, whichever fields moved', async () => {
      const subject = await newAccount();

      await callPost(subject.id, { name: CORRECT_NAME }, { cookie: admin.cookie });
      await callPost(subject.id, { email: freeAddress() }, { cookie: admin.cookie });

      const trail = await auditFor(subject.id);
      expect(trail.map((row) => row.after)).toEqual([{ fields: 'name' }, { fields: 'email' }]);
    });
  });

  describe('two admins pressing at once', () => {
    it('corrects once and records once when both ask for the same change', async () => {
      const subject = await newAccount();
      const corrected = freeAddress();

      const outcomes = await Promise.all([
        correctIdentity(subject.id, { name: CORRECT_NAME, email: corrected }, admin.id),
        correctIdentity(subject.id, { name: CORRECT_NAME, email: corrected }, admin.id),
      ]);

      expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual(['changed', 'unchanged']);
      expect(await auditFor(subject.id)).toHaveLength(1);
      expect((await recordOf(subject.id)).email).toBe(corrected);
    });

    it('gives one address to one account and refuses the other by name', async () => {
      const first = await newAccount();
      const second = await newAccount();
      const wanted = freeAddress();

      const outcomes = await Promise.all([
        correctIdentity(first.id, { email: wanted }, admin.id),
        correctIdentity(second.id, { email: wanted }, admin.id),
      ]);

      // The lock is what makes this a refusal rather than a unique-index
      // violation reaching the caller as a failure.
      expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual([
        'address-taken',
        'changed',
      ]);

      const holders = await getDb()
        .selectFrom('accounts')
        .select('id')
        .where('email', '=', wanted)
        .execute();
      expect(holders).toHaveLength(1);
    });
  });
});
