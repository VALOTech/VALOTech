/**
 * The pure paths of the paste parser (`CMS-002/T5`): plain text into paragraphs,
 * the HTML-or-text choice, and whether a paste is structure worth importing.
 *
 * `blocksFromHtml` is not exercised here: it needs the browser's `DOMParser`,
 * which the node test environment does not have, so it is driven in a browser
 * against a real paste instead. Every function below is pure and needs neither a
 * DOM nor a database.
 */

import { describe, expect, it } from 'vitest';

import { blocksFromText, isStructured, pasteToBlocks } from './paste';

describe('blocksFromText', () => {
  it('makes one paragraph from one run of text', () => {
    expect(blocksFromText('The quarter closed ahead of plan.')).toEqual([
      { type: 'paragraph', text: 'The quarter closed ahead of plan.', marks: [] },
    ]);
  });

  it('splits a paragraph per blank line', () => {
    expect(blocksFromText('First para.\n\nSecond para.')).toEqual([
      { type: 'paragraph', text: 'First para.', marks: [] },
      { type: 'paragraph', text: 'Second para.', marks: [] },
    ]);
  });

  it('collapses internal newlines and whitespace runs to single spaces', () => {
    expect(blocksFromText('one\ntwo   three')).toEqual([
      { type: 'paragraph', text: 'one two three', marks: [] },
    ]);
  });

  it('trims each run and drops empty ones', () => {
    expect(blocksFromText('  spaced  \n\n\n\n   \n\n  kept  ')).toEqual([
      { type: 'paragraph', text: 'spaced', marks: [] },
      { type: 'paragraph', text: 'kept', marks: [] },
    ]);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(blocksFromText('')).toEqual([]);
    expect(blocksFromText('   \n\t  ')).toEqual([]);
  });
});

describe('pasteToBlocks', () => {
  it('uses the plain text when there is no HTML', () => {
    expect(pasteToBlocks(null, 'plain paste')).toEqual([{ type: 'paragraph', text: 'plain paste', marks: [] }]);
  });

  it('uses the plain text when the HTML is empty or blank', () => {
    expect(pasteToBlocks('', 'plain paste')).toEqual([{ type: 'paragraph', text: 'plain paste', marks: [] }]);
    expect(pasteToBlocks('   ', 'plain paste')).toEqual([{ type: 'paragraph', text: 'plain paste', marks: [] }]);
  });
});

describe('isStructured', () => {
  it('is false for a single plain paragraph — ordinary inline text', () => {
    expect(isStructured([{ type: 'paragraph', text: 'a word', marks: [] }])).toBe(false);
  });

  it('is false for nothing', () => {
    expect(isStructured([])).toBe(false);
  });

  it('is true for more than one block', () => {
    expect(
      isStructured([
        { type: 'paragraph', text: 'one', marks: [] },
        { type: 'paragraph', text: 'two', marks: [] },
      ]),
    ).toBe(true);
  });

  it('is true for a single heading or list', () => {
    expect(isStructured([{ type: 'heading', level: 2, text: 'Title' }])).toBe(true);
    expect(isStructured([{ type: 'list', ordered: false, items: ['one'] }])).toBe(true);
  });

  it('is true for a single paragraph carrying a link', () => {
    expect(
      isStructured([{ type: 'paragraph', text: 'see the report', marks: [{ start: 4, end: 14, type: 'link', href: 'https://valo.example' }] }]),
    ).toBe(true);
  });
});
