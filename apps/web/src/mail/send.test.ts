/**
 * The send loop (`MAIL-001/T5`).
 *
 * These are claims about what the database holds at each step of a send, so they
 * run against a real PostgreSQL — on a database of their own, so the `mail_log`
 * rows the suite reasons about are only the ones it wrote. The port is a fake,
 * because the one thing under test is the orchestration around it: that a row
 * exists for every recipient before any message leaves, and that a refusal stops
 * one recipient rather than the send. The SMTP adapter behind the port is
 * `MAIL-001/T8`.
 *
 * Most of the fakes' reply text carries no address, so nothing here suggests one
 * would be welcome in a column kept for two years (`DATA-R02`), and the audit
 * assertions read the whole row and look for an `@` in it: the trail records that
 * a send happened and never who it reached. One test does the opposite on
 * purpose — it refuses with a reply that names an address and a credential and
 * asserts the stored row holds neither — because a scrubber is only proven by the
 * leak it is handed.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';

import { type Mailer, type Receipt, compose } from './mailer';
import { type Recipient, resolveRecipients } from './recipients';
import { send } from './send';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_mail_send';

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

/** What the port was handed, so the test can check the bytes as well as the order. */
interface HandedMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

interface FakeMailer extends Mailer {
  readonly handed: readonly HandedMessage[];
}

/** An SMTP-shaped refusal, with no address in it — the reply is what the row records. */
const REFUSAL = '550 5.1.1 mailbox unavailable';

/**
 * A port that answers from memory: it remembers every message handed to it,
 * refuses the addresses it was told to refuse, and can be asked to look at the
 * database at the moment of each hand-off — which is how a test sees the state
 * the rows were in *before* a message went, rather than only what they ended as.
 */
function fakeMailer(options: { refuse?: readonly string[]; observe?: () => Promise<void> } = {}): FakeMailer {
  const refuse = new Set(options.refuse ?? []);
  const handed: HandedMessage[] = [];

  return {
    handed,
    async send(to: string, subject: string, text: string, html: string): Promise<Receipt> {
      if (options.observe !== undefined) {
        await options.observe();
      }
      handed.push({ to, subject, text, html });
      if (refuse.has(to)) {
        throw new Error(REFUSAL);
      }
      return { queueId: `q-${handed.length}` };
    },
  };
}

interface SequenceMailer extends Mailer {
  readonly events: readonly string[];
}

/**
 * A port that yields to the event loop inside each hand-off and records when it
 * entered and when it left. A caller that batched the sends would have its calls
 * overlap, and the overlap is visible here as two `enter`s with no `exit`
 * between them.
 */
function sequenceMailer(): SequenceMailer {
  const events: string[] = [];

  return {
    events,
    async send(to: string): Promise<Receipt> {
      events.push(`enter ${to}`);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      events.push(`exit ${to}`);
      return { queueId: `q-${events.length}` };
    },
  };
}

describe.skipIf(!HAS_DATABASE)('the send loop (MAIL-001/T5)', () => {
  const message = compose('A note for the room', 'Hello.\n\nThe quarter closed well.');

  async function account(name: string): Promise<string> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email: `${randomUUID()}@example.test`, name, role: 'investor', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** Three active accounts, named so `resolveRecipients` returns them in this order. */
  async function threeRecipients(): Promise<[Recipient, Recipient, Recipient]> {
    const ids = [await account('A First'), await account('B Second'), await account('C Third')];
    const [first, second, third] = (await resolveRecipients(ids)).recipients;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('the three accounts did not resolve as three recipients');
    }
    return [first, second, third];
  }

  /** One account's log rows, oldest first — an attempt is a row of its own. */
  async function logRows(accountId: string) {
    return getDb()
      .selectFrom('mail_log')
      .select(['account_id', 'subject', 'kind', 'state', 'queue_id', 'error'])
      .where('account_id', '=', accountId)
      .orderBy('id')
      .execute();
  }

  /** Every log state for these recipients, in recipient order then row order. */
  async function statesOf(recipients: readonly Recipient[]): Promise<string[]> {
    const states: string[] = [];
    for (const recipient of recipients) {
      states.push(...(await logRows(recipient.id)).map((row) => row.state));
    }
    return states;
  }

  async function auditRows(actorId: string) {
    return getDb().selectFrom('audit').selectAll().where('actor_id', '=', actorId).orderBy('id').execute();
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

  it('writes a bulk row per recipient and moves each to accepted with its queue id', async () => {
    const recipients = await threeRecipients();
    const mailer = fakeMailer();

    const outcome = await send(recipients, message, mailer, randomUUID());

    expect(outcome.results).toEqual(
      recipients.map((recipient, index) => ({
        accountId: recipient.id,
        logId: expect.any(String),
        state: 'accepted',
        queueId: `q-${index + 1}`,
      })),
    );

    expect(mailer.handed).toEqual(
      recipients.map((recipient) => ({
        to: recipient.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })),
    );

    for (const [index, recipient] of recipients.entries()) {
      expect(await logRows(recipient.id)).toEqual([
        {
          account_id: recipient.id,
          subject: message.subject,
          kind: 'bulk',
          state: 'accepted',
          queue_id: `q-${index + 1}`,
          error: null,
        },
      ]);
    }
  });

  it('writes every row queued before the first hand-off, and moves each one as it goes', async () => {
    const recipients = await threeRecipients();
    const snapshots: string[][] = [];
    const mailer = fakeMailer({
      observe: async () => {
        snapshots.push(await statesOf(recipients));
      },
    });

    await send(recipients, message, mailer, randomUUID());

    // Read from another connection, so a send held open in one transaction would
    // show nothing at all rather than three queued rows.
    expect(snapshots).toEqual([
      ['queued', 'queued', 'queued'],
      ['accepted', 'queued', 'queued'],
      ['accepted', 'accepted', 'queued'],
    ]);
  });

  it('leaves a refused recipient failed with the reply text, and keeps sending the rest', async () => {
    const recipients = await threeRecipients();
    const [first, second, third] = recipients;
    const mailer = fakeMailer({ refuse: [second.email] });

    const outcome = await send(recipients, message, mailer, randomUUID());

    // A loop that stopped at the refusal would never reach the third recipient.
    expect(mailer.handed.map((handed) => handed.to)).toEqual(recipients.map((recipient) => recipient.email));

    expect(outcome.results).toEqual([
      { accountId: first.id, logId: expect.any(String), state: 'accepted', queueId: 'q-1' },
      { accountId: second.id, logId: expect.any(String), state: 'failed', error: REFUSAL },
      { accountId: third.id, logId: expect.any(String), state: 'accepted', queueId: 'q-3' },
    ]);

    // The first recipient's acceptance stands after the later refusal: the send is
    // not one transaction, so nothing rolls back the record of what already went.
    const common = { subject: message.subject, kind: 'bulk' };
    expect(await logRows(first.id)).toEqual([
      { ...common, account_id: first.id, state: 'accepted', queue_id: 'q-1', error: null },
    ]);
    expect(await logRows(second.id)).toEqual([
      { ...common, account_id: second.id, state: 'failed', queue_id: null, error: REFUSAL },
    ]);
    expect(await logRows(third.id)).toEqual([
      { ...common, account_id: third.id, state: 'accepted', queue_id: 'q-3', error: null },
    ]);

    expect(JSON.stringify(await logRows(second.id))).not.toContain('@');
  });

  it('records every row failed and raises nothing when the port refuses all of them', async () => {
    const recipients = await threeRecipients();
    const mailer = fakeMailer({ refuse: recipients.map((recipient) => recipient.email) });

    const outcome = await send(recipients, message, mailer, randomUUID());

    expect(outcome.results.map((result) => result.state)).toEqual(['failed', 'failed', 'failed']);
    expect(await statesOf(recipients)).toEqual(['failed', 'failed', 'failed']);
  });

  it('records one mail.send carrying the subject and the count, and no address', async () => {
    const recipients = await threeRecipients();
    const actor = randomUUID();

    await send(recipients, message, fakeMailer(), actor);

    const rows = await auditRows(actor);
    expect(rows).toEqual([
      {
        id: expect.any(String),
        at: expect.any(Date),
        actor_id: actor,
        action: 'mail.send',
        subject_type: 'mail',
        subject_id: null,
        // A send replaces nothing, so there is no `before` side to it; what the
        // trail holds is what went out and to how many people, which is the
        // allow-list's whole entry for this action (`SEC-DEC-01`). Who received
        // it is the `mail_log` row's, erased with the account.
        before: null,
        after: { subject: message.subject, recipient_count: recipients.length },
      },
    ]);

    const serialized = JSON.stringify(rows);
    for (const recipient of recipients) {
      expect(serialized).not.toContain(recipient.email);
    }
    expect(serialized).not.toContain('@');
  });

  it('hands the messages over one at a time rather than in a batch', async () => {
    const recipients = await threeRecipients();
    const mailer = sequenceMailer();

    await send(recipients, message, mailer, randomUUID());

    expect(mailer.events).toEqual(
      recipients.flatMap((recipient) => [`enter ${recipient.email}`, `exit ${recipient.email}`]),
    );
  });

  it('sends nothing and records nothing for a send to nobody', async () => {
    const actor = randomUUID();
    const mailer = fakeMailer();

    expect(await send([], message, mailer, actor)).toEqual({ results: [] });
    expect(mailer.handed).toEqual([]);
    expect(await auditRows(actor)).toEqual([]);
  });

  it('masks an address and a credential out of a stored refusal, and keeps the reply', async () => {
    const [recipient] = await threeRecipients();
    // A refusal whose reply names the recipient's address and a long credential
    // token — the two shapes DATA-R02 forbids in a column kept for two years.
    const token = 'AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKK'; // 43 base64url chars
    const mailer: Mailer = {
      async send(): Promise<Receipt> {
        throw new Error(`535 5.7.8 auth failed ${token} sending to ${recipient.email}`);
      },
    };

    const outcome = await send([recipient], message, mailer, randomUUID());

    expect(outcome.results[0]?.state).toBe('failed');
    const stored = (await logRows(recipient.id))[0]?.error ?? '';
    // The address and the credential are gone; the code the operator needs stays.
    expect(stored).not.toContain('@');
    expect(stored).not.toContain(recipient.email);
    expect(stored).not.toContain(token);
    expect(stored).toContain('535');
    expect(stored).toContain('[redacted]');
  });

  it('caps a verbose refusal so it cannot fill a two-year column', async () => {
    const [recipient] = await threeRecipients();
    // Long, but no single run of forty base64url characters, so the scrubber
    // leaves it and the cap is the only thing that can bound it.
    const mailer: Mailer = {
      async send(): Promise<Receipt> {
        throw new Error('no relay here '.repeat(60));
      },
    };

    await send([recipient], message, mailer, randomUUID());

    const stored = (await logRows(recipient.id))[0]?.error ?? '';
    expect(stored.length).toBeLessThanOrEqual(503); // 500, then the truncation mark
    expect(stored.endsWith('...')).toBe(true);
  });

  it('names a refusal that carries no reply rather than storing a blank one', async () => {
    const [recipient] = await threeRecipients();
    const mailer: Mailer = {
      async send(): Promise<Receipt> {
        throw new Error('');
      },
    };

    await send([recipient], message, mailer, randomUUID());

    expect((await logRows(recipient.id))[0]?.error).toBe('the port refused without a reason');
  });
});
