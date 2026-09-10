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

// Every privileged write the audit can record. Adding a value here does not add
// it to the database: the constraint is the migration's, and an action it does
// not name cannot be written at all.
export const AUDIT_ACTIONS = [
  'account.create',
  'account.suspend',
  'account.delete',
  'account.role_change',
  'account.reinstate',
  'grant.add',
  'grant.remove',
  'content.publish',
  'content.withdraw',
  'content.audience_change',
  'media.delete',
  'config.change',
  'mail.send',
  'mail.unsubscribe',
  'session.invalidate_all',
  'portfolio.change',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const MAIL_LOG_KINDS = ['transactional', 'bulk'] as const;

export type MailLogKind = (typeof MAIL_LOG_KINDS)[number];

// There is no `delivered`: SMTP answers once, at hand-off, so `accepted` is the
// strongest true statement the log can make about a message.
export const MAIL_LOG_STATES = ['queued', 'accepted', 'failed'] as const;

export type MailLogState = (typeof MAIL_LOG_STATES)[number];

export const UNSUBSCRIBE_SOURCES = ['link', 'admin'] as const;

export type UnsubscribeSource = (typeof UNSUBSCRIBE_SOURCES)[number];

export const PORTFOLIO_PRODUCTS = [
  'valo-ads',
  'valo-pocket',
  'shimmra',
  'amavo',
  'farola',
  'verdiq',
] as const;

export type PortfolioProduct = (typeof PORTFOLIO_PRODUCTS)[number];

export const PORTFOLIO_STAGES = ['building', 'in private use', 'in market', 'paused'] as const;

export type PortfolioStage = (typeof PORTFOLIO_STAGES)[number];

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
 *
 * Two column types map to something other than the obvious JavaScript one, and
 * the mapping belongs to the driver rather than being a choice made here. An
 * `int8` — `bigint`, the audit's identity key and the mail log's `bigserial` —
 * arrives as a **string**: `pg` will not parse it into a number, because the
 * type's range exceeds what a JavaScript number holds exactly and a driver that
 * rounded silently would be worse than one handing back the digits. Typing such
 * a column as `number` would be a claim about the driver that the first read
 * disproves, so `byte_size` and both `id`s below are strings. A `bytea` arrives
 * as a Node `Buffer`, which is what `media.bytes` is.
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

export interface SessionsTable {
  id: Generated<string>;
  account_id: string;
  token_hash: string;
  created_at: Generated<Date>;
  last_seen_at: Generated<Date>;
  expires_at: Date;
}

export interface InvitationsTable {
  id: Generated<string>;
  account_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
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

// `actor_id` is a plain string and not a reference to an account, because the
// column is a bare uuid in the database too: the row outlives the account it
// names, and keeping the id is what lets the trail stay truthful after an
// erasure has taken the person out of it.
export interface AuditTable {
  id: Generated<string>;
  at: Generated<Date>;
  actor_id: string | null;
  action: AuditAction;
  subject_type: string | null;
  subject_id: string | null;
  before: Json;
  after: Json;
}

export interface ConfigTable {
  key: string;
  value: string;
  previous_value: string | null;
  changed_by: string | null;
  changed_at: Generated<Date>;
}

export interface MailLogTable {
  id: Generated<string>;
  at: Generated<Date>;
  account_id: string;
  subject: string;
  kind: MailLogKind;
  state: MailLogState;
  queue_id: string | null;
  error: string | null;
}

export interface UnsubscribesTable {
  account_id: string;
  at: Generated<Date>;
  source: UnsubscribeSource;
  token: string | null;
  reason: string | null;
}

export interface MediaTable {
  id: Generated<string>;
  sha256: string;
  mime: string;
  byte_size: string;
  bytes: Buffer;
  uploaded_by: string | null;
  created_at: Generated<Date>;
}

export interface MediaRefsTable {
  media_id: string;
  item_id: string;
}

export interface PortfolioTable {
  product: PortfolioProduct;
  stage: PortfolioStage;
  headline: string | null;
  updated_at: Generated<Date>;
  updated_by: string | null;
}

export interface Database {
  accounts: AccountsTable;
  sessions: SessionsTable;
  invitations: InvitationsTable;
  content_items: ContentItemsTable;
  content_revisions: ContentRevisionsTable;
  content_locales: ContentLocalesTable;
  content_grants: ContentGrantsTable;
  audit: AuditTable;
  config: ConfigTable;
  mail_log: MailLogTable;
  unsubscribes: UnsubscribesTable;
  media: MediaTable;
  media_refs: MediaRefsTable;
  portfolio: PortfolioTable;
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
  sessions: {
    migration: '_auth_store.sql',
    columns: [
      { name: 'id', type: 'uuid', notNull: true, hasDefault: true, unique: true },
      { name: 'account_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
      { name: 'token_hash', type: 'text', notNull: true, hasDefault: false, unique: true },
      { name: 'created_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'last_seen_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'expires_at', type: 'timestamptz', notNull: true, hasDefault: false, unique: false },
    ],
    primaryKey: ['id'],
    checks: {},
  },
  invitations: {
    migration: '_auth_store.sql',
    columns: [
      { name: 'id', type: 'uuid', notNull: true, hasDefault: true, unique: true },
      { name: 'account_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
      { name: 'token_hash', type: 'text', notNull: true, hasDefault: false, unique: true },
      { name: 'expires_at', type: 'timestamptz', notNull: true, hasDefault: false, unique: false },
      { name: 'consumed_at', type: 'timestamptz', notNull: false, hasDefault: false, unique: false },
    ],
    primaryKey: ['id'],
    checks: {},
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
  audit: {
    migration: '_platform.sql',
    columns: [
      { name: 'id', type: 'bigint', notNull: true, hasDefault: true, unique: true },
      { name: 'at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'actor_id', type: 'uuid', notNull: false, hasDefault: false, unique: false },
      { name: 'action', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'subject_type', type: 'text', notNull: false, hasDefault: false, unique: false },
      { name: 'subject_id', type: 'uuid', notNull: false, hasDefault: false, unique: false },
      { name: 'before', type: 'jsonb', notNull: false, hasDefault: false, unique: false },
      { name: 'after', type: 'jsonb', notNull: false, hasDefault: false, unique: false },
    ],
    primaryKey: ['id'],
    checks: { action: AUDIT_ACTIONS },
  },
  config: {
    migration: '_platform.sql',
    columns: [
      { name: 'key', type: 'text', notNull: true, hasDefault: false, unique: true },
      { name: 'value', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'previous_value', type: 'text', notNull: false, hasDefault: false, unique: false },
      { name: 'changed_by', type: 'uuid', notNull: false, hasDefault: false, unique: false },
      { name: 'changed_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
    ],
    primaryKey: ['key'],
    checks: {},
  },
  mail_log: {
    migration: '_platform.sql',
    columns: [
      { name: 'id', type: 'bigserial', notNull: true, hasDefault: true, unique: true },
      { name: 'at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'account_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
      { name: 'subject', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'kind', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'state', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'queue_id', type: 'text', notNull: false, hasDefault: false, unique: false },
      { name: 'error', type: 'text', notNull: false, hasDefault: false, unique: false },
    ],
    primaryKey: ['id'],
    checks: { kind: MAIL_LOG_KINDS, state: MAIL_LOG_STATES },
  },
  unsubscribes: {
    migration: '_platform.sql',
    columns: [
      { name: 'account_id', type: 'uuid', notNull: true, hasDefault: false, unique: true },
      { name: 'at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'source', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'token', type: 'text', notNull: false, hasDefault: false, unique: false },
      { name: 'reason', type: 'text', notNull: false, hasDefault: false, unique: false },
    ],
    primaryKey: ['account_id'],
    checks: { source: UNSUBSCRIBE_SOURCES },
  },
  media: {
    migration: '_platform.sql',
    columns: [
      { name: 'id', type: 'uuid', notNull: true, hasDefault: true, unique: true },
      { name: 'sha256', type: 'text', notNull: true, hasDefault: false, unique: true },
      { name: 'mime', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'byte_size', type: 'bigint', notNull: true, hasDefault: false, unique: false },
      { name: 'bytes', type: 'bytea', notNull: true, hasDefault: false, unique: false },
      { name: 'uploaded_by', type: 'uuid', notNull: false, hasDefault: false, unique: false },
      { name: 'created_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
    ],
    primaryKey: ['id'],
    checks: {},
  },
  media_refs: {
    migration: '_platform.sql',
    columns: [
      { name: 'media_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
      { name: 'item_id', type: 'uuid', notNull: true, hasDefault: false, unique: false },
    ],
    primaryKey: ['media_id', 'item_id'],
    checks: {},
  },
  portfolio: {
    migration: '_platform.sql',
    columns: [
      { name: 'product', type: 'text', notNull: true, hasDefault: false, unique: true },
      { name: 'stage', type: 'text', notNull: true, hasDefault: false, unique: false },
      { name: 'headline', type: 'text', notNull: false, hasDefault: false, unique: false },
      { name: 'updated_at', type: 'timestamptz', notNull: true, hasDefault: true, unique: false },
      { name: 'updated_by', type: 'uuid', notNull: false, hasDefault: false, unique: false },
    ],
    primaryKey: ['product'],
    checks: { product: PORTFOLIO_PRODUCTS, stage: PORTFOLIO_STAGES },
  },
};
