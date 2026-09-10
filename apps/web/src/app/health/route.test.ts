/**
 * `GET /health` (`OPS-002/T5`). The real-query path is asserted against a real
 * PostgreSQL — a stub would only prove the stub — and the failure path injects
 * a database that does not answer, which is the case the endpoint exists to
 * catch and the one a pool-status check would wrongly call healthy.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

import * as dbModule from '../../db/index';
import { closeDb } from '../../db/index';
import { GET } from './route';

const HAS_DATABASE = (process.env.DATABASE_URL ?? '').trim() !== '';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.BUILD_VERSION = 'test-build-sha';
// getConfig requires a postgres:// DATABASE_URL even for the failure test, which
// mocks getDb and opens no connection; the real-query test is gated on a real
// database actually being provided.
if (!HAS_DATABASE) {
  process.env.DATABASE_URL = 'postgres://valotech:valotech@127.0.0.1:5434/valotech';
}

describe.skipIf(!HAS_DATABASE)('GET /health against a real database', () => {
  afterAll(closeDb);

  it('runs a real query and reports ok, the build version, and db true, uncached', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, version: 'test-build-sha', db: true });
  });
});

describe('GET /health when the database does not answer', () => {
  it('reports not-ok, db false, and 503 — a pool status would have said healthy', async () => {
    // A database that has stopped answering, which the catch turns into a
    // refusal rather than a throw; the signal is in the status for a monitor
    // that reads nothing else.
    const spy = vi.spyOn(dbModule, 'getDb').mockImplementation(() => {
      throw new Error('the database is not answering');
    });

    try {
      const response = await GET();

      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ ok: false, version: 'test-build-sha', db: false });
    } finally {
      spy.mockRestore();
    }
  });
});
