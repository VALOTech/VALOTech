/**
 * The settings screen's read and its two routes, against a real PostgreSQL
 * (`CFG-001/T8`).
 *
 * The store beneath this was closed and proven before any of it existed, and
 * nothing reached it: no page, neither route, and no caller for `getSettings`,
 * `changeSetting` or `revertSetting`. So what this suite pins is the surface.
 *
 * **The list is the registry, not the table.** A key nobody has changed still
 * appears, showing the default the application actually reads — the setting an
 * operator needs at three in the morning is usually the one nobody has touched.
 *
 * **A refused value is refused with its reason and nothing is written.** Silent
 * clamping is how a setting comes to disagree with what the screen says
 * (`CFG-001/T2`), so the suite checks the value in force after a refusal as well
 * as the status.
 *
 * **Reverting is one step back, and twice returns.** There is no undo stack, and
 * a key that has never changed has nothing to go back to.
 *
 * On a database of its own: `config` is keyed by the setting name, so two suites
 * sharing a database would be writing the same three rows.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { issue } from '../../../auth/session';
import { settingsForConsole } from '../../../config/settings';
import { closeDb, getDb } from '../../../db/index';

import { PUT } from './[key]/route';
import { POST as REVERT } from './[key]/revert/route';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_config_console';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'migrations');

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

function call(
  handler: (request: Request, context: { params: Promise<{ key: string }> }) => Promise<Response>,
  method: 'PUT' | 'POST',
  key: string,
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

  return handler(
    new Request(`${ORIGIN}/admin/config/${key}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ key }) },
  );
}

describe.skipIf(!HAS_DATABASE)('CFG-001/T8 — the settings surface', () => {
  let adminId: string;
  let adminCookie: string;
  let investorCookie: string;

  async function seed(email: string, role: 'admin' | 'investor') {
    const account = await getDb()
      .insertInto('accounts')
      .values({ email, name: role, role, state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const cookie = await issue(account.id);

    return { id: account.id, header: `${cookie.name}=${cookie.value}` };
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
    const admin = await seed('admin@config-console.test', 'admin');
    const investor = await seed('investor@config-console.test', 'investor');
    adminId = admin.id;
    adminCookie = admin.header;
    investorCookie = investor.header;
  }, 120_000);

  afterAll(closeDb);

  beforeEach(async () => {
    await getDb().deleteFrom('config').execute();
  });

  /** One setting as the console shows it. */
  async function shown(key: string) {
    return (await settingsForConsole()).find((setting) => setting.key === key);
  }

  const change = (key: string, value: string, cookie = adminCookie) =>
    call(PUT, 'PUT', key, { value }, { cookie });

  describe('what the console lists', () => {
    it('lists every declared key, including the ones nobody has changed', async () => {
      const settings = await settingsForConsole();

      expect(settings.map((setting) => setting.key)).toEqual([
        'hall.banner',
        'hall.signin_message',
        'mail.enabled',
        'privacy.contact',
      ]);
      // The defaults are what the application reads, so they are what the screen
      // shows for a key with no row. The contact's default is an address the
      // company already publishes, so the privacy notice names somewhere real
      // before anybody sets anything (`LEGAL-SG-001/T1`).
      expect(settings.map((setting) => setting.value)).toEqual([
        '',
        '',
        'true',
        'hello@valotech.org',
      ]);
      expect(settings.every((setting) => setting.previousValue === null)).toBe(true);
      expect(settings.every((setting) => setting.changedAt === null)).toBe(true);
      expect(settings.every((setting) => setting.what !== '')).toBe(true);
    });

    it('shows what is in force, what a revert would restore, and who moved it', async () => {
      await change('hall.banner', 'We are raising');

      expect(await shown('hall.banner')).toMatchObject({
        value: 'We are raising',
        fallback: '',
        // The first change's previous value is the declared default, so reverting
        // it restores the default rather than nothing.
        previousValue: '',
        changedBy: 'admin',
      });
      expect((await shown('hall.banner'))?.changedAt).not.toBeNull();
    });

    it('keeps a setting listed after the account that changed it is erased, naming nobody', async () => {
      const other = await seed('erased@config-console.test', 'admin');
      await change('hall.banner', 'Theirs', other.header);

      await getDb().deleteFrom('accounts').where('id', '=', other.id).execute();

      expect(await shown('hall.banner')).toMatchObject({ value: 'Theirs', changedBy: null });
    });
  });

  describe('changing', () => {
    it('stores a value and answers with what was stored', async () => {
      const response = await change('mail.enabled', 'false');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ key: 'mail.enabled', value: 'false' });
      expect((await shown('mail.enabled'))?.value).toBe('false');
    });

    it('refuses a value outside the key’s type with the reason, changing nothing', async () => {
      const response = await change('mail.enabled', 'off');

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string; detail?: string };
      expect(body.error).toBe('refused');
      expect(body.detail).toContain('true or false');
      // Not clamped to a default, not stored: what is in force is untouched.
      expect((await shown('mail.enabled'))?.value).toBe('true');
    });

    it('refuses a text value past its bound with the bound, changing nothing', async () => {
      const response = await change('hall.banner', 'x'.repeat(281));

      expect(response.status).toBe(400);
      expect(((await response.json()) as { detail?: string }).detail).toContain('280');
      expect((await shown('hall.banner'))?.value).toBe('');
    });

    it('answers 404 for a key the registry does not declare', async () => {
      const response = await change('hall.colour', 'blue');

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'unknown_key' });
    });

    it('answers 404 for a secret-shaped key, which is never a setting', async () => {
      const response = await change('mail.smtp_password', 'hunter2');

      expect(response.status).toBe(404);
    });

    it('refuses a body with no string value', async () => {
      for (const body of [{}, { value: 3 }, { value: null }, 'not json at all']) {
        const response = await call(PUT, 'PUT', 'hall.banner', body, { cookie: adminCookie });

        expect(response.status).toBe(400);
      }
      expect((await shown('hall.banner'))?.value).toBe('');
    });
  });

  describe('reverting', () => {
    it('goes one step back, and twice returns to where it started', async () => {
      await change('hall.banner', 'First');
      await change('hall.banner', 'Second');

      expect((await call(REVERT, 'POST', 'hall.banner', undefined, { cookie: adminCookie })).status).toBe(200);
      expect((await shown('hall.banner'))?.value).toBe('First');

      expect((await call(REVERT, 'POST', 'hall.banner', undefined, { cookie: adminCookie })).status).toBe(200);
      expect((await shown('hall.banner'))?.value).toBe('Second');
    });

    it('restores the declared default when the first change is reverted', async () => {
      await change('mail.enabled', 'false');

      await call(REVERT, 'POST', 'mail.enabled', undefined, { cookie: adminCookie });

      expect((await shown('mail.enabled'))?.value).toBe('true');
    });

    it('has nothing to go back to for a key that has never changed', async () => {
      const response = await call(REVERT, 'POST', 'hall.banner', undefined, { cookie: adminCookie });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'nothing_to_revert' });
    });
  });

  describe('who may change a setting', () => {
    it('answers an investor 404, changing nothing', async () => {
      const response = await change('hall.banner', 'Theirs', investorCookie);

      expect(response.status).toBe(404);
      expect((await shown('hall.banner'))?.value).toBe('');
    });

    it('sends a caller with no session to sign in, changing nothing', async () => {
      const response = await call(PUT, 'PUT', 'hall.banner', { value: 'Nobody' });

      expect(response.status).toBe(303);
      expect((await shown('hall.banner'))?.value).toBe('');
    });

    it('refuses a cross-origin change before anything else', async () => {
      const response = await call(
        PUT,
        'PUT',
        'hall.banner',
        { value: 'Elsewhere' },
        { cookie: adminCookie, origin: 'https://elsewhere.test' },
      );

      expect(response.status).toBe(403);
      expect((await shown('hall.banner'))?.value).toBe('');
    });

    it('refuses a cross-origin revert, and an investor’s', async () => {
      await change('hall.banner', 'Set');

      expect(
        (
          await call(REVERT, 'POST', 'hall.banner', undefined, {
            cookie: adminCookie,
            origin: 'https://elsewhere.test',
          })
        ).status,
      ).toBe(403);
      expect(
        (await call(REVERT, 'POST', 'hall.banner', undefined, { cookie: investorCookie })).status,
      ).toBe(404);
      expect((await shown('hall.banner'))?.value).toBe('Set');
    });
  });

  describe('what the trail records', () => {
    it('audits a change and a revert to the admin who made each', async () => {
      // The trail is append-only (SEC-002), so it carries every earlier case in
      // this file; the assertion is scoped to what these two acts wrote.
      const latest = await getDb()
        .selectFrom('audit')
        .select('id')
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirst();

      await change('hall.banner', 'Raising');
      await call(REVERT, 'POST', 'hall.banner', undefined, { cookie: adminCookie });

      const audit = await getDb()
        .selectFrom('audit')
        .select(['action', 'actor_id', 'before', 'after'])
        .where('action', '=', 'config.change')
        .$if(latest !== undefined, (query) => query.where("id", ">", latest!.id))
        .orderBy('id')
        .execute();

      expect(audit).toHaveLength(2);
      expect(audit.every((row) => row.actor_id === adminId)).toBe(true);
      // The key rides in the values, because `subject_id` is a uuid and a trail
      // naming only the setting could not say which way it moved.
      expect(audit[0]).toMatchObject({
        before: { key: 'hall.banner', value: '' },
        after: { key: 'hall.banner', value: 'Raising' },
      });
      expect(audit[1]).toMatchObject({
        before: { key: 'hall.banner', value: 'Raising' },
        after: { key: 'hall.banner', value: '' },
      });
    });
  });
});
