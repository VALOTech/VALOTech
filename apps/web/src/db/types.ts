/**
 * The Kysely view of the schema the migrations build.
 *
 * Written by hand against the migration files rather than generated from the
 * database: the migration is the source of truth for the schema, and a schema
 * inferred from code is one no reviewer can read in one place. The cost is
 * that this file is only true while it is edited in the same commit as the
 * migration it describes.
 *
 * `ACCOUNTS_COLUMNS` below is what stops that cost becoming a silent drift.
 * It is the one runtime description of the table, the interface is written to
 * match it, and `db.test.ts` parses the migration and asserts the migration
 * agrees with it — column name, type, nullability, default and uniqueness. A
 * migration change the interface does not follow fails that test.
 */
import type { Generated } from 'kysely';

/**
 * The values the migration's CHECK constraints accept, as arrays rather than
 * bare union types, so the constraint and the type can be compared with each
 * other rather than trusted to agree.
 */
export const ACCOUNT_ROLES = ['investor', 'admin'] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_STATES = ['invited', 'active', 'suspended'] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

/**
 * One column of a table, described at the level the migration writes it. A
 * `PRIMARY KEY` counts as both `notNull` and `unique`, because that is what it
 * is; the drift guard compares these properties, not the SQL keywords.
 */
export interface ColumnSpec {
  readonly name: string;
  /** The PostgreSQL type as the migration spells it, e.g. `citext`, `timestamptz`. */
  readonly type: string;
  readonly notNull: boolean;
  readonly hasDefault: boolean;
  readonly unique: boolean;
}

/**
 * The `accounts` table, per `docs/designs/data/data-001-schema-and-migrations.md`.
 * Keep this in step with `migrations/*_accounts.sql`; the test proves you have.
 */
export const ACCOUNTS_COLUMNS: readonly ColumnSpec[] = [
  { name: 'id', type: 'uuid', notNull: true, hasDefault: true, unique: true },
  { name: 'email', type: 'citext', notNull: true, hasDefault: false, unique: true },
  { name: 'name', type: 'text', notNull: true, hasDefault: false, unique: false },
  { name: 'role', type: 'text', notNull: true, hasDefault: false, unique: false },
  { name: 'password_hash', type: 'text', notNull: false, hasDefault: false, unique: false },
  { name: 'state', type: 'text', notNull: true, hasDefault: true, unique: false },
  { name: 'created_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
  { name: 'updated_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
] as const;

/**
 * `Generated` marks a column the database fills when an insert leaves it out:
 * the primary key, the state default, and both timestamps. The keys and their
 * `Generated`/nullable shape follow `ACCOUNTS_COLUMNS` above.
 */
export interface AccountsTable {
  id: Generated<string>;
  email: string;
  name: string;
  role: AccountRole;
  password_hash: string | null;
  state: Generated<AccountState>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  accounts: AccountsTable;
}
