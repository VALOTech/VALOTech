/**
 * The content model (`CMS-001`): the block validator in isolation, and the
 * item/revision writes against a real PostgreSQL.
 *
 * The validator tests are pure and always run. The write tests need a database
 * — `DATABASE_URL` names a development target — and prove the two properties the
 * schema cannot: that a draft's body round-trips through `jsonb` as the array it
 * was, and that two saves racing for one item leave one open draft rather than
 * two (the item-row lock).
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import type { AuditAction } from '../db/types';
import { type Block, BlockValidationError, validateBlocks } from './blocks';
import { createItem, saveDraft } from './items';
import { publish, withdraw } from './publish';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

const VALID: Block[] = [
  { type: 'heading', level: 2, text: 'A heading' },
  {
    type: 'paragraph',
    text: 'hello world',
    marks: [
      { start: 0, end: 5, type: 'strong' },
      { start: 6, end: 11, type: 'link', href: 'https://valotech.org' },
    ],
  },
  { type: 'list', ordered: true, items: ['one', 'two'] },
  { type: 'quote', text: 'a quote', attribution: null },
  { type: 'image', mediaId: randomUUID(), alt: 'a labelled picture', caption: null },
  { type: 'figure', mediaId: randomUUID(), caption: 'a chart', data: ['10', '20'] },
  { type: 'divider' },
];

describe('validateBlocks', () => {
  it('returns every block of a valid document, typed', () => {
    expect(validateBlocks(VALID)).toEqual(VALID);
  });

  it.each([
    ['a value that is not an array', 'nope'],
    ['an unknown block type', [{ type: 'marquee', text: 'x' }]],
    ['a heading at level 1 (the title is not a block)', [{ type: 'heading', level: 1, text: 'x' }]],
    ['an image with empty alt text', [{ type: 'image', mediaId: 'm', alt: '', caption: null }]],
    ['an image with whitespace-only alt text', [{ type: 'image', mediaId: 'm', alt: '   ', caption: null }]],
    ['a figure whose data is not an array', [{ type: 'figure', mediaId: 'm', caption: null, data: 'x' }]],
    ['a mark reaching past the text', [{ type: 'paragraph', text: 'hi', marks: [{ start: 0, end: 5, type: 'em' }] }]],
    ['a mark whose start is not before its end', [{ type: 'paragraph', text: 'hi', marks: [{ start: 2, end: 1, type: 'em' }] }]],
    ['an unknown mark type', [{ type: 'paragraph', text: 'hi', marks: [{ start: 0, end: 1, type: 'blink' }] }]],
    ['a link mark with no href', [{ type: 'paragraph', text: 'hi', marks: [{ start: 0, end: 1, type: 'link' }] }]],
    ['a non-link mark carrying an href', [{ type: 'paragraph', text: 'hi', marks: [{ start: 0, end: 1, type: 'em', href: 'x' }] }]],
  ])('rejects %s', (_case, value) => {
    expect(() => validateBlocks(value)).toThrow(BlockValidationError);
  });

  it('names the block index and the field in the message it throws (CMS-002/T7)', () => {
    // The index and the field together are what make a refusal actionable
    // rather than "invalid document"; the editor and the save route both rely
    // on this shape.
    expect(() => validateBlocks([{ type: 'image', mediaId: 'm', alt: '', caption: null }])).toThrow(
      /^blocks\[0\]: an image requires non-empty alt text/,
    );
    // The index is the faulty block's real position, not always the first.
    expect(() =>
      validateBlocks([{ type: 'divider' }, { type: 'image', mediaId: 'm', alt: '', caption: null }]),
    ).toThrow(/^blocks\[1\]:/);
    // A fault inside a block is named down to the field.
    expect(() => validateBlocks([{ type: 'heading', level: 2, text: 5 }])).toThrow(/^blocks\[0\]\.text:/);
  });
});

describe.skipIf(!HAS_DATABASE)('CMS-001 content model', () => {
  let authorId: string;

  beforeAll(async () => {
    await runner({
      databaseUrl: DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
      advisoryLockMode: 'wait',
    });
    await getDb().deleteFrom('accounts').where('email', '=', 'cms-author@example.test').execute();
    const author = await getDb()
      .insertInto('accounts')
      .values({ email: 'cms-author@example.test', name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(async () => {
    await getDb().deleteFrom('accounts').where('id', '=', authorId).execute();
    await closeDb();
  });

  async function revisionsOf(itemId: string) {
    return getDb().selectFrom('content_revisions').selectAll().where('item_id', '=', itemId).execute();
  }

  describe('createItem', () => {
    it('creates an item with no published revision, so a reader query finds nothing yet', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'An update', kind: 'progress' });

      expect(item.current_revision_id).toBeNull();
      expect(item.audience).toBe('investor');
    });

    it('refuses a report with no period, in the database', async () => {
      await expect(
        createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'A report' }),
      ).rejects.toThrow();
    });

    it('refuses a kind on an item that is not an update', async () => {
      await expect(
        createItem({ type: 'report', slug: `r-${randomUUID()}`, title: 'A report', period: '2026-Q1', kind: 'progress' }),
      ).rejects.toThrow();
    });
  });

  describe('saveDraft', () => {
    it('stores a draft whose blocks round-trip through jsonb as the array they were', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Draft round-trip', kind: 'announcement' });

      const revision = await saveDraft(item.id, VALID, authorId);

      expect(revision.published_at).toBeNull();
      // Read back independently: pg parses jsonb to a JS value, so the array
      // stored is the array that comes back, not a string of it.
      const [stored] = await revisionsOf(item.id);
      expect(stored?.blocks).toEqual(VALID);
    });

    it('replaces the open draft rather than accumulating a revision per save', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Replace draft', kind: 'progress' });

      const first = await saveDraft(item.id, [{ type: 'divider' }], authorId);
      const second = await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'Changed' }], authorId);

      const rows = await revisionsOf(item.id);
      expect(rows).toHaveLength(1);
      expect(second.id).toBe(first.id);
      expect(rows[0]?.blocks).toEqual([{ type: 'heading', level: 2, text: 'Changed' }]);
    });

    it('refuses an invalid document, writing no revision', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Invalid draft', kind: 'progress' });

      await expect(saveDraft(item.id, [{ type: 'marquee' }], authorId)).rejects.toThrow(BlockValidationError);
      expect(await revisionsOf(item.id)).toHaveLength(0);
    });

    it('leaves one open draft when two saves race for one item', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Racing draft', kind: 'progress' });
      // Warm two connections so both saves are genuinely in flight, the way the
      // invitation race is proved: without the item-row lock each would miss the
      // other's insert and the item would hold two open drafts.
      await Promise.all([sql`select 1`.execute(getDb()), sql`select 1`.execute(getDb())]);

      await Promise.all([
        saveDraft(item.id, [{ type: 'divider' }], authorId),
        saveDraft(item.id, [{ type: 'heading', level: 3, text: 'B' }], authorId),
      ]);

      expect(await revisionsOf(item.id)).toHaveLength(1);
    });
  });

  describe('publish and withdraw', () => {
    async function pointerOf(itemId: string): Promise<string | null> {
      const row = await getDb()
        .selectFrom('content_items')
        .select('current_revision_id')
        .where('id', '=', itemId)
        .executeTakeFirstOrThrow();
      return row.current_revision_id;
    }

    async function auditCount(itemId: string, action: AuditAction): Promise<number> {
      const rows = await getDb()
        .selectFrom('audit')
        .select('id')
        .where('subject_id', '=', itemId)
        .where('action', '=', action)
        .execute();
      return rows.length;
    }

    it('moves the pointer to the revision and records the publish', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'To publish', kind: 'progress' });
      const draft = await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'Live' }], authorId);

      const published = await publish(item.id, draft.id, authorId);

      expect(published.current_revision_id).toBe(draft.id);
      const [rev] = await revisionsOf(item.id);
      expect(rev?.published_at).not.toBeNull();
      expect(await auditCount(item.id, 'content.publish')).toBe(1);
    });

    it('re-validates the body, refusing an invalid revision and recording nothing', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Invalid publish', kind: 'progress' });
      // A revision inserted past saveDraft's validator, the way a direct write or
      // a tightened validator would leave one.
      const bad = await getDb()
        .insertInto('content_revisions')
        .values({ item_id: item.id, blocks: sql`'[{"type":"marquee"}]'::jsonb`, author_id: authorId })
        .returning('id')
        .executeTakeFirstOrThrow();

      await expect(publish(item.id, bad.id, authorId)).rejects.toThrow();
      // Nothing moved and nothing was recorded: the audit and the pointer move
      // share the transaction that rolled back.
      expect(await pointerOf(item.id)).toBeNull();
      expect(await auditCount(item.id, 'content.publish')).toBe(0);
    });

    it('withdraws to the previously published revision, then to nothing, recording each', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Withdraw walk', kind: 'progress' });
      const r1 = await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'One' }], authorId);
      await publish(item.id, r1.id, authorId);
      const r2 = await saveDraft(item.id, [{ type: 'heading', level: 2, text: 'Two' }], authorId);
      await publish(item.id, r2.id, authorId);
      expect(await pointerOf(item.id)).toBe(r2.id);

      await withdraw(item.id, authorId);
      expect(await pointerOf(item.id)).toBe(r1.id);

      await withdraw(item.id, authorId);
      expect(await pointerOf(item.id)).toBeNull();

      // Withdrawal is a pointer move, not a delete: both revisions survive.
      expect(await revisionsOf(item.id)).toHaveLength(2);
      expect(await auditCount(item.id, 'content.withdraw')).toBe(2);
    });

    it('refuses to withdraw an item that shows nothing', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Nothing to withdraw', kind: 'progress' });

      await expect(withdraw(item.id, authorId)).rejects.toThrow();
    });
  });
});
