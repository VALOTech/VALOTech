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
 * No handler is attached to the pool's `error` event, so an idle client that
 * fails takes the process down rather than being caught where nothing can
 * report it. That is deliberate: a caught error would have to be discarded, and
 * a discarded error on the path every authenticated read runs through is worse
 * than a restart the orchestrator performs and the health check notices.
 *
 * Deferred: OPS-002/T1 — attach a pool `error` listener that writes a
 * structured line and lets the process exit, once one logger exists to write
 * it. Until then an idle-client failure crashes loudly — correct, not a stub.
 */
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import { getConfig } from '../config/index';
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

/** The application's database handle, connected on first use. */
export function getDb(): Kysely<Database> {
  if (db === undefined) {
    const { db: settings } = getConfig();

    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: settings.url.value,
          ssl: ssl(settings.sslmode),
        }),
      }),
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
