import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Insertable, Selectable } from 'kysely';
import { describe, expect, it } from 'vitest';

import { SCHEMA, type ColumnSpec, type Database } from './types';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

// A line inside CREATE TABLE that starts with one of these is a table-level
// constraint, not a column. Skipping them lets the schema carry the composite
// keys and named checks the content tables need, without the guard reading a
// constraint keyword as a column name.
const CONSTRAINT_KEYWORDS = new Set(['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK']);

// Object.keys widens its result to string[]. SCHEMA's key type is what makes
// this assertion sound, and it is the reason the record is typed that way
// rather than as a list.
const TABLES = Object.keys(SCHEMA) as readonly (keyof Database)[];

function migrationSql(suffix: string): string {
  const matches = readdirSync(MIGRATIONS_DIR).filter((entry) => entry.endsWith(suffix));
  const [only] = matches;

  if (only === undefined || matches.length > 1) {
    throw new Error(`Expected one migration ending in ${suffix}, found ${matches.length}`);
  }

  return readFileSync(join(MIGRATIONS_DIR, only), 'utf8');
}

function migrationFor(table: keyof Database): string {
  return migrationSql(SCHEMA[table].migration);
}

function tableBody(sql: string, table: string): string {
  const body = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1];

  if (body === undefined) {
    throw new Error(`The migration has no CREATE TABLE ${table} body to read`);
  }

  return body;
}

function bodyLines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim().replace(/,\s*$/, ''))
    .filter((line) => line.length > 0 && !line.startsWith('--'));
}

function isConstraintLine(line: string): boolean {
  const first = line.split(/\s+/)[0]?.toUpperCase() ?? '';

  return CONSTRAINT_KEYWORDS.has(first);
}

/**
 * Parse the CREATE TABLE body into one ColumnSpec per column, at the same
 * level of detail the descriptor in `SCHEMA` describes. Every property is read
 * from the column's own line and from nothing else: an inline `PRIMARY KEY` is
 * both `notNull` and `unique`, a `serial` type is both `notNull` and
 * `hasDefault` because that is what the shorthand expands to, a
 * `GENERATED ... AS IDENTITY` column is likewise both because the database
 * fills it and refuses a supplied value, a `NOT NULL` or `UNIQUE` keyword sets
 * the matching flag, and a `DEFAULT` sets `hasDefault`.
 *
 * A column that is half of a composite key therefore reads as neither unique
 * nor a key, because its line says neither — the composite is a table-level
 * line, and `parsePrimaryKey` is what covers it. Reading the composite back
 * into its columns would make the descriptor a claim about the table's
 * semantics rather than about its text, and the guard could then no longer be
 * a line-for-line comparison.
 *
 * The type is the token after the name. Every column here is a single-token
 * type; a multi-word one would need this widened, deliberately.
 */
function parseColumns(sql: string, table: string): ColumnSpec[] {
  return bodyLines(tableBody(sql, table))
    .filter((line) => !isConstraintLine(line))
    .map((line) => {
      const tokens = line.split(/\s+/);
      const upper = line.toUpperCase();
      const type = (tokens[1] ?? '').toLowerCase();
      const primaryKey = upper.includes('PRIMARY KEY');
      const serial = /^(?:smallserial|serial2|serial|serial4|bigserial|serial8)$/.test(type);
      const identity = upper.includes('GENERATED') && upper.includes('IDENTITY');

      return {
        name: tokens[0] ?? '',
        type,
        notNull: primaryKey || serial || identity || upper.includes('NOT NULL'),
        hasDefault: serial || identity || upper.includes('DEFAULT'),
        unique: primaryKey || upper.includes('UNIQUE'),
      } satisfies ColumnSpec;
    });
}

/**
 * The primary key's columns in declaration order, from whichever of the two
 * forms the table uses: a parenthesised list on a table-level line, or the
 * `PRIMARY KEY` keyword on a single column's own line.
 */
function parsePrimaryKey(sql: string, table: string): string[] {
  for (const line of bodyLines(tableBody(sql, table))) {
    if (!line.toUpperCase().includes('PRIMARY KEY')) {
      continue;
    }

    const listed = /PRIMARY KEY\s*\(([^)]*)\)/i.exec(line)?.[1];

    return listed === undefined
      ? [line.split(/\s+/)[0] ?? '']
      : listed.split(',').map((column) => column.trim());
  }

  throw new Error(`CREATE TABLE ${table} declares no primary key`);
}

/**
 * The values one column's CHECK constraint admits. The list is found by the
 * `<column> IN (...)` inside the constraint rather than by anchoring on
 * `CHECK (`, because a nullable column writes its constraint as
 * `CHECK (col IS NULL OR col IN (...))` and one pattern should read both
 * forms. Scoping the search to the table's own body is what keeps two tables
 * that share a column name from answering for each other.
 */
function checkedValues(sql: string, table: string, column: string): string[] {
  const body = tableBody(sql, table);
  const listed = new RegExp(`\\b${column}\\s+IN\\s*\\(([^)]*)\\)`).exec(body)?.[1];

  if (listed === undefined) {
    throw new Error(`${table}.${column} has no CHECK ... IN (...) list in its migration`);
  }

  return listed.split(',').map((value) => value.trim().replace(/^'|'$/g, ''));
}

const ID = '00000000-0000-0000-0000-000000000000';
const AT = new Date('2026-01-01T00:00:00.000Z');
// Twelve hours after AT, which is what SESSION_TTL_SECONDS defaults to. An
// expiry is computed by the caller and passed, never defaulted by the
// database, so it is the one timestamp here that is not the row's own.
const EXPIRES_AT = new Date('2026-01-01T12:00:00.000Z');
const BLOCKS = [{ type: 'paragraph', text: 'The quarter in one line.' }];

/**
 * One fully-populated row per table. The mapped key type requires an entry for
 * every table the Database interface names, so a table cannot be added to the
 * schema without the sample that binds its interface to its descriptor — and
 * the sample is what makes a column present in one and missing from the other
 * a failure rather than an oversight.
 */
const SELECTABLE_SAMPLES: { readonly [T in keyof Database]: Selectable<Database[T]> } = {
  accounts: {
    id: ID,
    email: 'investor@example.com',
    name: 'An Investor',
    role: 'investor',
    password_hash: null,
    state: 'invited',
    last_sign_in: null,
    created_at: AT,
    updated_at: AT,
  },
  sessions: {
    id: ID,
    account_id: ID,
    token_hash: '3b8f1c4d90a7e25f6b0d38c1a9e47f52d6c8b013a5f2e97c4d1b6a08f3e5c729',
    created_at: AT,
    last_seen_at: AT,
    expires_at: EXPIRES_AT,
  },
  invitations: {
    id: ID,
    account_id: ID,
    token_hash: 'c41d9f0a7b62e58d3f1a04c96e2b7d85f30c1a6b9e47d258f0c3a1b6d94e7f02',
    expires_at: EXPIRES_AT,
    consumed_at: null,
  },
  content_items: {
    id: ID,
    type: 'report',
    slug: '2026-q3',
    title: 'Third quarter 2026',
    kind: null,
    period: '2026-Q3',
    audience: 'investor',
    current_revision_id: null,
    created_at: AT,
    updated_at: AT,
  },
  content_revisions: {
    id: ID,
    item_id: ID,
    blocks: BLOCKS,
    author_id: null,
    created_at: AT,
    published_at: null,
    version: null,
    search: "'line':4 'one':6 'quarter':2",
  },
  content_locales: {
    revision_id: ID,
    locale: 'vi',
    blocks: BLOCKS,
    state: 'machine',
    reviewed_by: null,
    reviewed_at: null,
  },
  content_grants: {
    item_id: ID,
    account_id: ID,
    granted_at: AT,
    granted_by: null,
    pinned_version: null,
  },
  audit: {
    id: '1',
    at: AT,
    actor_id: ID,
    action: 'account.role_change',
    subject_type: 'account',
    subject_id: ID,
    before: { role: 'investor' },
    after: { role: 'admin' },
  },
  config: {
    key: 'mail.enabled',
    value: 'false',
    previous_value: 'true',
    changed_by: ID,
    changed_at: AT,
  },
  mail_log: {
    id: '1',
    at: AT,
    account_id: ID,
    subject: 'The third quarter report is available',
    kind: 'bulk',
    state: 'accepted',
    queue_id: '2QkP7r0000000001',
    error: null,
  },
  unsubscribes: {
    account_id: ID,
    at: AT,
    source: 'link',
    token: 'k7Qm2s8yQ0Zt1p9r',
    reason: null,
  },
  media: {
    id: ID,
    sha256: '0f7e6a1d3c5b9482e1a4f60d8b3c27a95e4d1f8b6c0a37d2e59b84f1c6a3d0e7',
    mime: 'image/png',
    byte_size: '4',
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    uploaded_by: ID,
    created_at: AT,
  },
  media_refs: {
    media_id: ID,
    item_id: ID,
  },
  portfolio: {
    product: 'verdiq',
    stage: 'building',
    headline: 'The compliance backbone the other five products report through.',
    updated_at: AT,
    updated_by: ID,
  },
};

/**
 * The narrowest row an insert can carry: every column the database fills is
 * left out. That each of these type-checks is the assertion — a column that
 * has a default in the migration and no `Generated` in its interface would not
 * compile here.
 */
const INSERTABLE_SAMPLES: { readonly [T in keyof Database]: Insertable<Database[T]> } = {
  // The row an invitation creates: no password yet, and never signed in. Both
  // are null because the acts that write them have not happened, not because
  // the database fills them.
  accounts: {
    email: 'invited@example.com',
    name: 'An Invitation',
    role: 'investor',
    password_hash: null,
    last_sign_in: null,
  },
  // The row a sign-in writes: an account, the hash of the token that went
  // into the cookie, and when it stops working. The database fills the rest, and
  // last_seen_at starting equal to created_at is what a session that has been
  // used exactly once looks like.
  sessions: {
    account_id: ID,
    token_hash: '7e2a5c1f83b04d69e5c7a2f14b8d306c9f1e5a7b3c0d248e6f9a1b5c7d3e0f82',
    expires_at: EXPIRES_AT,
  },
  // consumed_at is written by the consumption, never by the issue, so it is
  // null here -- and the UPDATE that sets it is what makes the token
  // single-use under two simultaneous posts.
  invitations: {
    account_id: ID,
    token_hash: 'd05b3e8a1c74f296b8e0d3a5c1f74b92e60a8d3c5b1f907e4a2c6d8b0f3e5a71',
    expires_at: EXPIRES_AT,
    consumed_at: null,
  },
  content_items: {
    type: 'report',
    slug: '2026-q4',
    title: 'Fourth quarter 2026',
    kind: null,
    period: '2026-Q4',
    current_revision_id: null,
  },
  content_revisions: {
    item_id: ID,
    blocks: BLOCKS,
    author_id: null,
    published_at: null,
  },
  content_locales: {
    revision_id: ID,
    locale: 'vi',
    blocks: BLOCKS,
    state: 'machine',
    reviewed_by: null,
    reviewed_at: null,
  },
  content_grants: {
    item_id: ID,
    account_id: ID,
    granted_by: null,
  },
  audit: {
    actor_id: ID,
    action: 'content.publish',
    subject_type: 'content_item',
    subject_id: ID,
    before: null,
    after: { current_revision_id: ID },
  },
  config: {
    key: 'room.banner',
    value: 'The fourth quarter report lands on the fifteenth.',
    previous_value: null,
    changed_by: ID,
  },
  // The row a send writes before it is attempted: queued, with no queue id yet
  // and no error. That a `state` of `accepted` is not required here is the
  // point of writing it first.
  mail_log: {
    account_id: ID,
    subject: 'An invitation to the investor room',
    kind: 'transactional',
    state: 'queued',
    queue_id: null,
    error: null,
  },
  unsubscribes: {
    account_id: ID,
    source: 'link',
    token: 'w3Nc5t8yR2Zq0p7v',
  },
  media: {
    sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f900a1b2c3d4e5f60718293a4b5c6d7e8f9',
    mime: 'image/webp',
    byte_size: '4',
    bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    uploaded_by: ID,
  },
  media_refs: {
    media_id: ID,
    item_id: ID,
  },
  portfolio: {
    product: 'farola',
    stage: 'building',
    headline: null,
    updated_by: ID,
  },
};

describe('the hand-written schema', () => {
  it('describes every table the migrations create', () => {
    // The gate that makes the guard cover the schema rather than the tables
    // somebody remembered: a CREATE TABLE with no entry in SCHEMA fails here,
    // and so does an entry naming a table no migration creates.
    const created = readdirSync(MIGRATIONS_DIR)
      .filter((entry) => entry.endsWith('.sql'))
      .flatMap((entry) => [
        ...readFileSync(join(MIGRATIONS_DIR, entry), 'utf8').matchAll(/^CREATE TABLE (\w+) \(/gm),
      ])
      .map((match) => match[1] ?? '');

    expect(created.sort()).toEqual([...TABLES].sort());
  });
});

for (const table of TABLES) {
  describe(`the hand-written ${table} schema`, () => {
    const spec = SCHEMA[table];

    it('matches the migration column for column - name, type, nullability, default, uniqueness', () => {
      // This is the whole point of the hand-written types: the migration is
      // the source of truth, the descriptor is the code's claim about it, and
      // this asserts they agree in every property a query built on the wrong
      // assumption would get wrong.
      expect(parseColumns(migrationFor(table), table)).toEqual([...spec.columns]);
    });

    it('names the primary key the migration declares, in the same order', () => {
      expect(parsePrimaryKey(migrationFor(table), table)).toEqual([...spec.primaryKey]);
    });

    it('gives the interface exactly the columns the descriptor names', () => {
      // Links the Kysely interface's keys to the descriptor at runtime, so a
      // column added to one and not the other is caught. A full Selectable
      // sample must have every key and no more.
      const names = spec.columns.map((column) => column.name);

      expect(Object.keys(SELECTABLE_SAMPLES[table]).sort()).toEqual(names.sort());
    });

    it('leaves the database to fill the columns it defaults', () => {
      const keys = Object.keys(INSERTABLE_SAMPLES[table]);

      for (const column of spec.columns.filter((candidate) => candidate.hasDefault)) {
        expect(keys).not.toContain(column.name);
      }
    });

    it('accepts exactly the values the migration constrains', () => {
      const sql = migrationFor(table);

      for (const [column, values] of Object.entries(spec.checks)) {
        expect([...values]).toEqual(checkedValues(sql, table, column));
      }
    });
  });
}
