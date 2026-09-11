/**
 * The destructive-action registry and the typed-name gate (`ADMIN-002/T3`).
 *
 * Two things are pinned here, and neither is reachable from the component in this
 * suite: the test environment is Node, there is no DOM, and a React renderer is
 * not a dependency of this application. So the gate the confirmation turns on is
 * a function rather than a piece of the component, and it is tested as one — what
 * a browser adds on top is the focus move and the rendering, which `ADMIN-001/T2`
 * drives in a real browser.
 *
 * The first is the comparison itself, and every way a lenient one fails open: an
 * empty field, an empty subject, a prefix of the name, the name with a word added,
 * the right letters in the wrong case.
 *
 * The second is that the registry's three final acts are exactly the three the
 * design names, asserted as a set rather than one at a time — so an act added to
 * the console with nothing to undo it cannot reach the list without a deliberate
 * edit here, which is the whole reason the list is in one place.
 */

import { describe, expect, it } from 'vitest';

import {
  DESTRUCTIVE_ACTIONS,
  type DestructiveActionId,
  requiresTypedName,
  typedNameMatches,
} from './destructive-actions';

const IDS = Object.keys(DESTRUCTIVE_ACTIONS) as DestructiveActionId[];

describe('typedNameMatches (ADMIN-002/T3)', () => {
  it('is true for the name exactly', () => {
    expect(typedNameMatches('Ada Lovelace', 'Ada Lovelace')).toBe(true);
  });

  it('forgives surrounding whitespace, which a paste carries and which names nothing', () => {
    expect(typedNameMatches('  Ada Lovelace\n', 'Ada Lovelace')).toBe(true);
    expect(typedNameMatches('Ada Lovelace', ' Ada Lovelace ')).toBe(true);
  });

  it('is false for an empty field, so the gate starts closed', () => {
    expect(typedNameMatches('', 'Ada Lovelace')).toBe(false);
    expect(typedNameMatches('   ', 'Ada Lovelace')).toBe(false);
  });

  it('is false for an empty subject, whatever is typed, including nothing', () => {
    // The one case a plain equality would get backwards: with no name to match,
    // an empty field would equal an empty subject and a final act would be armed
    // on a page that never named what it was acting on.
    expect(typedNameMatches('', '')).toBe(false);
    expect(typedNameMatches('  ', '   ')).toBe(false);
    expect(typedNameMatches('anything', '')).toBe(false);
  });

  it('is false for a prefix, a superset, and the wrong case', () => {
    expect(typedNameMatches('Ada', 'Ada Lovelace')).toBe(false);
    expect(typedNameMatches('Ada Lovelace the first', 'Ada Lovelace')).toBe(false);
    expect(typedNameMatches('ada lovelace', 'Ada Lovelace')).toBe(false);
  });

  it('is false when only the inner spacing differs, which is a different name', () => {
    expect(typedNameMatches('Ada  Lovelace', 'Ada Lovelace')).toBe(false);
  });
});

describe('the registry (ADMIN-002/T3)', () => {
  it('demands a typed name for exactly the three acts nothing undoes', () => {
    expect(IDS.filter(requiresTypedName).sort()).toEqual([
      'account.delete',
      'mail.send',
      'media.delete',
    ]);
  });

  it('lets a reversible act be confirmed without typing, which is what suspension is', () => {
    expect(requiresTypedName('account.suspend')).toBe(false);
  });

  it('gives every act a verb and a consequence to state, and every reversible one its undo', () => {
    for (const id of IDS) {
      const { verb, consequence, reversal } = DESTRUCTIVE_ACTIONS[id];

      expect(verb.trim(), id).not.toBe('');
      expect(consequence.trim(), id).not.toBe('');
      // A reversible act whose undo is blank would print an empty line where the
      // panel says what takes the act back, which is the sentence that separates
      // a suspension from a deletion on screen.
      if (reversal.kind === 'reversible') {
        expect(reversal.undo.trim(), id).not.toBe('');
      }
    }
  });
});
