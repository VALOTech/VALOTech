/**
 * Finding the section the progress board narrates, in a report's blocks
 * (`RPT-001/T4`).
 *
 * Pure: the editor needs a position, not a database. What is pinned here is the
 * part that decides where the board is drawn — an index into the same array the
 * editor renders — and the cases where there is nowhere to draw it, because the
 * suggested structure is a starting point an author may delete or reword
 * (`RPT-001` §3) rather than a schema.
 */

import { describe, expect, it } from 'vitest';

import { type Block } from './blocks';
import { DEFAULT_REPORT_STRUCTURE, STANDS_HEADING, standsSectionAt } from './report-structure';

const heading = (text: string): Block => ({ type: 'heading', level: 2, text });
const sub = (text: string): Block => ({ type: 'heading', level: 3, text });
const para = (text: string): Block => ({ type: 'paragraph', text, marks: [] });

describe('standsSectionAt', () => {
  it('finds the section in the structure a new report opens with', () => {
    const at = standsSectionAt([...DEFAULT_REPORT_STRUCTURE]);

    expect(at).toBe(1);
    expect(DEFAULT_REPORT_STRUCTURE[1]).toEqual(heading(STANDS_HEADING));
  });

  it('counts the blocks of the sections before it, not the sections', () => {
    const blocks = [
      heading('The period in one paragraph'),
      para('a'),
      para('b'),
      sub('an aside'),
      heading(STANDS_HEADING),
      para('VALO Ads is in market.'),
    ];

    // Four blocks precede the heading, and one of them is a level-3 heading that
    // belongs to the first section rather than starting one of its own.
    expect(standsSectionAt(blocks)).toBe(4);
    expect(blocks[4]).toEqual(heading(STANDS_HEADING));
  });

  it('finds it when it opens the report', () => {
    expect(standsSectionAt([heading(STANDS_HEADING), para('a')])).toBe(0);
  });

  it('counts a run of blocks before the first heading, which a draft mid-edit has', () => {
    const blocks = [para('a stray paragraph'), heading(STANDS_HEADING)];

    expect(standsSectionAt(blocks)).toBe(1);
  });

  it('answers null for a report whose author deleted the section', () => {
    const blocks = DEFAULT_REPORT_STRUCTURE.filter(
      (block) => !(block.type === 'heading' && block.text === STANDS_HEADING),
    );

    expect(standsSectionAt([...blocks])).toBeNull();
  });

  it('answers null for a heading reworded, rather than matching something near it', () => {
    expect(standsSectionAt([heading('Where the products stand')])).toBeNull();
    expect(standsSectionAt([heading(STANDS_HEADING.toLowerCase())])).toBeNull();
    expect(standsSectionAt([heading(` ${STANDS_HEADING} `)])).toBeNull();
  });

  it('does not match a heading that is only part of it, which is what typing one looks like', () => {
    // A prefix is the shape a half-typed heading takes, and matching one would
    // move the board under a heading the author has not finished deciding on.
    expect(standsSectionAt([heading('Where each product')])).toBeNull();
    expect(standsSectionAt([heading('Where')])).toBeNull();
    expect(standsSectionAt([heading('')])).toBeNull();
  });

  it('does not match a heading that merely contains it', () => {
    expect(standsSectionAt([heading(`${STANDS_HEADING} today`)])).toBeNull();
    expect(standsSectionAt([heading(`And: ${STANDS_HEADING}`)])).toBeNull();
  });

  it('does not match the heading at level 3, which is content inside a section', () => {
    expect(standsSectionAt([heading('Numbers'), sub(STANDS_HEADING)])).toBeNull();
  });

  it('does not match a paragraph that happens to say it', () => {
    expect(standsSectionAt([para(STANDS_HEADING)])).toBeNull();
  });

  it('answers null for an empty report', () => {
    expect(standsSectionAt([])).toBeNull();
  });

  it('takes the first when a report carries the heading twice', () => {
    const blocks = [heading(STANDS_HEADING), para('a'), heading(STANDS_HEADING)];

    expect(standsSectionAt(blocks)).toBe(0);
  });
});
