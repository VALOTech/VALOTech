/**
 * A registration against a real PostgreSQL (`AUTH-005/T1`, `AUTH-005/T2`).
 *
 * Three properties here cannot be checked anywhere but a database.
 *
 * **That the row is the row an invitation writes.** The design's whole claim is
 * that no second account state, no second table and no second token kind exist,
 * and that is a statement about columns — so it is read back from the catalogue's
 * own row and compared field by field against one `inviteAccount` produced,
 * rather than asserted against the values this file just passed in.
 *
 * **That the same statements run whatever the address is.** That is a claim about
 * what reaches the server, so it is measured at the server: a statement-level
 * trigger fires once per statement whether or not the statement touched a row,
 * which makes "the invitation insert ran even though nothing was inserted" an
 * assertion rather than a reading of the source. A clock is the weaker instrument
 * for the same claim — it answers differently on a loaded machine, and the load
 * it would take to average out would time a sibling suite out.
 *
 * **That two registrations for one address produce one account.** Two requests
 * meeting at an address is what an advisory lock and a unique index exist for,
 * and a suite that ran them in one process against a stub would assert the stub.
 *
 * On a database of its own, because the rows are this suite's and the statement
 * counter would count a sibling's.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import type { ComposedMessage } from '../mail/mailer';
import type { Addressee, Deliver } from '../mail/transactional';
import en from '../messages/en.json';
import vi from '../messages/vi.json';

import {
  inviteAccount,
  issueToken,
  registerAccount,
  setPasswordWithToken,
  tokenIsLive,
  INVITATION_TTL_SECONDS,
} from './invitation';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_registration';

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

/** What was handed to the port, so the two messages can be told apart. */
interface Sent {
  readonly to: string;
  readonly message: ComposedMessage;
}

function recording(): Deliver & { readonly sent: Sent[] } {
  const sent: Sent[] = [];
  const deliver = async (
    addressee: Addressee,
    message: ComposedMessage,
  ): Promise<{ state: 'accepted' }> => {
    sent.push({ to: addressee.email, message });
    return { state: 'accepted' };
  };

  return Object.assign(deliver as Deliver, { sent });
}

describe.skipIf(!HAS_DATABASE)('registerAccount (AUTH-005)', () => {
  function freshAddress(): string {
    return `register-${randomUUID()}@example.test`;
  }

  /** The statements `invitations` saw, counted at the server rather than inferred. */
  async function invitationStatements(): Promise<number> {
    const row = await sql<{ n: string }>`select n from registration_probe`.execute(getDb());
    return Number(row.rows[0]?.n ?? 0);
  }

  async function resetStatements(): Promise<void> {
    await sql`update registration_probe set n = 0`.execute(getDb());
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

    await sql`create table registration_probe (n bigint not null)`.execute(getDb());
    await sql`insert into registration_probe values (0)`.execute(getDb());
    await sql`
      create function registration_probe_count() returns trigger as $$
      begin
        update registration_probe set n = n + 1;
        return null;
      end;
      $$ language plpgsql`.execute(getDb());

    // Statement-level, which is the instrument the claim needs: a registration
    // for an address an account already holds must still run its insert, and a
    // row-level trigger says nothing at all about a statement that wrote no row.
    await sql`
      create trigger registration_probe_insert after insert on invitations
      for each statement execute function registration_probe_count()`.execute(getDb());
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await resetStatements();
  });

  describe('the row a registration writes', () => {
    it('writes the row an invitation writes, and one field more', async () => {
      const registered = freshAddress();
      const invited = freshAddress();

      await registerAccount({ name: 'A Prospect', email: registered, locale: 'en' });
      await inviteAccount(
        { name: 'An Investor', email: invited, role: 'investor', locale: 'en' },
        (
          await getDb()
            .insertInto('accounts')
            .values({ email: freshAddress(), name: 'An Admin', role: 'admin', state: 'active' })
            .returning('id')
            .executeTakeFirstOrThrow()
        ).id,
        recording(),
      );

      const columns = ['role', 'state', 'password_hash', 'locale', 'investor_type'] as const;
      const [self, byInvitation] = await Promise.all([
        getDb().selectFrom('accounts').select(columns).where('email', '=', registered).executeTakeFirstOrThrow(),
        getDb().selectFrom('accounts').select(columns).where('email', '=', invited).executeTakeFirstOrThrow(),
      ]);

      // Read back from the catalogue rather than asserted against what was
      // passed in: the claim is that the two rows agree, and the only field that
      // may differ is the one that records how the person arrived.
      expect({ ...self, investor_type: byInvitation.investor_type }).toEqual(byInvitation);
      expect(self.investor_type).toBe('prospect');
      expect(self.role).toBe('investor');
      expect(self.state).toBe('invited');
      expect(self.password_hash).toBeNull();
    });

    it('mints a live token the set-password path activates, with no second token kind', async () => {
      const email = freshAddress();
      const deliver = recording();

      await (await registerAccount({ name: 'A Prospect', email, locale: 'en' })).send(deliver);

      const account = await getDb()
        .selectFrom('accounts')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirstOrThrow();
      const rows = await getDb()
        .selectFrom('invitations')
        .select(['account_id', 'consumed_at', 'expires_at'])
        .where('account_id', '=', account.id)
        .execute();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.consumed_at).toBeNull();

      // Seven days, the invitation's own window — not a third constant.
      const seconds = (rows[0]!.expires_at.getTime() - Date.now()) / 1000;
      expect(seconds).toBeGreaterThan(INVITATION_TTL_SECONDS - 120);
      expect(seconds).toBeLessThanOrEqual(INVITATION_TTL_SECONDS);

      const link = deliver.sent[0]?.message.text.match(/\/invite\/(\S+)/)?.[1] ?? '';
      expect(await tokenIsLive(link)).toBe(true);

      const outcome = await setPasswordWithToken(link, 'not-a-real-hash');
      expect(outcome).toEqual({ kind: 'set', accountId: account.id });
      expect(
        (
          await getDb()
            .selectFrom('accounts')
            .select('state')
            .where('id', '=', account.id)
            .executeTakeFirstOrThrow()
        ).state,
      ).toBe('active');
    });

    it('writes the name and the address and nothing else a form could supply', async () => {
      const email = freshAddress();
      await registerAccount({ name: '  A Prospect  ', email, locale: 'vi' });

      const row = await getDb()
        .selectFrom('accounts')
        .selectAll()
        .where('email', '=', email)
        .executeTakeFirstOrThrow();

      expect(row.name).toBe('A Prospect');
      expect(row.locale).toBe('vi');
      expect(row.last_sign_in).toBeNull();
      expect(row.read_tracking_objected).toBe(false);
    });

    it('records no audit row, because nobody reached into anybody else s access', async () => {
      const before = await getDb()
        .selectFrom('audit')
        .select(({ fn }) => fn.countAll().as('n'))
        .executeTakeFirstOrThrow();

      await registerAccount({ name: 'A Prospect', email: freshAddress(), locale: 'en' });

      const after = await getDb()
        .selectFrom('audit')
        .select(({ fn }) => fn.countAll().as('n'))
        .executeTakeFirstOrThrow();

      // A row written only when the address was free is the existence oracle
      // moved into the trail, and a self-service act is nobody else's access.
      expect(Number(after.n)).toBe(Number(before.n));
    });
  });

  describe('an address an account already holds', () => {
    async function existing(state: 'invited' | 'active' | 'suspended'): Promise<string> {
      const email = freshAddress();
      await getDb()
        .insertInto('accounts')
        .values({
          email,
          name: 'Already Here',
          role: 'investor',
          state,
          password_hash: state === 'active' ? 'not-a-real-hash' : null,
        })
        .execute();
      return email;
    }

    it('writes no second row, whatever state the first one is in', async () => {
      for (const state of ['invited', 'active', 'suspended'] as const) {
        const email = await existing(state);

        await registerAccount({ name: 'Somebody Else', email, locale: 'en' });

        const rows = await getDb()
          .selectFrom('accounts')
          .select(['name', 'state', 'investor_type'])
          .where('email', '=', email)
          .execute();

        // One row, and not one this registration touched: DO UPDATE would have
        // let an anonymous post rename an account somebody else holds.
        expect({ state, rows }).toEqual({
          state,
          rows: [{ name: 'Already Here', state, investor_type: null }],
        });
      }
    });

    it('mints no token, so a link somebody is waiting on is not destroyed', async () => {
      const email = await existing('invited');
      const account = await getDb()
        .selectFrom('accounts')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirstOrThrow();
      const waiting = await issueToken(account.id, INVITATION_TTL_SECONDS);

      await registerAccount({ name: 'Somebody Else', email, locale: 'en' });

      // The denial of access an anonymous caller could otherwise aim at a named
      // investor: register their address and the admin's link stops working.
      expect(await tokenIsLive(waiting)).toBe(true);
      expect(
        await getDb()
          .selectFrom('invitations')
          .select('id')
          .where('account_id', '=', account.id)
          .execute(),
      ).toHaveLength(1);
    });

    it('sends the message that says so, and never a link that sets a password', async () => {
      const email = await existing('active');
      const deliver = recording();

      await (await registerAccount({ name: 'Somebody Else', email, locale: 'en' })).send(deliver);

      expect(deliver.sent).toHaveLength(1);
      const message = deliver.sent[0]!.message;
      expect(message.subject).toBe(en.registrationExistsMail.subject);
      expect(message.text).toContain(`${ORIGIN}/sign-in`);
      expect(message.text).not.toContain('/invite/');
      expect(message.text).not.toContain('/reset/');
    });

    it('writes to the account holder in the language the account holds', async () => {
      const email = freshAddress();
      await getDb()
        .insertInto('accounts')
        .values({ email, name: 'Already Here', role: 'investor', state: 'active', locale: 'vi' })
        .execute();
      const deliver = recording();

      // The registrant read the gateway in English; the person this reaches was
      // written to in Vietnamese already.
      await (await registerAccount({ name: 'Somebody Else', email, locale: 'en' })).send(deliver);

      expect(deliver.sent[0]?.message.subject).toBe(vi.registrationExistsMail.subject);
    });
  });

  describe('the answer says nothing about the address (SEC-R03)', () => {
    it('runs the same statements against invitations either way', async () => {
      const taken = freshAddress();
      await getDb()
        .insertInto('accounts')
        .values({ email: taken, name: 'Already Here', role: 'investor', state: 'active' })
        .execute();

      await resetStatements();
      await registerAccount({ name: 'A Prospect', email: freshAddress(), locale: 'en' });
      const forNewAddress = await invitationStatements();

      await resetStatements();
      await registerAccount({ name: 'A Prospect', email: taken, locale: 'en' });
      const forTakenAddress = await invitationStatements();

      // A lookup followed by a conditional insert would read as 1 and 0 here:
      // the branch a timing measurement reads, made visible at the server.
      expect({ forNewAddress, forTakenAddress }).toEqual({ forNewAddress: 1, forTakenAddress: 1 });
    });

    it('sends a message in both cases, so the mailbox is the only thing that differs', async () => {
      const taken = freshAddress();
      await getDb()
        .insertInto('accounts')
        .values({ email: taken, name: 'Already Here', role: 'investor', state: 'active' })
        .execute();

      const forNew = recording();
      const forTaken = recording();
      await (await registerAccount({ name: 'A Prospect', email: freshAddress(), locale: 'en' })).send(forNew);
      await (await registerAccount({ name: 'A Prospect', email: taken, locale: 'en' })).send(forTaken);

      expect(forNew.sent).toHaveLength(1);
      expect(forTaken.sent).toHaveLength(1);
      expect(forNew.sent[0]?.message.subject).not.toBe(forTaken.sent[0]?.message.subject);
    });

    it('does nothing at all with an address longer than one can be', async () => {
      const before = await getDb()
        .selectFrom('accounts')
        .select(({ fn }) => fn.countAll().as('n'))
        .executeTakeFirstOrThrow();

      const delivery = await registerAccount({
        name: 'A Prospect',
        email: `${'a'.repeat(300)}@example.test`,
        locale: 'en',
      });

      expect(await delivery.send(recording())).toBeNull();
      expect(
        Number(
          (
            await getDb()
              .selectFrom('accounts')
              .select(({ fn }) => fn.countAll().as('n'))
              .executeTakeFirstOrThrow()
          ).n,
        ),
      ).toBe(Number(before.n));
    });
  });

  describe('two registrations meeting at one address', () => {
    it('produces one account and one token, not two', async () => {
      const email = freshAddress();

      const [a, b] = await Promise.all([
        registerAccount({ name: 'First', email, locale: 'en' }),
        registerAccount({ name: 'Second', email, locale: 'en' }),
      ]);

      const accounts = await getDb()
        .selectFrom('accounts')
        .select('id')
        .where('email', '=', email)
        .execute();
      expect(accounts).toHaveLength(1);

      const tokens = await getDb()
        .selectFrom('invitations')
        .select('id')
        .where('account_id', '=', accounts[0]!.id)
        .execute();
      expect(tokens).toHaveLength(1);

      // Both answer, and exactly one of them carries the link: the other is the
      // message that says an account already uses the address.
      const sent = recording();
      await a.send(sent);
      await b.send(sent);
      expect(sent.sent.filter((one) => one.message.text.includes('/invite/'))).toHaveLength(1);
    });

    it('folds case and whitespace, so one address is one account', async () => {
      const email = freshAddress();

      await registerAccount({ name: 'First', email, locale: 'en' });
      await registerAccount({ name: 'Second', email: `  ${email.toUpperCase()}\n`, locale: 'en' });

      expect(
        await getDb().selectFrom('accounts').select('id').where('email', '=', email).execute(),
      ).toHaveLength(1);
    });
  });
});
