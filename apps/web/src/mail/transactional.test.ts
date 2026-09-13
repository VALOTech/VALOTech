/**
 * The messages one named person receives (`AUTH-003/T3`).
 *
 * Two claims, and they need different instruments. **What the message says** is
 * checked against the catalogue files themselves rather than against sentences
 * this suite also wrote — a test asserting its own copy of the English text
 * passes for a composer that ignores the locale entirely. **What the send
 * records** is checked against a real PostgreSQL on a database of its own,
 * because a row written before the hand-off and moved after it is a claim about
 * ordering that only a database can answer.
 *
 * The port is a fake throughout: `MAIL-001/T8` owns the wire, and what is under
 * test here is the composition and the record around it.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Secret } from '../config/index';
import { closeDb, getDb } from '../db/index';
import en from '../messages/en.json';
import vi from '../messages/vi.json';

import type { MailAvailability } from './availability';
import { compose, type Mailer, type Receipt } from './mailer';
import { resolveRecipients } from './recipients';
import { send } from './send';
import {
  deliverTransactional,
  invitationMessage,
  resetMessage,
  type Addressee,
  type SessionOpener,
} from './transactional';
import { stopInvestorMail } from './unsubscribe';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_mail_transactional';

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

const LINK = 'http://localhost:3100/invite/a-token-that-is-not-in-any-row';

function addressee(locale: Addressee['locale'], id = randomUUID()): Addressee {
  return { id, email: 'an.investor@example.test', name: 'Ada Lovelace', locale };
}

describe('what a transactional message says (AUTH-003/T3)', () => {
  it('writes the invitation in the language the account records', async () => {
    const message = await invitationMessage(addressee('vi'), 'The Founder', LINK);

    // Read from the catalogue, so this fails if the composer stops honouring the
    // locale — where a literal Vietnamese sentence here would pass for a
    // composer that had hard-coded it.
    expect(message.subject).toBe(vi.invitationMail.subject);
    expect(message.text).toContain('The Founder');
    expect(message.text).toContain('Ada Lovelace');
    expect(message.text).toContain(LINK);
  });

  it('writes it in English when nobody recorded a language', async () => {
    const message = await invitationMessage(addressee(null), 'The Founder', LINK);

    expect(message.subject).toBe(en.invitationMail.subject);
    expect(message.subject).not.toBe(vi.invitationMail.subject);
  });

  it('leaves no placeholder unresolved, in either language', async () => {
    for (const locale of ['en', 'vi'] as const) {
      const invitation = await invitationMessage(addressee(locale), 'The Founder', LINK);
      const reset = await resetMessage(addressee(locale), LINK);

      // A `{` surviving into a message is an ICU argument the composer did not
      // supply, which reaches the reader as `{name}` where their name should be.
      expect(invitation.text).not.toContain('{');
      expect(reset.text).not.toContain('{');
    }
  });

  it('resolves the plural in the expiry sentence rather than printing the rule', async () => {
    const invitation = await invitationMessage(addressee('en'), 'The Founder', LINK);
    const reset = await resetMessage(addressee('en'), LINK);

    expect(invitation.text).toContain('7 days');
    expect(reset.text).toContain('1 hour');
    expect(reset.text).not.toContain('1 hours');
  });

  it('puts the link on a line of its own, so a client that wraps cannot break it', async () => {
    const message = await resetMessage(addressee('en'), LINK);

    expect(message.text.split('\n\n')).toContain(LINK);
  });

  it('carries no tracking pixel and no rewritten link (DATA-R04)', async () => {
    const message = await invitationMessage(addressee('en'), 'The Founder', LINK);

    expect(message.html).not.toContain('<img');
    // The only URL in the message is the one the person opens: nothing wraps it
    // to count who clicked.
    expect(message.html.match(/http/g)).toHaveLength(1);
    expect(message.html).toContain(LINK);
  });

  it('escapes a name that would otherwise be read as markup', async () => {
    const message = await invitationMessage(
      { ...addressee('en'), name: '<script>alert(1)</script>' },
      'The Founder',
      LINK,
    );

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
    // The plain half is the author's text verbatim, which is what a plain-text
    // client shows and where markup is not markup.
    expect(message.text).toContain('<script>');
  });
});

describe.skipIf(!HAS_DATABASE)('what a transactional send records (AUTH-003/T3)', () => {
  const available: MailAvailability = {
    available: true,
    mail: {
      available: true,
      url: new Secret('smtps://valotech:secret@mail.example.test:465'),
      from: 'VALO Tech <investors@valotech.test>',
    },
  };

  function sessionOf(mailer: Mailer): SessionOpener {
    return () => ({ mailer, close: () => {} });
  }

  async function account(): Promise<Addressee> {
    const id = randomUUID();
    const email = `${id}@example.test`;
    await getDb()
      .insertInto('accounts')
      .values({ id, email, name: 'Ada Lovelace', role: 'investor', state: 'invited', locale: 'vi' })
      .execute();
    return { id, email, name: 'Ada Lovelace', locale: 'vi' };
  }

  async function rowsFor(accountId: string) {
    return getDb()
      .selectFrom('mail_log')
      .select(['subject', 'kind', 'state', 'queue_id', 'error', 'retry_of'])
      .where('account_id', '=', accountId)
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
      verbose: false,
    });
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it('records one transactional row, accepted, with the queue id the server gave', async () => {
    const person = await account();
    const message = await invitationMessage(person, 'The Founder', LINK);
    const mailer: Mailer = { async send(): Promise<Receipt> { return { queueId: 'q-transactional' }; } };

    const outcome = await deliverTransactional(person, message, sessionOf(mailer), async () => available);

    expect(outcome).toEqual({ state: 'accepted' });
    expect(await rowsFor(person.id)).toEqual([
      {
        subject: message.subject,
        // `transactional` and never `bulk`: an unsubscribe suppresses bulk and
        // must never suppress the message without which somebody cannot get in
        // (`MAIL-002/T3`).
        kind: 'transactional',
        state: 'accepted',
        queue_id: 'q-transactional',
        error: null,
        retry_of: null,
      },
    ]);
  });

  it('leaves the row failed with the server’s reply when the message is refused', async () => {
    const person = await account();
    const message = await resetMessage(person, LINK);
    const mailer: Mailer = {
      async send(): Promise<Receipt> {
        throw new Error('550 5.1.1 mailbox unavailable');
      },
    };

    const outcome = await deliverTransactional(person, message, sessionOf(mailer), async () => available);

    expect(outcome).toMatchObject({ state: 'failed' });
    expect((await rowsFor(person.id))[0]).toMatchObject({
      state: 'failed',
      error: '550 5.1.1 mailbox unavailable',
      queue_id: null,
    });
  });

  it('scrubs an address and a credential out of a refusal before storing it', async () => {
    const person = await account();
    const message = await resetMessage(person, LINK);
    const mailer: Mailer = {
      async send(): Promise<Receipt> {
        // The two things an SMTP failure really does echo: the address it
        // refused, and — on a TLS or auth failure — the credential it was given.
        throw new Error(`550 no mailbox for ${person.email} via smtps://valotech:secret@mail.example.test:465`);
      },
    };

    await deliverTransactional(person, message, sessionOf(mailer), async () => available);

    const stored = (await rowsFor(person.id))[0]?.error ?? '';
    expect(stored).not.toContain(person.email);
    expect(stored).not.toContain('secret');
    expect(stored).toContain('550');
  });

  it('attempts nothing and writes nothing when there is no credential', async () => {
    const person = await account();
    const message = await invitationMessage(person, 'The Founder', LINK);
    let opened = false;

    const outcome = await deliverTransactional(
      person,
      message,
      () => {
        opened = true;
        throw new Error('a connection should never have been opened');
      },
      async () => ({ available: false, reason: 'SMTP_URL is not set' }),
    );

    // No row, because nothing was attempted: a `queued` row here would say an
    // attempt was made, and a `failed` one would say a mail server refused.
    expect(outcome).toEqual({ state: 'unavailable', reason: 'SMTP_URL is not set' });
    expect(opened).toBe(false);
    expect(await rowsFor(person.id)).toEqual([]);
  });

  it('hands the port the exact bytes the message was composed to', async () => {
    const person = await account();
    const message = await invitationMessage(person, 'The Founder', LINK);
    const handed: string[] = [];
    const mailer: Mailer = {
      async send(to: string, subject: string, text: string, html: string): Promise<Receipt> {
        handed.push(to, subject, text, html);
        return { queueId: 'q-bytes' };
      },
    };

    await deliverTransactional(person, message, sessionOf(mailer), async () => available);

    // The preview and the send are one rendering (`MAIL-001/T1`): what is handed
    // over is the composed value and not a second rendering of the same source.
    expect(handed).toEqual([person.email, message.subject, message.text, message.html]);
  });

  /**
   * The split `MAIL-002/T3` turns on, asserted on **one** account so the two
   * answers cannot come from two different states of the world: the same person,
   * unsubscribed, reached by a transactional message and not reached by a bulk
   * one.
   *
   * `kind` is what enforces it, and it is set at the send: `deliverTransactional`
   * writes `transactional` and never reads the list; `resolveRecipients` reads
   * the list and is the only thing a bulk send resolves its audience through. A
   * suppression check added to the transactional path would make the first half
   * of this fail.
   */
  it('never suppresses a transactional message, and suppresses the bulk one (MAIL-002/T3)', async () => {
    const person = await account();
    const sender = await getDb()
      .insertInto('accounts')
      .values({
        email: `${randomUUID()}@example.test`,
        name: 'An Admin',
        role: 'admin',
        state: 'active',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await stopInvestorMail({ by: 'person', accountId: person.id });

    const reset = await resetMessage(person, LINK);
    const mailer: Mailer = {
      async send(): Promise<Receipt> {
        return { queueId: 'q-not-suppressed' };
      },
    };

    expect(await deliverTransactional(person, reset, sessionOf(mailer), async () => available)).toEqual({
      state: 'accepted',
    });

    const audience = await resolveRecipients([person.id]);
    expect(audience.recipients).toEqual([]);
    expect(audience.excluded).toEqual([{ id: person.id, name: person.name, reason: 'unsubscribed' }]);

    const handed: string[] = [];
    const bulk: Mailer = {
      async send(to: string): Promise<Receipt> {
        handed.push(to);
        return { queueId: 'q-bulk' };
      },
    };
    await send(audience.recipients, compose('A quarterly note', 'Hello.'), bulk, sender.id);

    expect(handed).toEqual([]);
    // One row for this person, and it is the transactional one. No bulk row was
    // written, because a bulk send never resolved them as a recipient.
    expect(await rowsFor(person.id)).toEqual([
      {
        subject: reset.subject,
        kind: 'transactional',
        state: 'accepted',
        queue_id: 'q-not-suppressed',
        error: null,
        retry_of: null,
      },
    ]);
  });
});
