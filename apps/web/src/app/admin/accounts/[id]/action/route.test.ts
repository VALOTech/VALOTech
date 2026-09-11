/**
 * The person page's action route against a real PostgreSQL (`ADMIN-001/T2`).
 *
 * The route performs nothing itself — each act belongs to the service that owns it
 * — so what this suite pins is the surface. Three classes of claim, and the middle
 * one is the reason the file exists.
 *
 * **Who is refused.** An investor with a live session gets the `404` the console
 * gives a guess, a caller with no session is sent to sign in, and a cross-origin
 * post is refused before anything else. Each is asserted together with the subject
 * being untouched, because a refusal that still wrote is the failure that looks
 * like a refusal.
 *
 * **That the guards still hold through the route.** A suspension reaches
 * `suspendAccount`, so `ADMIN-DEC-01`'s refusals are in force on this path too: the
 * one admin who can sign in cannot suspend themselves, and the answer is the same
 * `unchanged` a no-op gives. It is asserted here rather than taken on trust,
 * because a route that reached a different function, or passed the subject where
 * the actor belongs, would pass every other test in this file.
 *
 * **That the actor is the session's.** Every audit row is read back and its
 * `actor_id` compared to the admin who posted, which is what separates a trail
 * naming who acted from one naming who was acted on.
 *
 * It runs on a database of its own. `suspendAccount` counts every active admin in
 * the database (`isLastActiveAdmin`), so "the last admin" is only deterministic
 * where this suite owns the whole set, and the development server it would
 * otherwise share carries other files minting admins at the same time.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { consumeToken, INVITATION_TTL_SECONDS, issueToken } from '../../../../../auth/invitation';
import { issue } from '../../../../../auth/session';
import { closeDb, getDb } from '../../../../../db/index';
import type { AccountRole, AccountState } from '../../../../../db/types';

import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_account_action';

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

const SUITE_DOMAIN = '@account-action.test';

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

async function newAccount(state: AccountState = 'active'): Promise<string> {
  const account = await getDb()
    .insertInto('accounts')
    .values({
      email: `${crypto.randomUUID()}${SUITE_DOMAIN}`,
      name: 'Ada Lovelace',
      role: 'investor',
      state,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return account.id;
}

async function stateOf(accountId: string): Promise<AccountState> {
  const account = await getDb()
    .selectFrom('accounts')
    .select('state')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();

  return account.state;
}

async function sessionCount(accountId: string): Promise<number> {
  return (
    await getDb().selectFrom('sessions').select('id').where('account_id', '=', accountId).execute()
  ).length;
}

async function auditFor(accountId: string) {
  return getDb()
    .selectFrom('audit')
    .select(['action', 'actor_id'])
    .where('subject_id', '=', accountId)
    .execute();
}

/** Outstanding means unconsumed — the invitation rows that could still be presented. */
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

  const request = new Request(`${ORIGIN}/admin/accounts/${accountId}/action`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  return POST(request, { params: Promise.resolve({ id: accountId }) });
}

interface Answer {
  readonly outcome?: string;
  readonly link?: string;
  readonly deliverByHand?: string;
}

describe.skipIf(!HAS_DATABASE)('POST /admin/accounts/<id>/action', () => {
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
    // One admin and no other account per test, which the last-admin guard needs and
    // only an isolated database allows. Sessions and invitations cascade on
    // account_id; the audit trail is keyed by the fresh ids each test mints.
    await getDb().deleteFrom('accounts').execute();
    admin = await signedIn('admin');
  });

  afterAll(async () => {
    await closeDb();
  });

  /** The answer's body, for a call expected to have been performed. */
  async function answerOf(response: Response): Promise<Answer> {
    expect(response.status).toBe(200);

    return (await response.json()) as Answer;
  }

  describe('who is refused', () => {
    it('answers an investor 404 and writes nothing', async () => {
      const investor = await signedIn('investor');
      const subject = await newAccount();

      const response = await callPost(subject, { action: 'suspend' }, { cookie: investor.cookie });

      expect(response.status).toBe(404);
      expect(await stateOf(subject)).toBe('active');
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it('redirects a caller with no session to sign in, writing nothing', async () => {
      const subject = await newAccount();

      const response = await callPost(subject, { action: 'suspend' });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in');
      expect(await stateOf(subject)).toBe('active');
    });

    it('refuses a cross-origin post before anything else', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject,
        { action: 'suspend' },
        { cookie: admin.cookie, origin: 'https://evil.example' },
      );

      expect(response.status).toBe(403);
      expect(await stateOf(subject)).toBe('active');
    });

    it('accepts a post carrying our own origin', async () => {
      const subject = await newAccount();

      const response = await callPost(
        subject,
        { action: 'suspend' },
        { cookie: admin.cookie, origin: ORIGIN },
      );

      expect((await answerOf(response)).outcome).toBe('changed');
    });
  });

  describe('the request shape', () => {
    it('answers 400 for a body that is not a JSON object', async () => {
      const subject = await newAccount();

      expect((await callPost(subject, 'not json at all', { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject, [], { cookie: admin.cookie })).status).toBe(400);
      expect(await stateOf(subject)).toBe('active');
    });

    it('answers 400 for an act it does not have, and for none at all', async () => {
      const subject = await newAccount();

      // `delete` is the act this page does not offer (`ADMIN-001/T4`): naming it
      // must be refused rather than reaching anything.
      expect((await callPost(subject, { action: 'delete' }, { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject, { action: 'SUSPEND' }, { cookie: admin.cookie })).status).toBe(400);
      expect((await callPost(subject, {}, { cookie: admin.cookie })).status).toBe(400);
      expect(await stateOf(subject)).toBe('active');
    });

    it('answers 404 for an id no account holds, and for a segment that is not an id', async () => {
      expect((await callPost(crypto.randomUUID(), { action: 'suspend' }, { cookie: admin.cookie })).status).toBe(404);
      expect((await callPost('latest', { action: 'suspend' }, { cookie: admin.cookie })).status).toBe(404);
    });

    it('tells no cache to keep the answer, which can carry a single-use link', async () => {
      const subject = await newAccount();

      const response = await callPost(subject, { action: 'reinstate' }, { cookie: admin.cookie });

      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe('suspend', () => {
    it('suspends, ends the sessions, and records the act against the admin who asked', async () => {
      const subject = await newAccount();
      await issue(subject);
      await issue(subject);

      const response = await callPost(subject, { action: 'suspend' }, { cookie: admin.cookie });

      expect((await answerOf(response)).outcome).toBe('changed');
      expect(await stateOf(subject)).toBe('suspended');
      expect(await sessionCount(subject)).toBe(0);

      const trail = await auditFor(subject);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('account.suspend');
      // The actor is the session's, never the subject: a route that passed the
      // account id where the actor belongs would write a trail saying the person
      // suspended themselves.
      expect(trail[0]?.actor_id).toBe(admin.id);
    });

    it('answers unchanged the second time, recording one act rather than two', async () => {
      const subject = await newAccount();

      await callPost(subject, { action: 'suspend' }, { cookie: admin.cookie });
      const again = await callPost(subject, { action: 'suspend' }, { cookie: admin.cookie });

      expect((await answerOf(again)).outcome).toBe('unchanged');
      expect(await auditFor(subject)).toHaveLength(1);
    });

    it('refuses the admin suspending their own account, through the route', async () => {
      // The seeded admin is the only one who can sign in, so this is both
      // `ADMIN-DEC-01` guards at once — and it is the only shape the route can
      // produce: an actor has to be an active admin to be let in at all, so a
      // subject that is the last active admin is always the actor.
      const response = await callPost(admin.id, { action: 'suspend' }, { cookie: admin.cookie });

      expect((await answerOf(response)).outcome).toBe('unchanged');
      expect(await stateOf(admin.id)).toBe('active');
      expect(await auditFor(admin.id)).toHaveLength(0);
    });
  });

  describe('reinstate', () => {
    it('restores a suspended account and records the act', async () => {
      const subject = await newAccount('suspended');

      const response = await callPost(subject, { action: 'reinstate' }, { cookie: admin.cookie });

      expect((await answerOf(response)).outcome).toBe('changed');
      expect(await stateOf(subject)).toBe('active');
      expect((await auditFor(subject))[0]?.action).toBe('account.reinstate');
    });

    it('answers unchanged for an account that is not suspended', async () => {
      const subject = await newAccount();

      const response = await callPost(subject, { action: 'reinstate' }, { cookie: admin.cookie });

      expect((await answerOf(response)).outcome).toBe('unchanged');
      expect(await auditFor(subject)).toHaveLength(0);
    });
  });

  describe('end-sessions', () => {
    it('ends every session, records the act, and leaves the account able to sign in', async () => {
      const subject = await newAccount();
      await issue(subject);
      await issue(subject);

      const response = await callPost(subject, { action: 'end-sessions' }, { cookie: admin.cookie });

      expect((await answerOf(response)).outcome).toBe('changed');
      expect(await sessionCount(subject)).toBe(0);
      expect(await stateOf(subject)).toBe('active');

      const trail = await auditFor(subject);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('session.invalidate_all');
      expect(trail[0]?.actor_id).toBe(admin.id);
    });

    it('answers unchanged when there was nothing to end', async () => {
      const subject = await newAccount();

      const response = await callPost(subject, { action: 'end-sessions' }, { cookie: admin.cookie });

      expect((await answerOf(response)).outcome).toBe('unchanged');
      expect(await auditFor(subject)).toHaveLength(0);
    });

    it("leaves the admin's own session alone when ending somebody else's", async () => {
      const subject = await newAccount();
      await issue(subject);

      await callPost(subject, { action: 'end-sessions' }, { cookie: admin.cookie });

      // The admin posted with a session of their own; an account-wide delete that
      // scoped too widely would have signed them out with their subject.
      expect(await sessionCount(admin.id)).toBe(1);
    });
  });

  describe('resend-invitation', () => {
    /** The token out of a link, which is the value the invitee would present. */
    function tokenOf(link: string): string {
      return link.slice(link.lastIndexOf('/') + 1);
    }

    it('issues a fresh link for somebody who has not accepted, and kills the previous one', async () => {
      const subject = await newAccount('invited');
      const first = await issueToken(subject, INVITATION_TTL_SECONDS);

      const answer = await answerOf(
        await callPost(subject, { action: 'resend-invitation' }, { cookie: admin.cookie }),
      );

      expect(answer.outcome).toBe('changed');
      expect(answer.link).toContain(`${ORIGIN}/invite/`);
      expect(answer.deliverByHand).toBeTruthy();
      // Asked of the consumption path rather than of the row count, because that is
      // what the person holding a link actually reaches: the link sent before this
      // one is dead, and the one just handed over opens this account.
      expect(await consumeToken(first)).toBeNull();
      expect(await consumeToken(tokenOf(answer.link ?? ''))).toBe(subject);
    });

    it('issues nothing for an account that has accepted, so no admin holds a way into it', async () => {
      const subject = await newAccount('active');

      const answer = await answerOf(
        await callPost(subject, { action: 'resend-invitation' }, { cookie: admin.cookie }),
      );

      // The narrowing that keeps the console from handing an admin a link that
      // sets an existing password (`ADMIN-001` §3): no link, and no row to
      // present.
      expect(answer.outcome).toBe('unchanged');
      expect(answer.link).toBeUndefined();
      expect(await outstandingInvitations(subject)).toBe(0);
    });

    it('issues nothing for a suspended account, whose way in was just removed', async () => {
      const subject = await newAccount('suspended');

      const answer = await answerOf(
        await callPost(subject, { action: 'resend-invitation' }, { cookie: admin.cookie }),
      );

      expect(answer.outcome).toBe('unchanged');
      expect(await outstandingInvitations(subject)).toBe(0);
    });
  });

  describe('reset-password', () => {
    it('asks for the reset on the address the account holds, and says only that it asked', async () => {
      const subject = await newAccount('active');

      const answer = await answerOf(
        await callPost(subject, { action: 'reset-password' }, { cookie: admin.cookie }),
      );

      // `requested` rather than `changed`: the reset flow reports nothing back by
      // design (`SEC-R03`), so the answer states the request and not a write. The
      // row is what proves the write reached the account the page is about.
      expect(answer.outcome).toBe('requested');
      expect(answer.link).toBeUndefined();
      expect(await outstandingInvitations(subject)).toBe(1);
    });

    it('writes nothing for an account that cannot sign in, and says no more than before', async () => {
      const invited = await newAccount('invited');
      const suspended = await newAccount('suspended');
      await issueToken(invited, INVITATION_TTL_SECONDS);

      expect((await answerOf(await callPost(invited, { action: 'reset-password' }, { cookie: admin.cookie }))).outcome).toBe('requested');
      expect((await answerOf(await callPost(suspended, { action: 'reset-password' }, { cookie: admin.cookie }))).outcome).toBe('requested');

      // The invitation somebody is waiting on survives, and no reset token is
      // written for an account that has no password to reset — the safe default
      // `requestReset` carries, reached through this route.
      expect(await outstandingInvitations(invited)).toBe(1);
      expect(await outstandingInvitations(suspended)).toBe(0);
    });
  });
});
