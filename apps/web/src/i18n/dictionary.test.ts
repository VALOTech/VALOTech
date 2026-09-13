/**
 * The twenty message files, held against each other (`I18N-R01`, `LEGAL-SG-001/T1`).
 *
 * `I18N-002`'s parity gate reads the gateway's static HTML against the gateway's
 * dictionary. Nothing read the application's own — so a key added to `en.json`
 * and forgotten in nineteen others was not refused, it was unseen, and what a
 * reader in that language receives is whatever next-intl does with a key that
 * is not there. A privacy notice is the first surface where that answer matters
 * legally rather than cosmetically, which is why this suite exists now.
 *
 * Three properties, and the third is the one a key-count check would miss.
 * Every file carries the same keys; none of them is empty, because a key present
 * and blank reaches a reader as a blank; and **every ICU placeholder appears in
 * every language**, because a translation that drops `{address}` renders a
 * sentence telling somebody to write to nobody.
 *
 * It reads the files rather than importing them, so a file that stops being
 * valid JSON fails here rather than at the first request in that language.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LOCALES } from './locales';

const MESSAGES = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');

type Tree = { [key: string]: string | Tree };

function read(locale: string): Tree {
  return JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8')) as Tree;
}

/** Every leaf as `namespace.key`, so a nested shape compares as a flat set. */
function paths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const here = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'string' ? [here] : paths(value, here);
  });
}

function leaf(tree: Tree, path: string): string {
  const value = path.split('.').reduce<string | Tree | undefined>(
    (node, step) => (typeof node === 'object' && node !== null ? node[step] : undefined),
    tree,
  );
  return typeof value === 'string' ? value : '';
}

/** The `{name}` placeholders a message carries, which every language must keep. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)/g)].map((match) => match[1] ?? '').sort();
}

const english = read('en');
const keys = paths(english).sort();

describe('the application dictionary', () => {
  it('has a file for every locale the product carries, and no others', () => {
    const files = readdirSync(MESSAGES)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .sort();

    expect(files).toEqual([...LOCALES].sort());
  });

  it('carries the same keys in every language', () => {
    for (const locale of LOCALES) {
      expect({ locale, keys: paths(read(locale)).sort() }).toEqual({ locale, keys });
    }
  });

  it('has nothing blank, because a blank reaches a reader as a blank', () => {
    for (const locale of LOCALES) {
      const tree = read(locale);
      const empty = keys.filter((key) => leaf(tree, key).trim() === '');
      expect({ locale, empty }).toEqual({ locale, empty: [] });
    }
  });

  it('keeps every placeholder in every language', () => {
    for (const locale of LOCALES) {
      const tree = read(locale);
      for (const key of keys) {
        const wanted = placeholders(leaf(english, key));
        if (wanted.length > 0) {
          expect({ locale, key, has: placeholders(leaf(tree, key)) }).toEqual({
            locale,
            key,
            has: wanted,
          });
        }
      }
    }
  });

  it('says where to write, in every language, because a notice naming nobody is not one', () => {
    for (const locale of LOCALES) {
      expect({ locale, has: placeholders(leaf(read(locale), 'privacy.contactBody')) }).toEqual({
        locale,
        has: ['address'],
      });
    }
  });
});
