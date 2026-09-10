/**
 * `GET /health` — `{ ok, version, db }` (`OPS-002`).
 *
 * `db` is a real query, not a connection-pool status: a pool holding a
 * connection to a database that has stopped answering reports healthy, and that
 * is the failure this endpoint exists to catch — so it runs `select 1` and
 * reports whether the database actually answered. `version` is the build's
 * identity, so a report about behaviour can be tied to what was running.
 *
 * It exposes nothing else — no row counts, no configuration, no environment —
 * and it is never cached: `force-dynamic` and `no-store` together keep a
 * monitor reading the live state rather than a stored one, which a cached
 * health check would quietly become. A failed query answers `503`, so the
 * status line alone carries the signal for a monitor that reads nothing else.
 */

import { sql } from 'kysely';

import { getConfig } from '../../config/index';
import { getDb } from '../../db/index';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  let db = false;
  try {
    await sql`select 1`.execute(getDb());
    db = true;
  } catch {
    db = false;
  }

  return Response.json(
    { ok: db, version: getConfig().build.version, db },
    { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
