/**
 * Full-text search over published content (`CMS-007/T1`, `T2`, `T4`, `CMS-R03`,
 * `DATA-R05`).
 *
 * Three properties, all of which fail invisibly if wrong. The generated index
 * covers the text a reader would search by and nothing structural (`T1`). The
 * query is scoped by the reader through the one predicate, so a gated document
 * does not answer to someone who may not read it (`T2`) — the way search leaks.
 * And only the published revision is findable, so a draft, including an admin's
 * own, does not surface through this route (`T4`). All three are claims about
 * what the database returns for a given reader, so the suite runs against a real
 * PostgreSQL on a database of its own, and drives `search` rather than a copy of
 * its query.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../auth/gate';
import { closeDb, getDb } from '../db/index';

import type { Block } from './blocks';
import { addGrant } from './grants';
import { createItem, saveDraft } from './items';
import { publish, withdraw } from './publish';
import { search } from './search';

const RAW_DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const HAS_DATABASE = RAW_DATABASE_URL !== '';

const ISOLATED_DATABASE = 'valotech_content_search';

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

// Distinct nonsense tokens, one per searched field, so a match names the field
// the text came from rather than a word two fields happen to share.
const EVERY_FIELD: Block[] = [
  { type: 'heading', level: 2, text: 'zuluheading' },
  {
    type: 'paragraph',
    text: 'yankeepara',
    marks: [{ start: 0, end: 6, type: 'link', href: 'https://romeohref.test' }],
  },
  { type: 'list', ordered: false, items: ['xraylist', 'plainitem'] },
  { type: 'quote', text: 'whiskeyquote', attribution: null },
  { type: 'figure', mediaId: randomUUID(), caption: 'victorcaption', data: ['romeodata', '20'] },
  { type: 'image', mediaId: randomUUID(), alt: 'unicornalt', caption: null },
];

const heading = (text: string): Block[] => [{ type: 'heading', level: 2, text }];

describe.skipIf(!HAS_DATABASE)('search over published content (CMS-007/T1, T2, T4)', () => {
  let admin: Actor;
  let investorA: Actor;
  let investorB: Actor;

  const id: Record<'fields' | 'public' | 'investor' | 'granted' | 'draft' | 'withDraft' | 'withdrawn', string> = {
    fields: '',
    public: '',
    investor: '',
    granted: '',
    draft: '',
    withDraft: '',
    withdrawn: '',
  };

  async function account(email: string, role: Actor['role']): Promise<Actor> {
    const row = await getDb()
      .insertInto('accounts')
      .values({ email, name: email, role, state: 'active' })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow();
    return { id: row.id, role: row.role };
  }

  async function published(
    slug: string,
    audience: 'public' | 'investor' | 'granted',
    blocks: Block[],
  ): Promise<string> {
    const item = await createItem({ type: 'update', slug: `${slug}-${randomUUID()}`, title: slug, kind: 'progress', audience });
    const revision = await saveDraft(item.id, blocks, admin.id);
    await publish(item.id, revision.id, admin.id);
    return item.id;
  }

  function idsOf(items: { id: string }[]): string[] {
    return items.map((item) => item.id);
  }

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

    admin = await account('search-admin@example.test', 'admin');
    investorA = await account('search-investor-a@example.test', 'investor');
    investorB = await account('search-investor-b@example.test', 'investor');

    id.fields = await published('fields', 'public', EVERY_FIELD);
    id.public = await published('pub', 'public', heading('aardvarkpublic'));
    id.investor = await published('inv', 'investor', heading('belugainvestor'));
    id.granted = await published('grant', 'granted', heading('cheetahgranted'));
    await addGrant(id.granted, investorA.id, admin.id);

    const draftItem = await createItem({ type: 'update', slug: `draft-${randomUUID()}`, title: 'draft', kind: 'progress', audience: 'public' });
    await saveDraft(draftItem.id, heading('dolphindraft'), admin.id);
    id.draft = draftItem.id;

    // A published item that then grows a newer open draft: the published body is
    // findable, the draft body is not — the pointer names the published revision.
    id.withDraft = await published('mixed', 'public', heading('echopublished'));
    await saveDraft(id.withDraft, heading('foxtrotdraft'), admin.id);

    // Published then withdrawn: the pointer is back to null while the revision
    // keeps its published_at. Only the pointer join hides it — the published_at
    // filter would not, which is what makes this the test that isolates the join.
    id.withdrawn = await published('gone', 'public', heading('golfwithdrawn'));
    await withdraw(id.withdrawn, admin.id);
  }, 120_000);

  afterAll(closeDb);

  describe('the index covers the text a reader searches by (T1)', () => {
    it.each([
      ['a heading', 'zuluheading'],
      ['paragraph text', 'yankeepara'],
      ['a list item', 'xraylist'],
      ['a quote', 'whiskeyquote'],
      ['a figure caption', 'victorcaption'],
      ['image alternative text', 'unicornalt'],
    ])('finds an item by %s', async (_field, term) => {
      expect(idsOf(await search(term, admin))).toContain(id.fields);
    });

    it('matches a prefix, the way a half-typed word does', async () => {
      expect(idsOf(await search('zulu', admin))).toContain(id.fields);
    });

    it('does not index a mark href or a figure data cell — only the named text fields', async () => {
      expect(idsOf(await search('romeohref', admin))).not.toContain(id.fields);
      expect(idsOf(await search('romeodata', admin))).not.toContain(id.fields);
    });
  });

  describe('the reader scopes the result through visibleTo (T2)', () => {
    it('shows a public item to everyone, a visitor included', async () => {
      for (const reader of [null, investorA, investorB, admin]) {
        expect(idsOf(await search('aardvarkpublic', reader))).toContain(id.public);
      }
    });

    it('hides an investor item from a visitor and shows it to an investor and an admin', async () => {
      expect(idsOf(await search('belugainvestor', null))).not.toContain(id.investor);
      expect(idsOf(await search('belugainvestor', investorA))).toContain(id.investor);
      expect(idsOf(await search('belugainvestor', admin))).toContain(id.investor);
    });

    it('shows a granted item only to its grantee and an admin', async () => {
      expect(idsOf(await search('cheetahgranted', investorA))).toContain(id.granted);
      expect(idsOf(await search('cheetahgranted', admin))).toContain(id.granted);
      expect(idsOf(await search('cheetahgranted', investorB))).not.toContain(id.granted);
      expect(idsOf(await search('cheetahgranted', null))).not.toContain(id.granted);
    });
  });

  describe('only the published revision is findable (T4)', () => {
    it('does not find an unpublished item, not even for an admin', async () => {
      expect(idsOf(await search('dolphindraft', admin))).not.toContain(id.draft);
      expect(idsOf(await search('dolphindraft', null))).toHaveLength(0);
    });

    it('finds a published body but not the newer open draft of the same item', async () => {
      expect(idsOf(await search('echopublished', admin))).toContain(id.withDraft);
      expect(idsOf(await search('foxtrotdraft', admin))).not.toContain(id.withDraft);
    });

    it('does not find a withdrawn item, whose revision keeps its published_at (the pointer join, not the filter, hides it)', async () => {
      expect(idsOf(await search('golfwithdrawn', admin))).not.toContain(id.withdrawn);
      expect(idsOf(await search('golfwithdrawn', null))).toHaveLength(0);
    });
  });

  describe('an empty query', () => {
    it('matches nothing rather than everything', async () => {
      expect(await search('', admin)).toHaveLength(0);
      expect(await search('   ', admin)).toHaveLength(0);
    });
  });
});
