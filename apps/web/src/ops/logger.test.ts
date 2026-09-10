/**
 * The logger (`OPS-002/T1`, `T3`). Every assertion reads the bytes the logger
 * actually writes to stdout, captured rather than inferred, because the line's
 * shape and its scrubbing are the whole feature and a logger that returned the
 * right object while writing the wrong bytes would pass a weaker test.
 *
 * It needs no database. `getConfig` is read for the environment (debug is off in
 * production), so the required variables are set below and the one test that
 * turns on production mocks the config rather than reloading a frozen cache.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as configModule from '../config/index';
import { handlePoolError } from '../db/index';
import { log, LOG_EVENTS, type LogLevel } from './logger';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.DATABASE_URL = 'postgres://valotech:valotech@127.0.0.1:5434/valotech';

/** The one event in the closed vocabulary today; every call below carries it. */
const EVENT = LOG_EVENTS[0];

let written: string[];

beforeEach(() => {
  written = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
    written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The lines the logger wrote this test, parsed back from the captured stdout. */
function lines(): Array<Record<string, unknown>> {
  return written
    .join('')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('OPS-002/T1 the line', () => {
  it('writes one JSON line per call, carrying the fixed shape', () => {
    log.info(EVENT, 'a thing happened', { count: 3, ok: true });

    const emitted = lines();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      level: 'info',
      event: EVENT,
      request_id: null,
      msg: 'a thing happened',
      count: 3,
      ok: true,
    });
    // A newline terminates each line, so a reader splits the stream on it.
    expect(written.join('')).toBe(`${JSON.stringify(emitted[0])}\n`);
  });

  it('stamps the time in UTC', () => {
    log.error(EVENT, 'now');

    const ts = lines()[0]?.ts as string;
    // ISO 8601 with the Z offset: a line is read on a different machine in a
    // different zone, and a local-time stamp would be read as that zone's.
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it.each<LogLevel>(['error', 'warn', 'info'])('writes a %s line outside production', (level) => {
    log[level](EVENT, 'present');

    expect(lines()[0]?.level).toBe(level);
  });

  it('suppresses debug in production and emits it otherwise', () => {
    // The environment is read through getConfig, which freezes and caches the
    // first load; mocking it is how one test sees production without the file's
    // own development value leaking into every other test here.
    const base = configModule.getConfig();
    vi.spyOn(configModule, 'getConfig').mockReturnValue({
      ...base,
      app: { ...base.app, env: 'production' },
    });

    log.debug(EVENT, 'not in production');
    expect(lines()).toHaveLength(0);

    vi.spyOn(configModule, 'getConfig').mockReturnValue({
      ...base,
      app: { ...base.app, env: 'development' },
    });

    log.debug(EVENT, 'but in development');
    expect(lines()).toHaveLength(1);
    expect(lines()[0]?.level).toBe('debug');
  });
});

describe('OPS-002/T3 what never reaches a line', () => {
  it('masks an address in a field and in the message', () => {
    log.warn(EVENT, 'delivery to amy@example.test failed', { to: 'zoe@example.test' });

    const line = lines()[0];
    expect(line?.msg).toBe('delivery to [redacted] failed');
    expect(line?.to).toBe('[redacted]');
    expect(JSON.stringify(line)).not.toContain('amy@example.test');
    expect(JSON.stringify(line)).not.toContain('zoe@example.test');
  });

  it('masks a token and a hash but leaves an account id readable', () => {
    const token = 'A'.repeat(43); // a 32-byte base64url token is 43 characters
    const hash = 'a'.repeat(64); // a SHA-256 hex digest is 64
    const accountId = '11111111-1111-4111-8111-111111111111'; // a UUID is 36

    log.info(EVENT, 'acted', { token, hash, accountId });

    const line = lines()[0];
    // The secrets go; the id stays, because an id is what ties the line to the
    // act and is not itself a credential.
    expect(line?.token).toBe('[redacted]');
    expect(line?.hash).toBe('[redacted]');
    expect(line?.accountId).toBe(accountId);
  });

  it('leaves a line with no sensitive shape untouched', () => {
    log.info(EVENT, 'nothing to hide here', { product: 'valo-tech', count: 1 });

    expect(lines()[0]).toMatchObject({ msg: 'nothing to hide here', product: 'valo-tech', count: 1 });
  });
});

describe('OPS-002/T1 the first emitter: a failed idle database client', () => {
  it('logs db.pool_error at error level and exits', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    handlePoolError(new Error('connection terminated unexpectedly'));

    const line = lines()[0];
    expect(line?.level).toBe('error');
    expect(line?.event).toBe('db.pool_error');
    expect(line?.message).toBe('connection terminated unexpectedly');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('OPS-002/T1 no console call anywhere in the application', () => {
  it('finds no console.* call in any non-test source file', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..');
    const offenders: string[] = [];

    for (const entry of readdirSync(src, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }
      const name = entry.name;
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) {
        continue;
      }

      const path = join(entry.parentPath, name);
      // Strip block and line comments first: the only `console.log(` in the tree
      // is illustrative prose in two doc comments, and the check is for a call
      // rather than for the word.
      const code = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

      if (/console\s*\.\s*[A-Za-z]+\s*\(/.test(code)) {
        offenders.push(path);
      }
    }

    expect(offenders).toEqual([]);
  });
});
