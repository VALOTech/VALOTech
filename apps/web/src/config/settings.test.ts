/**
 * Runtime configuration (`CFG-001/T1`, `T5`, `T6`).
 *
 * The registry and the secret-guard are pure and run everywhere; the cached
 * accessor reads the `config` table against a real PostgreSQL, because "an empty
 * table yields a working application" and "a change takes effect within seconds"
 * are claims about what the database returns and when, which a stub would only
 * restate.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import {
  changeSetting,
  isSecretShaped,
  revertSetting,
  Settings,
  SETTINGS,
  validateSetting,
  type SettingKey,
} from './settings';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

describe('the registry and the secret-guard (CFG-001/T1, T6)', () => {
  it('declares a type and a default for every key, and no key is secret-shaped', () => {
    const keys = Object.keys(SETTINGS);
    expect(keys.length).toBeGreaterThan(0);

    for (const [key, spec] of Object.entries(SETTINGS)) {
      expect(['text', 'int', 'bool']).toContain(spec.type);
      expect(spec.fallback).toBeDefined();
      // The registry can never become a place a secret is kept (`SEC-R05`).
      expect(isSecretShaped(key)).toBe(false);
    }
  });

  it('recognises a secret-shaped key by several of the names a credential takes', () => {
    for (const key of [
      'smtp.password',
      'stripe.api_key',
      'session.secret',
      'backup.private_key',
      'mail.credential',
      'some.token',
    ]) {
      expect(isSecretShaped(key)).toBe(true);
    }
  });

  it('refuses to read a secret-shaped key before it touches the database', async () => {
    // The guard runs before any read, so this rejects with no database at all —
    // a credential is never a runtime setting, and asking for one is the error.
    const settings = new Settings();
    await expect(settings.get('smtp.password' as SettingKey)).rejects.toThrow(/secret-shaped/);
  });
});

describe('what the registry holds (CFG-001/T7)', () => {
  it('holds only the three values an admin changes at runtime', () => {
    // The session lifetime and the sign-in rate are the environment's, where a
    // change is reviewed and deployed (`CFG-DEC-01`). A security parameter that
    // can be widened from a web form at runtime is the failure this excludes,
    // and the list being short is the design rather than an accident of what has
    // been built (`CFG-001` §3).
    expect(Object.keys(SETTINGS).sort()).toEqual([
      'mail.enabled',
      'room.banner',
      'room.signin_message',
    ]);
  });
});

describe('validation against type and length (CFG-001/T2)', () => {
  it('accepts a value each key type admits, and stores it as written', () => {
    expect(validateSetting('mail.enabled', 'false')).toEqual({ ok: true, stored: 'false' });
    expect(validateSetting('mail.enabled', 'true')).toEqual({ ok: true, stored: 'true' });
    expect(validateSetting('room.banner', 'Closed for the weekend')).toEqual({
      ok: true,
      stored: 'Closed for the weekend',
    });
  });

  it('refuses an over-long text with the limit rather than truncating it', () => {
    // The limit is in the refusal, because a silent truncation would disagree
    // with what the caller typed and what the screen then shows.
    expect(validateSetting('room.banner', 'x'.repeat(281))).toEqual({
      ok: false,
      reason: 'room.banner is at most 280 characters',
    });
    expect(validateSetting('room.banner', 'x'.repeat(280)).ok).toBe(true);
    expect(validateSetting('room.signin_message', 'x'.repeat(281)).ok).toBe(false);
  });

  it('refuses a value that is neither of the two words a bool admits', () => {
    expect(validateSetting('mail.enabled', 'maybe')).toEqual({
      ok: false,
      reason: 'mail.enabled is true or false',
    });
    expect(validateSetting('mail.enabled', '').ok).toBe(false);
    expect(validateSetting('mail.enabled', 'TRUE').ok).toBe(false);
  });
});

describe.skipIf(!HAS_DATABASE)('the cached accessor (CFG-001/T5)', () => {
  beforeAll(async () => {
    await runner({
      databaseUrl: DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
      advisoryLockMode: 'wait',
    });
  }, 120_000);

  beforeEach(async () => {
    // The five keys are CFG-001's own; nothing else writes this table, so
    // clearing them leaves each test reading exactly what it wrote.
    await getDb()
      .deleteFrom('config')
      .where('key', 'in', Object.keys(SETTINGS))
      .execute();
  });

  afterAll(closeDb);

  /** Write one config row the way a change will, without the change path yet. */
  async function put(key: string, value: string): Promise<void> {
    await getDb()
      .insertInto('config')
      .values({ key, value })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
      .execute();
  }

  it('returns the declared default for every key when the table is empty', async () => {
    const settings = new Settings();

    expect(await settings.get('room.banner')).toBe('');
    expect(await settings.get('room.signin_message')).toBe('');
    expect(await settings.get('mail.enabled')).toBe(true);
  });

  it('parses a stored value into the key declared type', async () => {
    await put('room.banner', 'Closed for maintenance');
    await put('mail.enabled', 'false');

    const settings = new Settings();

    // A string and a boolean — the type is the key's, not the column's.
    expect(await settings.get('room.banner')).toBe('Closed for maintenance');
    expect(await settings.get('mail.enabled')).toBe(false);
  });

  it('reads a corrupt bool row as off, which is the safe direction for a kill switch', async () => {
    await put('mail.enabled', 'not-a-boolean');

    // A row outside the type is a write that bypassed validation (`CFG-001/T2`).
    // Only the exact word admits sending, so the value that survives a corrupt
    // row is the one that sends nothing rather than the declared default, which
    // would resume sending on a row nobody can account for.
    expect(await new Settings().get('mail.enabled')).toBe(false);
  });

  it('caches within the refresh window and reloads after it', async () => {
    let clock = 0;
    const settings = new Settings(() => clock, 5000);

    await put('room.banner', 'first');
    expect(await settings.get('room.banner')).toBe('first');

    await put('room.banner', 'second');
    // Still the cached value: a change is not instant, which is the trade the
    // short refresh makes for not reading the database on every request.
    expect(await settings.get('room.banner')).toBe('first');

    clock += 5000;
    expect(await settings.get('room.banner')).toBe('second');
  });

  describe('changing and reverting (CFG-001/T3, T4)', () => {
    // The `config` keys are cleared by the parent `beforeEach`; the `audit` table
    // is append-only (a trigger refuses DELETE), so an act count is scoped to the
    // test's own actor rather than cleared between tests.
    const readRow = (key: string) =>
      getDb()
        .selectFrom('config')
        .select(['value', 'previous_value', 'changed_by'])
        .where('key', '=', key)
        .executeTakeFirst();

    const changesBy = (actor: string) =>
      getDb()
        .selectFrom('audit')
        .select(['subject_type', 'subject_id'])
        .where('action', '=', 'config.change')
        .where('actor_id', '=', actor)
        .execute();

    /** What each of an actor's changes recorded, oldest first. */
    const movesBy = (actor: string) =>
      getDb()
        .selectFrom('audit')
        .select(['before', 'after'])
        .where('action', '=', 'config.change')
        .where('actor_id', '=', actor)
        .orderBy('id')
        .execute();

    // `config.changed_by` is a foreign key to `accounts(id)`, so the actor of a
    // change is a real account — a bare random uuid violates it. A fresh account
    // per test also makes the append-only audit countable by that actor.
    const anAdmin = async (): Promise<string> => {
      const row = await getDb()
        .insertInto('accounts')
        .values({
          email: `${randomUUID()}@config.test`,
          name: 'Config Admin',
          role: 'admin',
          state: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    };

    it('writes the value, captures the default as previous, and audits the act', async () => {
      const actor = await anAdmin();

      expect((await changeSetting('mail.enabled', 'false', actor)).ok).toBe(true);

      const row = await readRow('mail.enabled');
      expect(row?.value).toBe('false');
      // The previous value is the declared default, so reverting the first change
      // restores it rather than a null.
      expect(row?.previous_value).toBe('true');
      expect(row?.changed_by).toBe(actor);

      const changes = await changesBy(actor);
      expect(changes).toHaveLength(1);
      // `subject_id` is null because a setting key is not a uuid; the key rides
      // in the recorded fields instead, which is why the allow-list names it
      // alongside the value (`SEC-DEC-01`).
      expect(changes[0]).toEqual({ subject_type: 'config', subject_id: null });

      expect(await movesBy(actor)).toEqual([
        {
          before: { key: 'mail.enabled', value: 'true' },
          after: { key: 'mail.enabled', value: 'false' },
        },
      ]);
    });

    it('records the key and both values, and a revert records them the other way round', async () => {
      const actor = await anAdmin();

      await changeSetting('room.banner', 'First', actor);
      await changeSetting('room.banner', 'Second', actor);
      expect(await revertSetting('room.banner', actor)).toBe(true);

      // Each row is a complete statement of the setting at that moment: what it
      // was and what it became. The revert's pair is the change's reversed,
      // which is what makes a revert readable as a revert rather than as a third
      // arbitrary value.
      expect(await movesBy(actor)).toEqual([
        { before: { key: 'room.banner', value: '' }, after: { key: 'room.banner', value: 'First' } },
        { before: { key: 'room.banner', value: 'First' }, after: { key: 'room.banner', value: 'Second' } },
        { before: { key: 'room.banner', value: 'Second' }, after: { key: 'room.banner', value: 'First' } },
      ]);
    });

    it('captures the prior stored value as previous on a second change', async () => {
      const actor = await anAdmin();

      await changeSetting('room.signin_message', 'Back at nine', actor);
      await changeSetting('room.signin_message', 'Back at ten', actor);

      const row = await readRow('room.signin_message');
      expect(row?.value).toBe('Back at ten');
      expect(row?.previous_value).toBe('Back at nine');
    });

    it('writes nothing and records nothing when the value is refused', async () => {
      const actor = await anAdmin();

      expect((await changeSetting('room.banner', 'x'.repeat(281), actor)).ok).toBe(false);

      expect(await readRow('room.banner')).toBeUndefined();
      expect(await changesBy(actor)).toHaveLength(0);
    });

    it('rolls the change and its audit back together when the write cannot complete', async () => {
      // An unparseable actor fails the write inside the transaction, so the row
      // and any audit roll back together — the atomicity the task names.
      await expect(changeSetting('room.banner', 'Hello', 'not-a-uuid')).rejects.toThrow(
        /invalid input syntax for type uuid/,
      );

      expect(await readRow('room.banner')).toBeUndefined();
    });

    it('reverts by swapping current and previous, and reverting twice returns to the start', async () => {
      const actor = await anAdmin();

      await changeSetting('room.banner', 'First', actor);
      await changeSetting('room.banner', 'Second', actor);

      expect(await revertSetting('room.banner', actor)).toBe(true);
      expect((await readRow('room.banner'))?.value).toBe('First');

      expect(await revertSetting('room.banner', actor)).toBe(true);
      expect((await readRow('room.banner'))?.value).toBe('Second');

      // Two changes and two reverts, each one config.change — a revert is a change
      // back, not a separate action.
      expect(await changesBy(actor)).toHaveLength(4);
    });

    it('reverts a first change back to the declared default', async () => {
      const actor = await anAdmin();

      await changeSetting('mail.enabled', 'false', actor);
      expect(await revertSetting('mail.enabled', actor)).toBe(true);

      expect((await readRow('mail.enabled'))?.value).toBe('true');
    });

    it('is a no-op for a key that has never changed, writing nothing', async () => {
      const actor = await anAdmin();

      expect(await revertSetting('room.banner', actor)).toBe(false);

      expect(await readRow('room.banner')).toBeUndefined();
      expect(await changesBy(actor)).toHaveLength(0);
    });
  });
});
