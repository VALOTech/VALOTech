/**
 * The application's connection to PostgreSQL: one pool, one Kysely instance,
 * built the first time something asks for it.
 *
 * Lazy rather than at import, because importing this module must not require a
 * database or even a complete environment. The schema guard beside it and every
 * unit test in the tree import from `db/`, and a pool constructed at import
 * would make `npm test` need a running server to check a type.
 *
 * The connection string comes from `config` and never from `process.env`. One
 * reader for the environment is what stops a variable being required in
 * production and documented nowhere (CRED-001, SEC-R05), and it is why the
 * string arrives here already validated and wrapped in a `Secret`.
 *
 * A handler on the pool's `error` event logs one structured line and exits. An
 * idle client that fails has no caller on the stack to return the error to, so
 * it cannot be handled where it happens; a discarded error on the path every
 * authenticated read runs through is worse than a restart the orchestrator
 * performs and the health check notices, and an exit carrying a line (`OPS-002`)
 * beats the silent crash an unhandled `error` event would otherwise be.
 */
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import { getConfig } from '../config/index';
import { log } from '../ops/logger';
import type { Database } from './types';

/**
 * `DB_SSLMODE`, as node-postgres takes it. `disable` connects in the clear,
 * which the configuration already refuses outside development; every other
 * value encrypts and verifies the server's certificate.
 *
 * Verification is not separated from encryption here because nothing in this
 * deployment has asked for one without the other, and the fail-closed direction
 * is the one to default to: a certificate that cannot be verified stops a
 * deploy, where an operator sees it, rather than producing a connection that
 * only looks protected. It is also what node-postgres itself does with an
 * `sslmode=require` written into the connection string, so the two ways of
 * saying it agree.
 *
 * An `sslmode` parameter inside `DATABASE_URL` overrides this argument rather
 * than being overridden by it — node-postgres merges the parsed connection
 * string over the explicit options. `env.example` documents `DB_SSLMODE` as the
 * place the policy is stated, and the URL it shows carries no parameters.
 */
function ssl(sslmode: string): boolean {
  return sslmode !== 'disable';
}

let db: Kysely<Database> | undefined;

/**
 * Log an idle-client failure and exit. Exported so a test can pin that a pool
 * error both records a line and ends the process: the `error` event cannot be
 * raised on a real pool from a unit test, and left to propagate uncaught it
 * would end the test run rather than an assertion.
 */
export function handlePoolError(error: Error): void {
  log.error('db.pool_error', 'an idle database client failed; the process will exit', {
    message: error.message,
  });
  process.exit(1);
}

/** The application's database handle, connected on first use. */
export function getDb(): Kysely<Database> {
  if (db === undefined) {
    const { db: settings } = getConfig();

    const pool = new Pool({
      connectionString: settings.url.value,
      ssl: ssl(settings.sslmode),
    });
    pool.on('error', handlePoolError);

    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  return db;
}

/**
 * Close the pool and forget it, so the next `getDb()` builds a new one.
 *
 * A process that has finished with the database has no other way to let the
 * event loop drain: an open pool holds the process alive with idle sockets, and
 * a test run that leaves one behind hangs rather than reporting.
 */
export async function closeDb(): Promise<void> {
  const open = db;
  db = undefined;

  if (open !== undefined) {
    await open.destroy();
  }
}
