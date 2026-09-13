/**
 * The unsubscribe token and the two doors that write the list (`MAIL-002/T2`,
 * `MAIL-002/T4`).
 *
 * These are claims about what the database holds after each act, so they run
 * against a real PostgreSQL on a database of their own.
 *
 * **The load-bearing test is that a token signed for another purpose does not
 * verify here.** The session cookie's signature is an HMAC of a value under the
 * same secret, in the same shape — `<value>.<signature>` — so a construction
 * that forgot to put its purpose inside the hash would accept a session cookie's
 * value as an unsubscribe token and the other way round, and nothing about
 * either row would look wrong. `signToken` is the real signer, used here as the
 * adversary, so the test fails if the label is ever dropped from either side.
 */

import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signToken } from '../auth/session';
import { closeDb, getDb } from '../db/index';

import {
  accountForUnsubscribeToken,
  investorMailPreference,
  MAX_REASON_LENGTH,
  reasonIsRecordable,
  resumeInvestorMail,
  stopInvestorMail,
  unsubscribeLink,
  unsubscribeSubject,
  unsubscribeToken,
} from './unsubscribe';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_mail_unsub';

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

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
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

describe.skipIf(!HAS_DATABASE)('stopping investor mail (MAIL-002/T2, MAIL-002/T4)', () => {
  async function account(name = 'An Investor'): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `${randomUUID()}@unsubscribe.test`, name, role: 'investor', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function admin(): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `${randomUUID()}@unsubscribe.test`, name: 'An Admin', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function listRow(accountId: string) {
    return getDb()
      .selectFrom('unsubscribes')
      .select(['account_id', 'at', 'source', 'token', 'reason'])
      .where('account_id', '=', accountId)
      .executeTakeFirst();
  }

  async function auditFor(accountId: string) {
    return getDb()
      .selectFrom('audit')
      .select(['action', 'actor_id', 'subject_type', 'before', 'after'])
      .where('subject_id', '=', accountId)
      .orderBy('id')
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
      log: () => {},
    });
  }, 120_000);

  afterAll(closeDb);

  describe('the token', () => {
    it('names the account it was minted for', () => {
      const id = randomUUID();

      expect(accountForUnsubscribeToken(unsubscribeToken(id))).toBe(id);
    });

    it('refuses a signature one character different', () => {
      const id = randomUUID();
      const token = unsubscribeToken(id);
      const last = token.slice(-1);
      const tampered = `${token.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;

      expect(accountForUnsubscribeToken(tampered)).toBeNull();
    });

    it("refuses one account's signature carried on another account's id", () => {
      const mine = randomUUID();
      const theirs = randomUUID();
      const signature = unsubscribeToken(mine).split('.')[1];

      expect(accountForUnsubscribeToken(`${theirs}.${signature ?? ''}`)).toBeNull();
    });

    it('refuses a value the session signer signed, though the shape and the secret match', () => {
      // The same secret, the same `<value>.<signature>` shape, the same account
      // id inside it -- everything but the purpose label. Dropping that label
      // from either signer would make this pass, and would make a session
      // cookie's value an unsubscribe for its own account.
      const id = randomUUID();

      expect(signToken(id)).not.toBe(unsubscribeToken(id));
      expect(accountForUnsubscribeToken(signToken(id))).toBeNull();
    });

    it('refuses a value with no signature at all', () => {
      expect(accountForUnsubscribeToken(randomUUID())).toBeNull();
      expect(accountForUnsubscribeToken('')).toBeNull();
      expect(accountForUnsubscribeToken('.anything')).toBeNull();
    });

    it('builds the link from the origin, the path and the token', () => {
      const id = randomUUID();

      expect(unsubscribeLink(id)).toBe(`${ORIGIN}/unsubscribe/${unsubscribeToken(id)}`);
    });
  });

  describe('the subject a link names', () => {
    it('is the account, when one holds the id', async () => {
      const id = await account();

      expect(await unsubscribeSubject(unsubscribeToken(id))).toBe(id);
    });

    it('is nothing for a signed token whose account has gone, exactly as for an unsigned one', async () => {
      const id = await account();
      const token = unsubscribeToken(id);
      await getDb().deleteFrom('accounts').where('id', '=', id).execute();

      expect(await unsubscribeSubject(token)).toBeNull();
      expect(await unsubscribeSubject('not-a-token')).toBeNull();
    });
  });

  describe("the person's own stop", () => {
    it('writes a link row holding the hash of the token, and records the act against them', async () => {
      const id = await account();

      expect(await stopInvestorMail({ by: 'person', accountId: id })).toBe(true);

      const row = await listRow(id);
      expect(row?.source).toBe('link');
      expect(row?.reason).toBeNull();
      // The hash, never the token: a row holding the token would be a credential
      // a database read turns into an act.
      expect(row?.token).not.toBe(unsubscribeToken(id));
      expect(row?.token).toBe(createHash('sha256').update(unsubscribeToken(id)).digest('hex'));

      expect(await auditFor(id)).toEqual([
        {
          action: 'mail.unsubscribe',
          actor_id: id,
          subject_type: 'account',
          before: null,
          after: null,
        },
      ]);
    });

    it('reads back as stopped, by the link', async () => {
      const id = await account();
      await stopInvestorMail({ by: 'person', accountId: id });

      const preference = await investorMailPreference(id);
      expect(preference.stopped).toBe(true);
      expect(preference.stopped ? preference.source : null).toBe('link');
    });

    it('changes nothing the second time, and records nothing the second time', async () => {
      const id = await account();
      await stopInvestorMail({ by: 'person', accountId: id });
      const first = await listRow(id);

      expect(await stopInvestorMail({ by: 'person', accountId: id })).toBe(false);

      expect((await listRow(id))?.at).toEqual(first?.at);
      expect(await auditFor(id)).toHaveLength(1);
    });
  });

  describe("an admin's stop sending", () => {
    it('writes an admin row carrying the reason and no token, recorded against the admin', async () => {
      const id = await account();
      const actorId = await admin();

      expect(
        await stopInvestorMail({
          by: 'admin',
          accountId: id,
          actorId,
          reason: '  the address bounced: mailbox does not exist  ',
        }),
      ).toBe(true);

      const row = await listRow(id);
      expect(row?.source).toBe('admin');
      expect(row?.token).toBeNull();
      expect(row?.reason).toBe('the address bounced: mailbox does not exist');

      const trail = await auditFor(id);
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('mail.unsubscribe');
      expect(trail[0]?.actor_id).toBe(actorId);
      // The reason stays in the two-year row. No action's list names a field for
      // it (`SEC-DEC-01`), so the seven-year trail holds the act and no text.
      expect(JSON.stringify(trail[0])).not.toContain('bounced');
    });

    it('leaves a stop the person already made exactly as they made it', async () => {
      const id = await account();
      const actorId = await admin();
      await stopInvestorMail({ by: 'person', accountId: id });

      expect(
        await stopInvestorMail({ by: 'admin', accountId: id, actorId, reason: 'bounced' }),
      ).toBe(false);

      const row = await listRow(id);
      expect(row?.source).toBe('link');
      expect(row?.reason).toBeNull();
      expect(await auditFor(id)).toHaveLength(1);
    });
  });

  describe('a reason', () => {
    it('is required, and is not satisfied by whitespace', () => {
      expect(reasonIsRecordable('')).toBe(false);
      expect(reasonIsRecordable('   \n  ')).toBe(false);
      expect(reasonIsRecordable('bounced')).toBe(true);
    });

    it('is refused past the length the column should keep, rather than cut to fit', () => {
      expect(reasonIsRecordable('x'.repeat(MAX_REASON_LENGTH))).toBe(true);
      expect(reasonIsRecordable('x'.repeat(MAX_REASON_LENGTH + 1))).toBe(false);
    });
  });

  describe('starting again', () => {
    it('removes the row and reads back as reaching them', async () => {
      const id = await account();
      await stopInvestorMail({ by: 'person', accountId: id });

      expect(await resumeInvestorMail(id)).toBe(true);
      expect(await listRow(id)).toBeUndefined();
      expect(await investorMailPreference(id)).toEqual({ stopped: false });
    });

    it('removes nothing the second time', async () => {
      const id = await account();
      await stopInvestorMail({ by: 'person', accountId: id });
      await resumeInvestorMail(id);

      expect(await resumeInvestorMail(id)).toBe(false);
    });

    it("clears a stop an admin set, because the inbox is the account holder's", async () => {
      const id = await account();
      await stopInvestorMail({ by: 'admin', accountId: id, actorId: await admin(), reason: 'bounced' });

      expect(await resumeInvestorMail(id)).toBe(true);
      expect(await investorMailPreference(id)).toEqual({ stopped: false });
    });

    it('records nothing, because the trail has no act that names it', async () => {
      const id = await account();
      await stopInvestorMail({ by: 'person', accountId: id });
      await resumeInvestorMail(id);

      // One row: the stop. Starting again is the person's own preference over
      // their own inbox, not a privileged write (`MAIL-DEC-06`).
      expect(await auditFor(id)).toHaveLength(1);
    });
  });
});
