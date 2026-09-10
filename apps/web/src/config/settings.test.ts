/**
 * Runtime configuration (`CFG-001/T1`, `T5`, `T6`).
 *
 * The registry and the secret-guard are pure and run everywhere; the cached
 * accessor reads the `config` table against a real PostgreSQL, because "an empty
 * table yields a working application" and "a change takes effect within seconds"
 * are claims about what the database returns and when, which a stub would only
 * restate.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import { Settings, SETTINGS, isSecretShaped, type SettingKey } from './settings';

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
    expect(await settings.get('mail.enabled')).toBe(true);
    expect(await settings.get('session.max_age_days')).toBe(30);
    expect(await settings.get('signin.rate_per_hour')).toBe(10);
  });

  it('parses a stored value into the key declared type', async () => {
    await put('room.banner', 'Closed for maintenance');
    await put('mail.enabled', 'false');
    await put('session.max_age_days', '45');

    const settings = new Settings();

    // A string, a boolean and a number — the type is the key's, not the column's.
    expect(await settings.get('room.banner')).toBe('Closed for maintenance');
    expect(await settings.get('mail.enabled')).toBe(false);
    expect(await settings.get('session.max_age_days')).toBe(45);
  });

  it('falls back to the default when a stored integer is corrupt', async () => {
    await put('session.max_age_days', 'not-a-number');

    // A row outside the type is a write that bypassed validation; the default is
    // the fail-safe, not a NaN handed to a caller.
    expect(await new Settings().get('session.max_age_days')).toBe(30);
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
});
