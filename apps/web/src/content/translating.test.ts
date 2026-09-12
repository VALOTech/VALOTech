/**
 * Starting a translation and marking it reviewed (`CMS-005/T3`, `CMS-005/T4`).
 *
 * `locales.test.ts` is the other half — what a *reader* gets. This one is what an
 * *admin* does: seed a locale from the source, translate the strings, and mark
 * the language reviewed. The three properties worth pinning are the ones a screen
 * cannot show you.
 *
 * **A seed is the source, exactly.** The room runs no translation service
 * (`CMS-DEC-04`), so a seeded row holds the English with its marks and its
 * pictures intact — and holds it in the state that is served to nobody.
 *
 * **A review changes words and nothing else.** The caller sends strings and the
 * document is rebuilt here from the source, so no body can give one language a
 * different structure or a different picture from the others.
 *
 * **A translation does not outlive its text.** `saveDraft` replaces the open
 * draft rather than adding a revision, so a translation of it would otherwise
 * keep its `reviewed` state over words that have moved — and be served
 * (`CMS-R05`) in a language nobody here reads back.
 *
 * Every case is scoped to the item it creates, so the shared development
 * database is enough.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import type { Block } from './blocks';
import { createItem, saveDraft } from './items';
import { localeDraft, localeFor, markReviewed, seedLocale } from './locales';
import { publish } from './publish';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

const SUITE_EMAIL = 'translating@example.test';

/**
 * A marked paragraph and a list: the two shapes a rebuild can break. The mark
 * cuts the paragraph into two fields — the bold phrase and the rest — which is
 * how a translator keeps emphasis on the words that carry it (`translation.ts`).
 */
const SOURCE: Block[] = [
  { type: 'heading', level: 2, text: 'This quarter' },
  {
    type: 'paragraph',
    text: 'hello world',
    marks: [{ start: 0, end: 5, type: 'strong' }],
  },
  { type: 'list', ordered: false, items: ['first', 'second'] },
  { type: 'divider' },
];

describe.skipIf(!HAS_DATABASE)('CMS-005 — starting and reviewing a translation', () => {
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
    await getDb().deleteFrom('accounts').where('email', '=', SUITE_EMAIL).execute();
    const author = await getDb()
      .insertInto('accounts')
      .values({ email: SUITE_EMAIL, name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(async () => {
    await getDb().deleteFrom('accounts').where('id', '=', authorId).execute();
    await closeDb();
  });

  /** An item carrying `SOURCE` as its open draft. */
  async function itemWithDraft(blocks: Block[] = SOURCE) {
    const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'An update' });
    const revision = await saveDraft(item.id, blocks, authorId);

    return { itemId: item.id, revisionId: revision.id };
  }

  async function localeRow(revisionId: string, locale: string) {
    return getDb()
      .selectFrom('content_locales')
      .select(['blocks', 'state', 'reviewed_by', 'reviewed_at'])
      .where('revision_id', '=', revisionId)
      .where('locale', '=', locale)
      .executeTakeFirst();
  }

  describe('seeding a locale (T3)', () => {
    it('copies the source into the locale, marks and all, in the state served to nobody', async () => {
      const { itemId, revisionId } = await itemWithDraft();

      expect(await seedLocale(itemId, 'vi')).toEqual({ ok: true, revisionId });

      const row = await localeRow(revisionId, 'vi');
      expect(row?.state).toBe('machine');
      expect(row?.reviewed_at).toBeNull();
      // The copy is the database's, so what lands is the document byte for byte:
      // the mark keeps its offsets and the list keeps its items.
      expect(row?.blocks).toEqual(SOURCE);
    });

    it('refuses a language already started, rather than overwriting a translation', async () => {
      const { itemId, revisionId } = await itemWithDraft();
      await seedLocale(itemId, 'vi');
      await markReviewed(itemId, 'vi', [[], ['xin chào', ' thế giới'], [], []], authorId);

      expect(await seedLocale(itemId, 'vi')).toEqual({ ok: false, reason: 'already-started' });

      const row = await localeRow(revisionId, 'vi');
      expect((row?.blocks as Block[])[1]).toMatchObject({ text: 'xin chào thế giới' });
      expect(row?.state).toBe('reviewed');
    });

    it('refuses an item with nothing written yet', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Empty' });

      expect(await seedLocale(item.id, 'vi')).toEqual({ ok: false, reason: 'no-revision' });
    });

    it('seeds the open draft rather than the revision published behind it', async () => {
      const { itemId, revisionId } = await itemWithDraft();
      await publish(itemId, revisionId, authorId);
      const later = await saveDraft(
        itemId,
        [{ type: 'heading', level: 2, text: 'Next quarter' }],
        authorId,
      );

      expect(await seedLocale(itemId, 'vi')).toEqual({ ok: true, revisionId: later.id });
      expect(await localeRow(revisionId, 'vi')).toBeUndefined();
    });
  });

  describe('a translation does not outlive its text', () => {
    it('drops the locale rows when the draft under them is saved again', async () => {
      const { itemId, revisionId } = await itemWithDraft();
      await seedLocale(itemId, 'vi');
      await markReviewed(itemId, 'vi', [[], ['xin chào', ' thế giới'], [], []], authorId);

      await saveDraft(itemId, [{ type: 'heading', level: 2, text: 'Rewritten' }], authorId);

      // The revision is the same row — `saveDraft` replaces the open draft — so
      // nothing else would have removed a translation of the previous words.
      expect(await localeRow(revisionId, 'vi')).toBeUndefined();
    });
  });

  describe('the review screen’s read (T4)', () => {
    it('hands back the source beside the translation, with the state', async () => {
      const { itemId, revisionId } = await itemWithDraft();
      await seedLocale(itemId, 'vi');

      const draft = await localeDraft(itemId, 'vi');

      expect(draft).toMatchObject({ revisionId, published: false, state: 'machine' });
      expect(draft?.source).toEqual(SOURCE);
      expect(draft?.translation).toEqual(SOURCE);
    });

    it('is null for a language nobody has started', async () => {
      const { itemId } = await itemWithDraft();

      expect(await localeDraft(itemId, 'vi')).toBeNull();
    });

    it('is null for an item with nothing written yet', async () => {
      const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'Empty' });

      expect(await localeDraft(item.id, 'vi')).toBeNull();
    });
  });

  describe('marking a locale reviewed (T4)', () => {
    it('stores the words, records who read them, and serves it from then on', async () => {
      const { itemId, revisionId } = await itemWithDraft();
      await seedLocale(itemId, 'vi');

      const outcome = await markReviewed(
        itemId,
        'vi',
        [['Quý này'], ['xin chào', ' thế giới'], ['thứ nhất', 'thứ hai'], []],
        authorId,
      );

      expect(outcome).toEqual({ ok: true, revisionId });
      const row = await localeRow(revisionId, 'vi');
      expect(row?.state).toBe('reviewed');
      expect(row?.reviewed_by).toBe(authorId);
      expect(row?.reviewed_at).not.toBeNull();
      expect(row?.blocks).toEqual([
        { type: 'heading', level: 2, text: 'Quý này' },
        // The bold phrase was its own field, so the emphasis lands on the eight
        // characters that translate it rather than spreading over the sentence —
        // which is what carrying the offsets across would have done.
        { type: 'paragraph', text: 'xin chào thế giới', marks: [{ start: 0, end: 8, type: 'strong' }] },
        { type: 'list', ordered: false, items: ['thứ nhất', 'thứ hai'] },
        { type: 'divider' },
      ]);
    });

    it('keeps the structure the source has, whatever the caller sends', async () => {
      const { itemId, revisionId } = await itemWithDraft();
      await seedLocale(itemId, 'vi');

      // Four blocks in the source; a caller sending values for six, and extra
      // values inside a block, changes nothing but the words that exist.
      await markReviewed(
        itemId,
        'vi',
        [['Quý này', 'ignored'], ['translated'], ['một', 'hai', 'ba'], ['nothing here'], ['extra'], ['extra']],
        authorId,
      );

      const blocks = (await localeRow(revisionId, 'vi'))?.blocks as Block[];
      expect(blocks).toHaveLength(4);
      expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'list', 'divider']);
      expect(blocks[2]).toMatchObject({ items: ['một', 'hai'] });
    });

    it('refuses a language nobody started, leaving no row behind', async () => {
      const { itemId, revisionId } = await itemWithDraft();

      expect(await markReviewed(itemId, 'vi', [[], [], [], []], authorId)).toEqual({
        ok: false,
        reason: 'not-started',
      });
      expect(await localeRow(revisionId, 'vi')).toBeUndefined();
    });

    it('is what makes the language reach a reader', async () => {
      const { itemId, revisionId } = await itemWithDraft();
      await seedLocale(itemId, 'vi');

      const revision = await getDb()
        .selectFrom('content_revisions')
        .selectAll()
        .where('id', '=', revisionId)
        .executeTakeFirstOrThrow();

      // Seeded and not reviewed: served to nobody, so a Vietnamese reader gets
      // the authored English and is told so (`CMS-R05`, `I18N-R04`).
      expect(await localeFor(revision, 'vi')).toMatchObject({ locale: 'en', fellBack: true });

      await markReviewed(itemId, 'vi', [['Quý này'], ['xin chào', ' thế giới'], ['một', 'hai'], []], authorId);

      expect(await localeFor(revision, 'vi')).toMatchObject({ locale: 'vi', fellBack: false });
    });
  });
});
