import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Insertable, Selectable } from 'kysely';
import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATES,
  ACCOUNTS_COLUMNS,
  type AccountsTable,
  type ColumnSpec,
  type Database,
} from './types';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

const TABLE_BODY = /CREATE TABLE accounts \(([\s\S]*?)\n\);/;
const ROLE_CHECK = /CHECK \(role IN \(([^)]*)\)\)/;
const STATE_CHECK = /CHECK \(state IN \(([^)]*)\)\)/;

// A line inside CREATE TABLE that starts with one of these is a table-level
// constraint, not a column. Skipping them lets the schema grow the composite
// keys and named checks DATA-001's later tables need, without the guard
// reading the constraint keyword as a column name.
const CONSTRAINT_KEYWORDS = new Set(['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK']);

function accountsMigration(): string {
  const name = readdirSync(MIGRATIONS_DIR).find((entry) => entry.endsWith('_accounts.sql'));

  if (name === undefined) {
    throw new Error(`No migration ending in _accounts.sql under ${MIGRATIONS_DIR}`);
  }

  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

/**
 * Parse the CREATE TABLE body into one ColumnSpec per column, at the same
 * level of detail `ACCOUNTS_COLUMNS` describes. A `PRIMARY KEY` is both
 * `notNull` and `unique`; a `NOT NULL` or `UNIQUE` keyword sets the matching
 * flag; a `DEFAULT` sets `hasDefault`. The type is the token after the name —
 * DATA-001's columns are single-token types (`uuid`, `citext`, `text`,
 * `timestamptz`), and a multi-word type would need this widened, deliberately.
 */
function parseColumns(sql: string): ColumnSpec[] {
  const body = TABLE_BODY.exec(sql)?.[1];

  if (body === undefined) {
    throw new Error('The accounts migration has no CREATE TABLE body to read columns from');
  }

  return body
    .split('\n')
    .map((line) => line.trim().replace(/,\s*$/, ''))
    .filter((line) => line.length > 0 && !line.startsWith('--'))
    .filter((line) => {
      const first = line.split(/\s+/)[0]?.toUpperCase() ?? '';
      return !CONSTRAINT_KEYWORDS.has(first);
    })
    .map((line) => {
      const tokens = line.split(/\s+/);
      const name = tokens[0] ?? '';
      const type = (tokens[1] ?? '').toLowerCase();
      const upper = line.toUpperCase();
      const primaryKey = upper.includes('PRIMARY KEY');
      return {
        name,
        type,
        notNull: primaryKey || upper.includes('NOT NULL'),
        hasDefault: upper.includes('DEFAULT'),
        unique: primaryKey || upper.includes('UNIQUE'),
      } satisfies ColumnSpec;
    });
}

function checkedValues(sql: string, constraint: RegExp): string[] {
  const list = constraint.exec(sql)?.[1];

  if (list === undefined) {
    throw new Error(`The accounts migration has no constraint matching ${String(constraint)}`);
  }

  return list.split(',').map((value) => value.trim().replace(/^'|'$/g, ''));
}

describe('the hand-written accounts schema', () => {
  it('names the table the application queries', () => {
    const table: keyof Database = 'accounts';

    expect(table).toBe('accounts');
  });

  it('matches the migration column for column — name, type, nullability, default, uniqueness', () => {
    // This is the whole point of the hand-written types (INFRA-DEC-06): the
    // migration is the source of truth, ACCOUNTS_COLUMNS is the code's claim
    // about it, and this asserts they agree in every property that a query
    // built on the wrong assumption would get wrong.
    expect(parseColumns(accountsMigration())).toEqual([...ACCOUNTS_COLUMNS]);
  });

  it('gives the interface exactly the columns ACCOUNTS_COLUMNS names', () => {
    // Links the Kysely interface's keys to the descriptor at runtime, so a
    // column added to one and not the other is caught. A full Selectable
    // sample must have every key and no more.
    const account: Selectable<AccountsTable> = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'investor@example.com',
      name: 'An Investor',
      role: 'investor',
      password_hash: null,
      state: 'invited',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    };

    expect(Object.keys(account).sort()).toEqual(ACCOUNTS_COLUMNS.map((c) => c.name).sort());
  });

  it('leaves the database to fill the columns it defaults', () => {
    const invitation: Insertable<AccountsTable> = {
      email: 'invited@example.com',
      name: 'An Invitation',
      role: 'investor',
      password_hash: null,
    };

    for (const column of ACCOUNTS_COLUMNS.filter((c) => c.hasDefault)) {
      expect(Object.keys(invitation)).not.toContain(column.name);
    }
  });

  it('accepts exactly the roles and states the migration constrains', () => {
    const sql = accountsMigration();

    expect([...ACCOUNT_ROLES]).toEqual(checkedValues(sql, ROLE_CHECK));
    expect([...ACCOUNT_STATES]).toEqual(checkedValues(sql, STATE_CHECK));
  });
});
