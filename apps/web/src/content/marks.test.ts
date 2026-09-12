/**
 * The mark operations (`CMS-002/T4`): applying a mark to a selection, removing
 * one, and moving every offset from one text to the next.
 *
 * These are pure functions over a paragraph's own data, so they need no
 * database and no browser — which is the point of keeping the editor's model the
 * block array (`CMS-002` §3). The offset-maintenance cases below are the ones a
 * live editor produces between renders: a character typed before, inside or at
 * the edge of a marked word, a deletion that shrinks or erases a span, a
 * replacement. Each pins a boundary rule, so a mapping that regressed one edge
 * would redden exactly the case it broke.
 */

import { describe, expect, it } from 'vitest';

import type { Mark } from './blocks';
import { applyMark, remapMarks, removeMark } from './marks';

describe('applyMark', () => {
  it('adds a mark over the selection', () => {
    expect(applyMark([], 'strong', 0, 3)).toEqual([{ start: 0, end: 3, type: 'strong' }]);
  });

  it('applies nothing for an empty or inverted selection', () => {
    expect(applyMark([], 'em', 3, 3)).toEqual([]);
    expect(applyMark([], 'em', 4, 2)).toEqual([]);
  });

  it('applies nothing for a non-integer offset', () => {
    expect(applyMark([], 'em', 0.5, 3)).toEqual([]);
    expect(applyMark([], 'em', -1, 3)).toEqual([]);
  });

  it('unions an overlapping mark of the same type into one span', () => {
    const marks: Mark[] = [{ start: 3, end: 8, type: 'strong' }];
    expect(applyMark(marks, 'strong', 0, 5)).toEqual([{ start: 0, end: 8, type: 'strong' }]);
  });

  it('unions an abutting mark of the same type, so 0..3 and 3..5 become 0..5', () => {
    const marks: Mark[] = [{ start: 0, end: 3, type: 'strong' }];
    expect(applyMark(marks, 'strong', 3, 5)).toEqual([{ start: 0, end: 5, type: 'strong' }]);
  });

  it('is idempotent: applying the same span twice does not duplicate it', () => {
    const once = applyMark([], 'em', 2, 6);
    expect(applyMark(once, 'em', 2, 6)).toEqual(once);
  });

  it('leaves a mark of a different type alone', () => {
    const marks: Mark[] = [{ start: 0, end: 4, type: 'em' }];
    expect(applyMark(marks, 'strong', 0, 4)).toEqual([
      { start: 0, end: 4, type: 'em' },
      { start: 0, end: 4, type: 'strong' },
    ]);
  });

  it('adds a link with its target', () => {
    expect(applyMark([], 'link', 0, 4, 'https://valo.example')).toEqual([
      { start: 0, end: 4, type: 'link', href: 'https://valo.example' },
    ]);
  });

  it('applies no link without a target', () => {
    expect(applyMark([], 'link', 0, 4)).toEqual([]);
    expect(applyMark([], 'link', 0, 4, '   ')).toEqual([]);
  });

  it('clips an existing link out of the new span, so the newest link wins on overlap', () => {
    const marks: Mark[] = [{ start: 0, end: 10, type: 'link', href: 'https://old.example' }];
    expect(applyMark(marks, 'link', 4, 8, 'https://new.example')).toEqual([
      { start: 0, end: 4, type: 'link', href: 'https://old.example' },
      { start: 4, end: 8, type: 'link', href: 'https://new.example' },
      { start: 8, end: 10, type: 'link', href: 'https://old.example' },
    ]);
  });

  it('keeps a non-link mark when a link is applied over it', () => {
    const marks: Mark[] = [{ start: 0, end: 4, type: 'strong' }];
    expect(applyMark(marks, 'link', 0, 4, 'https://valo.example')).toEqual([
      { start: 0, end: 4, type: 'strong' },
      { start: 0, end: 4, type: 'link', href: 'https://valo.example' },
    ]);
  });
});

describe('removeMark', () => {
  it('removes the mark at the index', () => {
    const marks: Mark[] = [
      { start: 0, end: 2, type: 'strong' },
      { start: 4, end: 6, type: 'em' },
    ];
    expect(removeMark(marks, 0)).toEqual([{ start: 4, end: 6, type: 'em' }]);
  });

  it('is a no-op for an index out of range', () => {
    const marks: Mark[] = [{ start: 0, end: 2, type: 'strong' }];
    expect(removeMark(marks, 5)).toEqual(marks);
    expect(removeMark(marks, -1)).toEqual(marks);
  });
});

describe('remapMarks', () => {
  const strong = (start: number, end: number): Mark => ({ start, end, type: 'strong' });

  it('returns the marks unchanged when the text did not change', () => {
    const marks = [strong(1, 4)];
    expect(remapMarks(marks, 'abcdef', 'abcdef')).toBe(marks);
  });

  it('shifts a mark right when text is inserted before it', () => {
    // "def" marked in "abcdef"; delete nothing, insert "XYZ" at the front.
    expect(remapMarks([strong(3, 6)], 'abcdef', 'XYZabcdef')).toEqual([strong(6, 9)]);
  });

  it('leaves a mark unchanged when text is inserted after it', () => {
    expect(remapMarks([strong(0, 3)], 'abcdef', 'abcdefXYZ')).toEqual([strong(0, 3)]);
  });

  it('does not extend a mark when text is inserted exactly at its end', () => {
    // The regression the strict `<` on the end edge guards: "abc" stays "abc".
    expect(remapMarks([strong(0, 3)], 'abcdef', 'abcXdef')).toEqual([strong(0, 3)]);
  });

  it('shifts, not extends, a mark when text is inserted exactly at its start', () => {
    // The regression the strict `<` on the start edge guards: "def" stays "def",
    // the inserted "X" is not swallowed into the mark.
    expect(remapMarks([strong(3, 6)], 'abcdef', 'abcXdef')).toEqual([strong(4, 7)]);
  });

  it('extends a mark when text is inserted inside it', () => {
    // "bcd" marked in "abcdef"; insert "X" at position 2 -> "abXcdef".
    expect(remapMarks([strong(1, 4)], 'abcdef', 'abXcdef')).toEqual([strong(1, 5)]);
  });

  it('shrinks a mark when text inside it is deleted', () => {
    // "abcde" marked; delete "c" at position 2 -> "abde".
    expect(remapMarks([strong(0, 5)], 'abcde', 'abde')).toEqual([strong(0, 4)]);
  });

  it('shifts a mark left when text before it is deleted', () => {
    expect(remapMarks([strong(3, 6)], 'abcdef', 'bcdef')).toEqual([strong(2, 5)]);
  });

  it('drops a mark whose text was entirely deleted', () => {
    // "bc" marked in "abcdef"; delete "bcd" [1,4) -> "aef".
    expect(remapMarks([strong(1, 3)], 'abcdef', 'aef')).toEqual([]);
  });

  it('keeps a mark spanning a replacement of part of its text', () => {
    // "abcde" marked; replace "cde" [2,5) with "XY" -> "abXY".
    expect(remapMarks([strong(0, 5)], 'abcde', 'abXY')).toEqual([strong(0, 4)]);
  });

  it('preserves a link mark and its href across an edit', () => {
    const link: Mark = { start: 3, end: 6, type: 'link', href: 'https://valo.example' };
    expect(remapMarks([link], 'abcdef', 'XYabcdef')).toEqual([
      { start: 5, end: 8, type: 'link', href: 'https://valo.example' },
    ]);
  });

  it('remaps every mark of several, in sorted order, and keeps each within the new text', () => {
    const marks: Mark[] = [
      { start: 0, end: 2, type: 'strong' },
      { start: 4, end: 7, type: 'em' },
    ];
    // Insert "XX" at position 3 (between the two marks): the first is untouched,
    // the second shifts right by two.
    const remapped = remapMarks(marks, 'abcdefgh', 'abcXXdefgh');
    expect(remapped).toEqual([
      { start: 0, end: 2, type: 'strong' },
      { start: 6, end: 9, type: 'em' },
    ]);
    for (const mark of remapped) {
      expect(mark.start).toBeGreaterThanOrEqual(0);
      expect(mark.end).toBeLessThanOrEqual('abcXXdefgh'.length);
      expect(mark.start).toBeLessThan(mark.end);
    }
  });

  it('handles the whole text being cleared', () => {
    expect(remapMarks([strong(0, 3)], 'abc', '')).toEqual([]);
  });
});
