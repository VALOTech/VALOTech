/**
 * What a preview shows, and to whom (`CMS-004/T1`, `CMS-004/T2`), against a
 * real PostgreSQL.
 *
 * A preview differs from what a reader gets in **exactly one way** — it takes
 * the latest revision rather than the published one — so the suite's job is to
 * prove that the other three things are the reader's and not the preview's.
 *
 * **The audience is evaluated, never bypassed.** Previewing an investor-only
 * item as a visitor must show what a visitor gets, which is nothing. That is the
 * assertion that matters most here: the failure it guards is a preview telling
 * an admin the audience is fine when it is not, discovered after publication.
 *
 * **A generic investor holds no grants**, so a `granted` item admits none of
 * them — and an admin previewing one is told so rather than shown the document.
 *
 * **The locale falls back the way a reader's does**, through the same function,
 * so what the preview renders in an unreviewed language is what a reader gets.
 *
 * On a database of its own: the audience assertions are about which items exist
 * with which audience, and a shared database carries other suites' items.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ContentAudience } from '../db/types';
import { closeDb, getDb } from '../db/index';
import type { Block } from './blocks';
import { createItem, saveDraft } from './items';
import { markReviewed, seedLocale } from './locales';
import { isReadingRole, previewFor } from './preview';
import { publish } from './publish';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_preview';

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const ISOLATED_DATABASE_URL = HAS_DATABASE ? withDatabase(RAW_DATABASE_URL, ISOLATED_DATABASE) : '';

if (HAS_DATABASE) {
  process.env.DATABASE_URL = ISOLATED_DATABASE_URL;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

async function recreateIsolatedDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: RAW_DATABASE_URL, ssl: false });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${ISOLATED_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${ISOLATED_DATABASE}`);
  } finally {
    await admin.end();
  }
}

const words = (text: string): Block[] => [{ type: 'heading', level: 2, text }];

describe.skipIf(!HAS_DATABASE)('CMS-004/T1 — what a preview shows', () => {
  let authorId: string;

  beforeAll(async () => {
    await recreateIsolatedDatabase();
    await runner({
      databaseUrl: ISOLATED_DATABASE_URL,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction: 'up',
      count: Infinity,
      log: () => {},
    });
    const author = await getDb()
      .insertInto('accounts')
      .values({ email: 'author@preview.test', name: 'Author', role: 'admin', state: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    authorId = author.id;
  }, 120_000);

  afterAll(closeDb);

  async function itemWith(audience: ContentAudience, text = 'What is written') {
    const item = await createItem({
      type: 'update',
      slug: `u-${randomUUID()}`,
      title: 'An update',
      kind: 'progress',
      audience,
    });
    const revision = await saveDraft(item.id, words(text), authorId);

    return { itemId: item.id, revisionId: revision.id };
  }

  const headingOf = (blocks: readonly Block[] | null): string | null =>
    blocks === null ? null : ((blocks[0] as { text?: string }).text ?? null);

  describe('the one way it differs', () => {
    it('shows the unpublished latest revision, and says it is unpublished', async () => {
      const { itemId, revisionId } = await itemWith('public');

      const preview = await previewFor(itemId, 'admin', 'en');

      expect(preview).toMatchObject({ revisionId, published: false, admitted: true });
      expect(headingOf(preview?.blocks ?? null)).toBe('What is written');
    });

    it('says so when the latest revision is the one readers already have', async () => {
      const { itemId, revisionId } = await itemWith('public');
      await publish(itemId, revisionId, authorId);

      expect(await previewFor(itemId, 'admin', 'en')).toMatchObject({ published: true });
    });

    it('shows a newer draft rather than the published revision behind it', async () => {
      const { itemId, revisionId } = await itemWith('public', 'The published words');
      await publish(itemId, revisionId, authorId);
      await saveDraft(itemId, words('The newer words'), authorId);

      const preview = await previewFor(itemId, 'admin', 'en');

      expect(headingOf(preview?.blocks ?? null)).toBe('The newer words');
      expect(preview?.published).toBe(false);
    });

    it('is null for an item that does not exist, and for one with nothing written', async () => {
      const empty = await createItem({
        type: 'update',
        slug: `u-${randomUUID()}`,
        title: 'Empty',
        kind: 'progress',
      });

      expect(await previewFor(randomUUID(), 'admin', 'en')).toBeNull();
      expect(await previewFor(empty.id, 'admin', 'en')).toBeNull();
    });
  });

  describe('the audience is evaluated, never bypassed', () => {
    it('shows a public item to every role', async () => {
      const { itemId } = await itemWith('public');

      for (const role of ['admin', 'investor', 'public'] as const) {
        expect(await previewFor(itemId, role, 'en')).toMatchObject({ admitted: true });
      }
    });

    it('shows an investor item to an investor and to nobody outside', async () => {
      const { itemId } = await itemWith('investor');

      expect(await previewFor(itemId, 'investor', 'en')).toMatchObject({ admitted: true });
      // A visitor sees nothing, and the preview says nothing rather than
      // showing the document with a caveat.
      const asVisitor = await previewFor(itemId, 'public', 'en');
      expect(asVisitor).toMatchObject({ admitted: false, blocks: null });
    });

    it('shows a granted item to neither a visitor nor a generic investor', async () => {
      const { itemId } = await itemWith('granted');

      expect(await previewFor(itemId, 'investor', 'en')).toMatchObject({ admitted: false, blocks: null });
      expect(await previewFor(itemId, 'public', 'en')).toMatchObject({ admitted: false, blocks: null });
      // The admin doing the previewing still reads it, which is how they see
      // the document they are about to grant.
      expect(await previewFor(itemId, 'admin', 'en')).toMatchObject({ admitted: true });
    });
  });

  describe('the locale is the reader’s own fallback', () => {
    it('serves a reviewed translation for the language asked for', async () => {
      const { itemId } = await itemWith('public', 'The English');
      await seedLocale(itemId, 'vi');
      await markReviewed(itemId, 'vi', [['Tiếng Việt']], authorId);

      const preview = await previewFor(itemId, 'admin', 'vi');

      expect(preview).toMatchObject({ locale: 'vi', fellBack: false });
      expect(headingOf(preview?.blocks ?? null)).toBe('Tiếng Việt');
    });

    it('falls back to the authored language when the translation is not reviewed, and says so', async () => {
      const { itemId } = await itemWith('public', 'The English');
      await seedLocale(itemId, 'vi');

      const preview = await previewFor(itemId, 'admin', 'vi');

      // A seeded row is served to nobody (`CMS-R05`), so the preview shows
      // exactly what a Vietnamese reader would get: the English, and a notice.
      expect(preview).toMatchObject({ locale: 'en', fellBack: true });
      expect(headingOf(preview?.blocks ?? null)).toBe('The English');
    });

    it('does not fall back for the authored language itself', async () => {
      const { itemId } = await itemWith('public');

      expect(await previewFor(itemId, 'admin', 'en')).toMatchObject({
        locale: 'en',
        fellBack: false,
      });
    });
  });

  describe('the roles a preview offers', () => {
    it('names exactly three, and nothing else', () => {
      expect(isReadingRole('admin')).toBe(true);
      expect(isReadingRole('investor')).toBe(true);
      expect(isReadingRole('public')).toBe(true);
      // A crafted `as=` cannot widen what is shown: anything else is refused by
      // the page rather than guessed at (`CMS-004/T2`).
      for (const value of ['superadmin', 'granted', 'Admin', '', 'investor ']) {
        expect(isReadingRole(value)).toBe(false);
      }
    });
  });
});
