/**
 * The send (`MAIL-001/T4`), and the two things it refuses before a message can
 * leave (`MAIL-001/T7`).
 *
 * These are claims about who a send reaches and what the database holds
 * afterwards, so they run against a real PostgreSQL, on a database of their own —
 * the accounts, the `mail_log` rows and the trail this suite reasons about are
 * only the ones it wrote.
 *
 * The port is a fake, because the SMTP adapter is proven separately and without a
 * mail server (`MAIL-001/T8`, `src/mail/smtp.test.ts`); what is under test here
 * is the friction in front of it. Every refusal is checked twice: the status, and
 * that nothing happened — no row, no trail entry, and in most cases no connection
 * even opened. A refusal that refuses and still writes is the failure that would
 * not show up until somebody read the log a week later.
 *
 * The fakes' reply text carries no address, and the audit assertion reads the
 * whole row and looks for an `@` in it: the trail records that a send happened
 * and never who it reached (`DATA-R02`, `SEC-DEC-01`).
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issue } from '../../../../auth/session';
import { Secret } from '../../../../config/index';
import { closeDb, getDb } from '../../../../db/index';
import type { AccountState } from '../../../../db/types';
import { TURNED_OFF, sendingIsPossible, type MailAvailability } from '../../../../mail/availability';
import type { Mailer, Receipt } from '../../../../mail/mailer';
import { openSmtpMailer, type MailerSession } from '../../../../mail/smtp';

import { handleSend, type SessionOpener } from './handler';
import { POST } from './route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_mail_route';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'migrations');

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.SMTP_URL = 'smtps://post:hunter2@mail.example.test:465';
process.env.MAIL_FROM = 'VALO Tech <investors@valotech.test>';

const MAIL = {
  available: true,
  url: new Secret('smtps://post:hunter2@mail.example.test:465'),
  from: 'VALO Tech <investors@valotech.test>',
} as const;

/** Sending is possible — the answer every case but the two withholding ones gives. */
const POSSIBLE = async (): Promise<MailAvailability> => ({ available: true, mail: MAIL });

/** An SMTP-shaped refusal with no address in it — the reply is what the row records. */
const REFUSAL = '550 5.1.1 mailbox unavailable';

/** A session that opens nothing and remembers everything it was asked to do. */
interface FakeSession {
  readonly opener: SessionOpener;
  readonly opens: () => number;
  readonly closes: () => number;
  readonly handed: readonly string[];
}

function fakeSession(refuse: readonly string[] = []): FakeSession {
  const refused = new Set(refuse);
  const handed: string[] = [];
  let opens = 0;
  let closes = 0;

  const mailer: Mailer = {
    async send(to: string): Promise<Receipt> {
      handed.push(to);
      if (refused.has(to)) {
        throw new Error(REFUSAL);
      }
      return { queueId: `queued as q-${handed.length}` };
    },
  };

  const session: MailerSession = { mailer, close: () => void (closes += 1) };

  return {
    opener: () => {
      opens += 1;
      return session;
    },
    opens: () => opens,
    closes: () => closes,
    handed,
  };
}

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

describe.skipIf(!HAS_DATABASE)('POST /admin/mail/send (MAIL-001/T4, T7)', () => {
  let adminId: string;
  let adminCookie: string;
  let investorCookie: string;

  async function account(name: string, state: AccountState = 'active'): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `${randomUUID()}@example.test`, name, role: 'investor', state })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function seedStaff(email: string, role: 'admin' | 'investor') {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name: role, role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(row.id);
    return { id: row.id, header: `${cookie.name}=${cookie.value}` };
  }

  function request(body: unknown, options: { cookie?: string; origin?: string } = {}): Request {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.cookie !== undefined) {
      headers['Cookie'] = options.cookie;
    }
    if (options.origin !== undefined) {
      headers['Origin'] = options.origin;
    }

    return new Request(`${ORIGIN}/admin/mail/send`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  /** One send, through the handler, with the port and the availability answer supplied. */
  function post(
    body: unknown,
    options: {
      cookie?: string;
      origin?: string;
      open?: SessionOpener;
      availability?: () => Promise<MailAvailability>;
    } = {},
  ): Promise<Response> {
    return handleSend(
      request(body, { cookie: options.cookie ?? adminCookie, ...(options.origin === undefined ? {} : { origin: options.origin }) }),
      options.open ?? fakeSession().opener,
      options.availability ?? POSSIBLE,
    );
  }

  /** Every `mail_log` row written since the suite began, newest last. */
  async function logRows() {
    return getDb()
      .selectFrom('mail_log')
      .select(['account_id', 'subject', 'kind', 'state', 'queue_id', 'error'])
      .orderBy('id')
      .execute();
  }

  async function latestAuditId(): Promise<string | null> {
    const row = await getDb().selectFrom('audit').select('id').orderBy('id', 'desc').limit(1).executeTakeFirst();
    return row?.id ?? null;
  }

  async function auditSince(id: string | null) {
    return getDb()
      .selectFrom('audit')
      .select(['action', 'actor_id', 'subject_type', 'before', 'after'])
      .$if(id !== null, (query) => query.where('id', '>', id!))
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
    const admin = await seedStaff('admin@mail-route.test', 'admin');
    const investor = await seedStaff('investor@mail-route.test', 'investor');
    adminId = admin.id;
    adminCookie = admin.header;
    investorCookie = investor.header;
  }, 120_000);

  afterAll(closeDb);

  describe('a send that goes through', () => {
    it('hands each recipient the message, records the queue id, and audits once with no address', async () => {
      const ada = await account('Ada');
      const beth = await account('Beth');
      const before = await latestAuditId();
      const session = fakeSession();

      const response = await post(
        { recipients: [ada, beth], subject: 'Q3 is live', body: 'The report is up.', confirmCount: 2 },
        { open: session.opener },
      );

      expect(response.status).toBe(200);
      // `alreadyRetried` is empty and must be: a first send inserts its rows
      // unconditionally, so it always reaches everybody it resolved. Only a
      // retry can lose a claim after the count was typed (`MAIL-001/T6`).
      expect(await response.json()).toEqual({ accepted: [ada, beth], failed: [], alreadyRetried: [] });
      expect(session.handed).toHaveLength(2);

      const rows = await logRows();
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.state === 'accepted' && row.kind === 'bulk')).toBe(true);
      expect(rows.map((row) => row.queue_id)).toEqual(['queued as q-1', 'queued as q-2']);

      const audit = await auditSince(before);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: 'mail.send',
        actor_id: adminId,
        subject_type: 'mail',
        before: null,
        after: { subject: 'Q3 is live', recipient_count: 2 },
      });
      // The whole row, read as text: a send records that it happened and never
      // who it reached.
      expect(JSON.stringify(audit[0])).not.toContain('@');
    });

    it('opens one connection for the send and closes it at the end', async () => {
      const one = await account('One');
      const two = await account('Two');
      const three = await account('Three');
      const session = fakeSession();

      await post(
        { recipients: [one, two, three], subject: 'Three', body: 'body', confirmCount: 3 },
        { open: session.opener },
      );

      expect(session.opens()).toBe(1);
      expect(session.handed).toHaveLength(3);
      expect(session.closes()).toBe(1);
    });

    it('leaves a refused recipient failed, sends to the rest, and still closes the connection', async () => {
      const kept = await account('Kept');
      const refused = await account('Refused');
      const address = await getDb()
        .selectFrom('accounts')
        .select('email')
        .where('id', '=', refused)
        .executeTakeFirstOrThrow();
      const session = fakeSession([address.email]);

      const response = await post(
        { recipients: [kept, refused], subject: 'Partial', body: 'body', confirmCount: 2 },
        { open: session.opener },
      );

      expect(response.status).toBe(200);
      const answer = (await response.json()) as {
        accepted: string[];
        failed: { accountId: string; logId: string; error: string }[];
      };
      expect(answer.accepted).toEqual([kept]);
      expect(answer.failed).toHaveLength(1);
      expect(answer.failed[0]).toMatchObject({ accountId: refused, error: REFUSAL });
      // The row id travels back with the refusal, because it is what a retry
      // names (`MAIL-001/T6`): a person can fail twice under two different
      // sends, so an account id would not say which attempt is being tried
      // again.
      expect(Number(answer.failed[0]?.logId)).toBeGreaterThan(0);
      expect(session.closes()).toBe(1);

      const rows = await logRows();
      const failedRow = rows.find((row) => row.account_id === refused);
      expect(failedRow).toMatchObject({ state: 'failed', error: REFUSAL });
    });
  });

  describe('the count has to be typed, and has to be right', () => {
    it('refuses a count that is not the audience, writing nothing and opening nothing', async () => {
      const ada = await account('Count Ada');
      const beth = await account('Count Beth');
      const before = await latestAuditId();
      const rowsBefore = (await logRows()).length;
      const session = fakeSession();

      const response = await post(
        { recipients: [ada, beth], subject: 'Wrong count', body: 'body', confirmCount: 3 },
        { open: session.opener },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'count_mismatch', count: 2 });
      expect(session.opens()).toBe(0);
      expect((await logRows()).length).toBe(rowsBefore);
      expect(await auditSince(before)).toEqual([]);
    });

    it('refuses a field left empty, which reaches the route as zero', async () => {
      const one = await account('Zero One');
      const session = fakeSession();

      const response = await post(
        { recipients: [one], subject: 'Empty count', body: 'body', confirmCount: 0 },
        { open: session.opener },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'count_mismatch', count: 1 });
      expect(session.opens()).toBe(0);
    });
  });

  describe('the audience is re-resolved, and a change refuses the send', () => {
    it('refuses when somebody has been suspended since the list was confirmed', async () => {
      const kept = await account('Still Here');
      const gone = await account('Since Suspended');
      const before = await latestAuditId();
      const rowsBefore = (await logRows()).length;
      const session = fakeSession();

      await getDb().updateTable('accounts').set({ state: 'suspended' }).where('id', '=', gone).execute();

      const response = await post(
        { recipients: [kept, gone], subject: 'Changed', body: 'body', confirmCount: 2 },
        { open: session.opener },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: 'audience_changed',
        excluded: [{ id: gone, reason: 'suspended' }],
        missing: [],
      });
      // Nobody was mailed — not even the one who is still reachable.
      expect(session.opens()).toBe(0);
      expect((await logRows()).length).toBe(rowsBefore);
      expect(await auditSince(before)).toEqual([]);
    });

    it('refuses when somebody has unsubscribed since the list was confirmed', async () => {
      const kept = await account('Kept Two');
      const gone = await account('Since Unsubscribed');
      const session = fakeSession();

      await getDb()
        .insertInto('unsubscribes')
        .values({ account_id: gone, source: 'admin', reason: 'no longer interested' })
        .execute();

      const response = await post(
        { recipients: [kept, gone], subject: 'Changed', body: 'body', confirmCount: 2 },
        { open: session.opener },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: 'audience_changed',
        excluded: [{ id: gone, reason: 'unsubscribed' }],
        missing: [],
      });
      expect(session.opens()).toBe(0);
    });

    it('refuses when somebody has been erased since the list was confirmed', async () => {
      const kept = await account('Kept Three');
      const erased = await account('Since Erased');
      const session = fakeSession();

      await getDb().deleteFrom('accounts').where('id', '=', erased).execute();

      const response = await post(
        { recipients: [kept, erased], subject: 'Changed', body: 'body', confirmCount: 2 },
        { open: session.opener },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: 'audience_changed',
        excluded: [],
        missing: [erased],
      });
      expect(session.opens()).toBe(0);
    });
  });

  describe('when the port is unavailable', () => {
    it('refuses with the credential’s own reason, before the body is even read', async () => {
      const one = await account('Unavailable One');
      const before = await latestAuditId();
      const rowsBefore = (await logRows()).length;
      const session = fakeSession();

      const response = await post(
        { recipients: [one], subject: 'No credential', body: 'body', confirmCount: 1 },
        {
          open: session.opener,
          availability: async () => ({ available: false, reason: 'SMTP_URL is not set; ...' }),
        },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'mail_unavailable', detail: 'SMTP_URL is not set; ...' });
      expect(session.opens()).toBe(0);
      expect((await logRows()).length).toBe(rowsBefore);
      expect(await auditSince(before)).toEqual([]);
    });

    it('refuses naming the setting when an operator has turned sending off', async () => {
      const one = await account('Turned Off One');
      const session = fakeSession();

      const response = await post(
        { recipients: [one], subject: 'Turned off', body: 'body', confirmCount: 1 },
        { open: session.opener, availability: async () => ({ available: false, reason: TURNED_OFF }) },
      );

      expect(response.status).toBe(409);
      expect(((await response.json()) as { detail?: string }).detail).toBe(TURNED_OFF);
      expect(session.opens()).toBe(0);
    });

    it('refuses a credential no secured connection can be made from, writing nothing', async () => {
      // `config/index.ts` accepts any `smtps://` URL; the adapter is what knows
      // that implicit TLS on the STARTTLS port cannot complete a handshake. The
      // real opener runs here, and refuses before a row exists.
      const one = await account('Bad Credential Target');
      const rowsBefore = (await logRows()).length;
      const crossed = {
        available: true,
        url: new Secret('smtps://post:hunter2@mail.example.test:587'),
        from: MAIL.from,
      } as const;

      const response = await post(
        { recipients: [one], subject: 'Misconfigured', body: 'body', confirmCount: 1 },
        { open: openSmtpMailer, availability: async () => ({ available: true, mail: crossed }) },
      );

      expect(response.status).toBe(409);
      const answer = (await response.json()) as { error?: string; detail?: string };
      expect(answer.error).toBe('mail_unavailable');
      expect(answer.detail).toContain('SMTP_URL');
      // The reason names the contradiction and never the credential.
      expect(answer.detail).not.toContain('hunter2');
      expect((await logRows()).length).toBe(rowsBefore);
    });

    it('reads the setting the application is actually running on', async () => {
      // The only settings read in this file: the shared cache holds a value for
      // five seconds, so a second read here would be answering for the first.
      await getDb()
        .insertInto('config')
        .values({ key: 'mail.enabled', value: 'false', previous_value: 'true', changed_by: adminId })
        .execute();

      const answer = await sendingIsPossible();

      expect(answer.available).toBe(false);
      expect(answer.available ? '' : answer.reason).toBe(TURNED_OFF);
    });
  });

  describe('who may send', () => {
    it('answers an investor 404, writing nothing', async () => {
      const one = await account('Investor Target');
      const before = await latestAuditId();
      const rowsBefore = (await logRows()).length;

      const response = await post(
        { recipients: [one], subject: 'Theirs', body: 'body', confirmCount: 1 },
        { cookie: investorCookie },
      );

      expect(response.status).toBe(404);
      expect((await logRows()).length).toBe(rowsBefore);
      expect(await auditSince(before)).toEqual([]);
    });

    it('sends a caller with no session to sign in', async () => {
      const one = await account('No Session Target');

      const response = await handleSend(
        request({ recipients: [one], subject: 'Nobody', body: 'body', confirmCount: 1 }),
        fakeSession().opener,
        POSSIBLE,
      );

      expect(response.status).toBe(303);
    });

    it('refuses a cross-origin send before anything else', async () => {
      const one = await account('Cross Origin Target');
      const session = fakeSession();

      const response = await post(
        { recipients: [one], subject: 'Elsewhere', body: 'body', confirmCount: 1 },
        { origin: 'https://elsewhere.test', open: session.opener },
      );

      expect(response.status).toBe(403);
      expect(session.opens()).toBe(0);
    });

    it('is mounted on the route, gate and all', async () => {
      // The handler's own defaults are the production wiring, so this drives the
      // exported POST with nothing supplied and takes a refusal that lands before
      // the port is reached.
      const one = await account('Mounted Target');

      const response = await POST(
        request({ recipients: [one], subject: 'Mounted', body: 'body', confirmCount: 1 }, {
          cookie: investorCookie,
        }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('a request that is not one', () => {
    it('refuses a body that is not an object at all', async () => {
      for (const body of ['not json', [], 'null']) {
        const response = await post(body);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_request' });
      }
    });

    it('refuses a selection that is empty, malformed, or repeats somebody', async () => {
      const one = await account('Selection Checks');
      const refusal = { error: 'invalid_request', field: 'recipients' };

      for (const recipients of [
        [],
        ['nobody'],
        [one, 'nobody'],
        // A repeat resolves to one person, so the count typed would be for a
        // list nobody ticked.
        [one, one],
      ]) {
        const response = await post({ recipients, subject: 's', body: 'b', confirmCount: 1 });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual(refusal);
      }
    });

    it('refuses a blank or over-long subject, a blank body, and a count that is not a whole number', async () => {
      const one = await account('Field Checks');
      const base = { recipients: [one], subject: 's', body: 'b', confirmCount: 1 };

      expect(await (await post({ ...base, subject: '   ' })).json()).toEqual({
        error: 'invalid_request',
        field: 'subject',
      });
      expect(await (await post({ ...base, subject: 'x'.repeat(201) })).json()).toEqual({
        error: 'invalid_request',
        field: 'subject',
      });
      expect(await (await post({ ...base, body: '  \n ' })).json()).toEqual({
        error: 'invalid_request',
        field: 'body',
      });
      // A field typed by a person arrives as a string only if the browser sent
      // one; the route reads a number and refuses the rest rather than coercing.
      expect(await (await post({ ...base, confirmCount: '1' })).json()).toEqual({
        error: 'invalid_request',
        field: 'confirmCount',
      });
      expect(await (await post({ ...base, confirmCount: 1.5 })).json()).toEqual({
        error: 'invalid_request',
        field: 'confirmCount',
      });
    });
  });
});
