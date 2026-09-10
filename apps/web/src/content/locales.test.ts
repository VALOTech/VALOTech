/**
 * Serving a revision in a reader's locale (`CMS-005/T1`, `T2`, `T5`). The
 * assertions are the three states of §3: a reviewed row is served, a machine row
 * is served to nobody and falls through to English, and a language with no
 * reviewed row falls back to the authored English and says so. It needs a
 * database, and it lives in the content module because only there may
 * `content_locales` be named (`CMS-006`).
 *
 * Every case is scoped to the revision it seeds — `localeFor` filters by
 * `revision_id` — so the shared development database is enough and no two cases
 * or suites can read each other's locale rows.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/index';
import type { ContentLocaleState } from '../db/types';
import { createItem, type ContentRevision } from './items';
import { localeFor, type ServedLocale } from './locales';

const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = DATABASE_URL !== '';
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);

interface Seed {
  readonly locale: string;
  readonly state: ContentLocaleState;
  readonly lang: string;
}

describe.skipIf(!HAS_DATABASE)('CMS-005 localeFor', () => {
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
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  /** A revision whose authored blocks are `{lang:"en"}`, plus the locale rows a case needs. */
  async function revisionWithLocales(seeds: readonly Seed[]): Promise<ContentRevision> {
    const item = await createItem({ type: 'update', slug: `u-${randomUUID()}`, title: 'An update' });
    const revision = await getDb()
      .insertInto('content_revisions')
      .values({ item_id: item.id, blocks: sql`'{"lang":"en"}'::jsonb` })
      .returningAll()
      .executeTakeFirstOrThrow();

    for (const { locale, state, lang } of seeds) {
      await getDb()
        .insertInto('content_locales')
        .values({
          revision_id: revision.id,
          locale,
          blocks: sql`${JSON.stringify({ lang })}::jsonb`,
          state,
          reviewed_at: state === 'reviewed' ? sql`now()` : null,
        })
        .execute();
    }

    return revision;
  }

  const langOf = (served: ServedLocale): string => (served.blocks as { lang: string }).lang;

  it('serves a reviewed translation for the reader language', async () => {
    const revision = await revisionWithLocales([{ locale: 'fr', state: 'reviewed', lang: 'fr' }]);

    const served = await localeFor(revision, 'fr');

    expect(served).toMatchObject({ locale: 'fr', fellBack: false });
    expect(langOf(served)).toBe('fr');
  });

  it('serves the authored English for the authored language, with no fallback notice', async () => {
    const revision = await revisionWithLocales([]);

    const served = await localeFor(revision, 'en');

    expect(served).toMatchObject({ locale: 'en', fellBack: false });
    expect(langOf(served)).toBe('en');
  });

  it('serves a machine row to nobody, falling back to English and saying so (CMS-R05)', async () => {
    const revision = await revisionWithLocales([{ locale: 'de', state: 'machine', lang: 'de' }]);

    const served = await localeFor(revision, 'de');

    // The machine German exists but is served to no reader; the reader gets English.
    expect(served).toMatchObject({ locale: 'en', fellBack: true });
    expect(langOf(served)).toBe('en');
  });

  it('falls back to English when the reader language has no row at all', async () => {
    const revision = await revisionWithLocales([]);

    const served = await localeFor(revision, 'nl');

    expect(served).toMatchObject({ locale: 'en', fellBack: true });
    expect(langOf(served)).toBe('en');
  });

  it('drops a region to match the language, so fr-CA takes a reviewed fr', async () => {
    const revision = await revisionWithLocales([{ locale: 'fr', state: 'reviewed', lang: 'fr' }]);

    const served = await localeFor(revision, 'fr-CA');

    expect(served).toMatchObject({ locale: 'fr', fellBack: false });
    expect(langOf(served)).toBe('fr');
  });

  it('does not treat Traditional and Simplified Chinese as one another fallback', async () => {
    const revision = await revisionWithLocales([{ locale: 'zh', state: 'reviewed', lang: 'zh' }]);

    const served = await localeFor(revision, 'zt');

    // zt is a script apart, not a region of zh; with no reviewed zt it is English, never zh.
    expect(served).toMatchObject({ locale: 'en', fellBack: true });
    expect(langOf(served)).toBe('en');
  });
});
