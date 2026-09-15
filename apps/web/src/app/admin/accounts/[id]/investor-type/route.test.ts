/**
 * Saying whether a person has invested or is deciding, against a real PostgreSQL
 * (`ADMIN-001/T11`, `INV-DEC-02`).
 *
 * Four classes of claim, and the second is the one the decision turns on.
 *
 * **Who is refused.** An investor with a live session gets the `404` the console
 * gives a guess, a caller with no session is sent to sign in, and a cross-origin
 * post is refused before anything else. Each is asserted together with the column
 * being untouched, because a refusal that still wrote is the failure that looks
 * like a refusal.
 *
 * **That null is not `prospect`.** A fresh account reads `null` through the same
 * function the person page renders from; the column carries no default, so an
 * account nobody has described cannot acquire a type by existing; and `null` is a
 * value a caller may send, which is what puts a mis-classified person back to
 * nobody having said. The distinction is the whole reason the column is nullable,
 * and a default slipped in later would break exactly these three.
 *
 * **What the trail may hold.** Every audit row the act writes is read back and
 * searched for either value, on both sides, at any depth — and a call site that
 * tried to record one is refused by the allow-list before anything is inserted
 * (`SEC-DEC-01`, `DATA-R02`). A judgement one person formed about another is a
 * statement about them, and a trail holding it would keep that statement seven
 * years past their erasure to record the act of making it once.
 *
 * **That the write is narrow and serialises.** The act moves one column and
 * leaves the rest of the record, another account's record, and every live session
 * alone; two admins choosing at once produce one act and one row.
 *
 * On a database of its own: `accounts.investor_type` is folded into a shipped
 * migration (`DATA-R07`), which node-pg-migrate will not re-apply to the shared
 * development one.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { personIdentity, setInvestorType } from '../../../../../admin/accounts';
import { recordAudit, UnrecordableFieldError } from '../../../../../audit/record';
import { issue } from '../../../../../auth/session';
import { closeDb, getDb } from '../../../../../db/index';
import type { AccountRole, AccountState, InvestorType } from '../../../../../db/types';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_investor_type';

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

const SUITE_DOMAIN = '@investor-type.test';

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

/** An investor nobody has classified, which is how every account begins. */
async function newAccount(): Promise<string> {
  const account = await getDb()
    .insertInto('accounts')
    .values({
      email: `${crypto.randomUUID()}${SUITE_DOMAIN}`,
      name: 'A Reader',
      role: 'investor',
      state: 'active',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return account.id;
}

/** The whole record, so a write wider than the one column shows up as a failure. */
async function recordOf(accountId: string) {
  return getDb()
    .selectFrom('accounts')
    .select(['name', 'email', 'role', 'state', 'investor_type', 'last_sign_in'])
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
}

async function heldType(accountId: string): Promise<InvestorType | null> {
  return (await recordOf(accountId)).investor_type;
}

async function auditFor(accountId: string) {
  return getDb()
    .selectFrom('audit')
    .select(['action', 'actor_id', 'before', 'after'])
    .where('subject_id', '=', accountId)
    .orderBy('id', 'asc')
    .execute();
}

async function sessionCount(accountId: string): Promise<number> {
  return (
    await getDb().selectFrom('sessions').select('id').where('account_id', '=', accountId).execute()
  ).length;
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

  const request = new Request(`${ORIGIN}/admin/accounts/${accountId}/investor-type`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  return POST(request, { params: Promise.resolve({ id: accountId }) });
}

interface Answer {
  readonly outcome?: string;
  readonly error?: string;
}

describe.skipIf(!HAS_DATABASE)('POST /admin/accounts/<id>/investor-type', () => {
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
    // One admin and no other account per test, so a count over the trail or the
    // table is a count of what this test did. Sessions cascade on account_id;
    // the audit is keyed by the fresh ids each test mints.
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

      const response = await callPost(subject, { investorType: 'current' }, { cookie: investor.cookie });

      expect(response.status).toBe(404);
      expect(await heldType(subject)).toBeNull();
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('redirects a caller with no session to sign in, writing nothing', async () => {
      const subject = await newAccount();

      const response = await callPost(subject, { investorType: 'current' });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in');
      expect(await heldType(subject)).toBeNull();
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('refuses a cross-origin post before anything else', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject,
        { investorType: 'current' },
        { cookie: admin.cookie, origin: 'https://evil.example' },
      );

      expect(response.status).toBe(403);
      expect(await heldType(subject)).toBeNull();
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('accepts a post carrying our own origin', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject,
        { investorType: 'current' },
        { cookie: admin.cookie, origin: ORIGIN },
      );

      expect((await answerOf(response)).outcome).toBe('changed');
    });
  });

  describe('null is not prospect', () => {
    it('leaves a fresh account saying nobody has said, through the read the page renders', async () => {
      const subject = await newAccount();

      expect(await heldType(subject)).toBeNull();
      expect((await personIdentity(subject))?.investorType).toBeNull();
    });

    it('gives the column no default, so an account cannot acquire a type by existing', async () => {
      const described = await sql<{ column_default: string | null; is_nullable: string }>`
        select column_default, is_nullable
        from information_schema.columns
        where table_name = 'accounts' and column_name = 'investor_type'
      `.execute(getDb());

      expect(described.rows).toEqual([{ column_default: null, is_nullable: 'YES' }]);
    });

    it('takes null as a value, which is what puts a mis-classified person back', async () => {
      const subject = await newAccount();

      expect((await answerOf(await callPost(subject, { investorType: 'prospect' }, { cookie: admin.cookie }))).outcome).toBe('changed');
      expect(await heldType(subject)).toBe('prospect');

      expect((await answerOf(await callPost(subject, { investorType: null }, { cookie: admin.cookie }))).outcome).toBe('changed');
      expect(await heldType(subject)).toBeNull();
    });

    it('refuses a body that omits the field, because absent and null are opposite requests', async () => {
      const subject = await newAccount();

      await callPost(subject, { investorType: 'current' }, { cookie: admin.cookie });

      const response = await callPost(subject, {}, { cookie: admin.cookie });

      expect(response.status).toBe(400);
      // Had the omission been read as null, this would now say nobody has said.
      expect(await heldType(subject)).toBe('current');
      expect(await auditFor(subject)).toHaveLength(1);
    });
  });

  describe('the request shape', () => {
    it('answers 400 for a body that is not a JSON object', async () => {
      const subject = await newAccount();

      expect((await callPost(subject, 'not json at all', { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject, [], { cookie: admin.cookie })).status).toBe(400);
      expect(await heldType(subject)).toBeNull();
    });

    it('answers 400 for a value the column cannot hold, and writes nothing', async () => {
      const subject = await newAccount();

      for (const value of ['vip', '', 'CURRENT', 7, true, ['current']]) {
        const response = await callPost(subject, { investorType: value }, { cookie: admin.cookie });

        expect({ value, status: response.status }).toEqual({ value, status: 400 });
        expect((await response.json()) as Answer).toEqual({ error: 'invalid_request' });
      }

      expect(await heldType(subject)).toBeNull();
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('answers 404 for an id no account holds, and for a segment that is not an id', async () => {
      expect(
        (await callPost(crypto.randomUUID(), { investorType: 'current' }, { cookie: admin.cookie })).status,
      ).toBe(404);
      expect((await callPost('latest', { investorType: 'current' }, { cookie: admin.cookie })).status).toBe(404);
    });
  });

  describe('what the act does', () => {
    it('moves the column and says so, in both directions', async () => {
      const subject = await newAccount();

      expect((await answerOf(await callPost(subject, { investorType: 'current' }, { cookie: admin.cookie }))).outcome).toBe('changed');
      expect(await heldType(subject)).toBe('current');

      expect((await answerOf(await callPost(subject, { investorType: 'prospect' }, { cookie: admin.cookie }))).outcome).toBe('changed');
      expect(await heldType(subject)).toBe('prospect');
    });

    it('writes nothing and records nothing for the value the row already holds', async () => {
      const subject = await newAccount();

      await callPost(subject, { investorType: 'current' }, { cookie: admin.cookie });
      const answer = await answerOf(await callPost(subject, { investorType: 'current' }, { cookie: admin.cookie }));

      expect(answer.outcome).toBe('unchanged');
      // One act, not two: restating a judgement is not a second act of forming one.
      expect(await auditFor(subject)).toHaveLength(1);
    });

    it('records nothing for an account already saying nobody has said', async () => {
      const subject = await newAccount();

      expect((await answerOf(await callPost(subject, { investorType: null }, { cookie: admin.cookie }))).outcome).toBe('unchanged');
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('moves that column and nothing else on the record, and ends no session', async () => {
      const subject = await newAccount();
      const before = await recordOf(subject);
      await issue(subject);
      await issue(subject);

      await callPost(subject, { investorType: 'current' }, { cookie: admin.cookie });

      const after = await recordOf(subject);
      expect({ ...after, investor_type: before.investor_type }).toEqual(before);
      // Nothing about what this person may read has moved, so no live session's
      // claims are stale and none is ended.
      expect(await sessionCount(subject)).toBe(2);
    });

    it('touches no other account', async () => {
      const subject = await newAccount();
      const bystander = await newAccount();

      await callPost(subject, { investorType: 'current' }, { cookie: admin.cookie });

      expect(await heldType(bystander)).toBeNull();
      expect(await auditFor(bystander)).toHaveLength(0);
    });
  });

  describe('what the trail holds', () => {
    it('records the act against the admin who asked, and neither value anywhere', async () => {
      const subject = await newAccount();

      await callPost(subject, { investorType: 'current' }, { cookie: admin.cookie });
      await callPost(subject, { investorType: 'prospect' }, { cookie: admin.cookie });
      await callPost(subject, { investorType: null }, { cookie: admin.cookie });

      const trail = await auditFor(subject);
      expect(trail.map((row) => row.action)).toEqual([
        'account.investor_type_change',
        'account.investor_type_change',
        'account.investor_type_change',
      ]);
      // The actor is the session's, never the subject: a route that passed the
      // account id where the actor belongs would write a trail saying the person
      // classified themselves.
      expect(trail.map((row) => row.actor_id)).toEqual([admin.id, admin.id, admin.id]);
      expect(trail.map((row) => [row.before, row.after])).toEqual([
        [null, null],
        [null, null],
        [null, null],
      ]);

      // The assertion the allow-list exists for, made over the whole row rather
      // than over the key a call site happened to use (`DATA-R02`).
      const written = JSON.stringify(trail.map((row) => [row.before, row.after])).toLowerCase();
      for (const value of ['current', 'prospect']) {
        expect(written).not.toContain(value);
      }
    });

    it('refuses a call site that tries to record either value, and takes its write with it', async () => {
      const subject = await newAccount();

      const refused = getDb()
        .transaction()
        .execute(async (trx) => {
          await trx
            .updateTable('accounts')
            .set({ investor_type: 'current' })
            .where('id', '=', subject)
            .execute();
          await recordAudit(trx, {
            actorId: admin.id,
            action: 'account.investor_type_change',
            subjectType: 'account',
            subjectId: subject,
            after: { investor_type: 'current' },
          });
        });

      await expect(refused).rejects.toThrow(UnrecordableFieldError);
      // The column moved inside that transaction and went back with the refusal:
      // a field the list does not name is not dropped quietly.
      expect(await heldType(subject)).toBeNull();
      expect(await auditFor(subject)).toHaveLength(0);
    });
  });

  describe('two admins choosing at once', () => {
    it('writes once and records once when both ask for the same value', async () => {
      const subject = await newAccount();

      const outcomes = await Promise.all([
        setInvestorType(subject, 'current', admin.id),
        setInvestorType(subject, 'current', admin.id),
      ]);

      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(await auditFor(subject)).toHaveLength(1);
      expect(await heldType(subject)).toBe('current');
    });

    it('leaves one of two opposite choices standing, each recorded once', async () => {
      const subject = await newAccount();

      const outcomes = await Promise.all([
        setInvestorType(subject, 'current', admin.id),
        setInvestorType(subject, 'prospect', admin.id),
      ]);

      // Both move the column, because each finds a value distinct from its own;
      // the row lock is what makes them an order rather than a lost update.
      expect(outcomes).toEqual([true, true]);
      expect(await auditFor(subject)).toHaveLength(2);
      expect(['current', 'prospect']).toContain(await heldType(subject));
    });
  });
});
