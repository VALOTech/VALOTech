/**
 * The Kysely view of the schema the migrations build.
 *
 * Written by hand against the migration files rather than generated from the
 * database: the migration is the source of truth for the schema, and a schema
 * inferred from code is one no reviewer can read in one place. The cost is
 * that this file is only true while it is edited in the same commit as the
 * migration it describes.
 *
 * `SCHEMA` below is what stops that cost becoming a silent drift. It is the
 * one runtime description of every table, the interfaces are written to match
 * it, and `db.test.ts` parses each table out of the migration that creates it
 * and asserts the two agree — column name, type, nullability, default,
 * uniqueness, primary key, and the values each CHECK admits. A migration
 * change the interface does not follow fails that test, and a table added to
 * the migrations and to nothing else fails it too.
 *
 * `SCHEMA` is keyed by `keyof Database`, so a table can be described here only
 * if the application knows how to query it, and can be queried only if it is
 * described here.
 */
import type { Generated } from 'kysely';

/**
 * The values the migrations' CHECK constraints accept, as arrays rather than
 * bare union types, so the constraint and the type can be compared with each
 * other rather than trusted to agree.
 */
export const ACCOUNT_ROLES = ['investor', 'admin'] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_STATES = ['invited', 'active', 'suspended'] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

export const CONTENT_TYPES = ['report', 'update', 'deck'] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_UPDATE_KINDS = ['announcement', 'achievement', 'progress'] as const;

export type ContentUpdateKind = (typeof CONTENT_UPDATE_KINDS)[number];

export const CONTENT_AUDIENCES = ['public', 'investor', 'granted'] as const;

export type ContentAudience = (typeof CONTENT_AUDIENCES)[number];

export const CONTENT_LOCALE_STATES = ['machine', 'reviewed'] as const;

export type ContentLocaleState = (typeof CONTENT_LOCALE_STATES)[number];

/**
 * What a `jsonb` column holds, at the only level this layer can honestly claim
 * to know. The block array's own shape belongs to the validator that writes it
 * (`CMS-002`); restating it here would be a second definition of the same
 * thing, and the second copy is the one that goes stale.
 */
export type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

// The nullable form, for a column that admits SQL NULL. `blocks` is not one --
// it is `jsonb NOT NULL` and always an array -- so it takes `JsonValue`, and a
// `blocks: null` no longer type-checks against a column the database rejects.
export type Json = JsonValue | null;

/**
 * `Generated` marks a column the database fills when an insert leaves it out.
 * Each interface's keys, `Generated` wrappers and `| null` unions follow that
 * table's entry in `SCHEMA`.
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

export interface ContentItemsTable {
  id: Generated<string>;
  type: ContentType;
  slug: string;
  title: string;
  kind: ContentUpdateKind | null;
  period: string | null;
  audience: Generated<ContentAudience>;
  current_revision_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ContentRevisionsTable {
  id: Generated<string>;
  item_id: string;
  blocks: JsonValue;
  author_id: string | null;
  created_at: Generated<Date>;
  published_at: Date | null;
}

export interface ContentLocalesTable {
  revision_id: string;
  locale: string;
  blocks: JsonValue;
  state: ContentLocaleState;
  reviewed_by: string | null;
  reviewed_at: Date | null;
}

export interface ContentGrantsTable {
  item_id: string;
  account_id: string;
  granted_at: Generated<Date>;
  granted_by: string | null;
}

export interface Database {
  accounts: AccountsTable;
  content_items: ContentItemsTable;
  content_revisions: ContentRevisionsTable;
  content_locales: ContentLocalesTable;
  content_grants: ContentGrantsTable;
}

/**
 * One column, described at the level its own line in the migration writes it —
 * an inline `PRIMARY KEY` counts as both `notNull` and `unique`, because that
 * is what it is. A key spread across a table-level `PRIMARY KEY (a, b)` line
 * is a property of the table rather than of either column, and is carried by
 * `TableSpec.primaryKey` instead; this stays a description of one line of SQL,
 * so the guard that checks it stays a line-for-line comparison.
 */
export interface ColumnSpec {
  readonly name: string;
  /** The PostgreSQL type as the migration spells it, e.g. `citext`, `timestamptz`. */
  readonly type: string;
  readonly notNull: boolean;
  readonly hasDefault: boolean;
  readonly unique: boolean;
}

export interface TableSpec {
  /**
   * The end of the filename of the migration that creates the table. Matched
   * by suffix rather than in full so the epoch prefix, claimed at the moment
   * the migration is written, is not a second thing to keep in step.
   */
  readonly migration: string;
  /** Every column, in the order the migration declares them. */
  readonly columns: readonly ColumnSpec[];
  /** The primary key's columns, in the order the migration declares them. */
  readonly primaryKey: readonly string[];
  /** Column name to the values that column's CHECK constraint admits. */
  readonly checks: Readonly<Record<string, readonly string[]>>;
}

/**
 * Every table the application queries, and what its migration says about it.
 * The record's key type is what makes this exhaustive in both directions.
 */
export const SCHEMA: Readonly<Record<keyof Database, TableSpec>> = {
  accounts: {
    migration: '_accounts.sql',
    columns: [
      { name: 'id', type: 'uuid', notNull: true, hasDefault: true, unique: true },
      { name: 'email', type: 'citext', notNull: true, hasDefault: false, unique: true },
      { name: 'name', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'role', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'password_hash', type: 'text', notNull: false, hasDefault: false, unique: false },
      { name: 'state', type: 'text', notNull: true, hasDefault: true, unique: false },
      { name: 'created_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'updated_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
    ],
    primaryKey: ['id'],
    checks: { role: ACCOUNT_ROLES, state: ACCOUNT_STATES },
  },
  content_items: {
    migration: '_content.sql',
    columns: [
      { name: 'id', type: 'uuid', notNull: true, hasDefault: true, unique: true },
      { name: 'type', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'slug', type: 'text', notNull: true, hasDefault: false, unique: true },
      { name: 'title', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'kind', type: 'text', notNull: false, hasDefault: false, unique: false },
      { name: 'period', type: 'text', notNull: false, hasDefault: false, unique: false },
      { name: 'audience', type: 'text', notNull: true, hasDefault: true, unique: false },
      { name: 'current_revision_id', type: 'uuid', notNull: false, hasDefault: false, unique: false },
      { name: 'created_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'updated_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
    ],
    primaryKey: ['id'],
    checks: { type: CONTENT_TYPES, kind: CONTENT_UPDATE_KINDS, audience: CONTENT_AUDIENCES },
  },
  content_revisions: {
    migration: '_content.sql',
    columns: [
      { name: 'id', type: 'uuid', notNull: true, hasDefault: true, unique: true },
      { name: 'item_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
      { name: 'blocks', type: 'jsonb', notNull: true, hasDefault: false, unique: false },
      { name: 'author_id', type: 'uuid', notNull: false, hasDefault: false, unique: false },
      { name: 'created_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'published_at', type: 'timestamptz', notNull: false, hasDefault: false, unique: false },
    ],
    primaryKey: ['id'],
    checks: {},
  },
  content_locales: {
    migration: '_content.sql',
    columns: [
      { name: 'revision_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
      { name: 'locale', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'blocks', type: 'jsonb', notNull: true, hasDefault: false, unique: false },
      { name: 'state', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'reviewed_by', type: 'uuid', notNull: false, hasDefault: false, unique: false },
      { name: 'reviewed_at', type: 'timestamptz', notNull: false, hasDefault: false, unique: false },
    ],
    primaryKey: ['revision_id', 'locale'],
    checks: { state: CONTENT_LOCALE_STATES },
  },
  content_grants: {
    migration: '_content.sql',
    columns: [
      { name: 'item_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
      { name: 'account_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
      { name: 'granted_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'granted_by', type: 'uuid', notNull: false, hasDefault: false, unique: false },
    ],
    primaryKey: ['item_id', 'account_id'],
    checks: {},
  },
};
