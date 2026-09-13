/**
 * Deriving a deck's sections, and stripping speaker context — both pure
 * (`DECK-001/T1`, `DECK-001/T5`).
 *
 * The derivation's load-bearing property is that it loses nothing: the block
 * array is the single source, so concatenating the sections must reproduce it.
 * The strip's is that an investor read never carries speaker context. Neither
 * touches the database, so both are proven here in isolation.
 */

import { describe, expect, it } from 'vitest';

import type { JsonValue } from '../db/types';

import { type Block, withSpeakerContext, withoutSpeakerContext } from './blocks';
import { cardsOf, deriveSections, reorderSections, totalsOf } from './sections';

const heading = (text: string, context?: string): Block =>
  context === undefined ? { type: 'heading', level: 2, text } : { type: 'heading', level: 2, text, context };
const sub = (text: string): Block => ({ type: 'heading', level: 3, text });
const para = (text: string): Block => ({ type: 'paragraph', text, marks: [] });

describe('deriveSections', () => {
  it('returns nothing for an empty deck', () => {
    expect(deriveSections([])).toEqual([]);
  });

  it('makes one section of a level-2 heading and every block until the next', () => {
    const blocks = [heading('One'), para('a'), para('b'), heading('Two'), para('c')];
    const sections = deriveSections(blocks);

    expect(sections).toHaveLength(2);
    expect(sections[0]?.heading).toBe('One');
    expect(sections[0]?.blocks).toEqual([heading('One'), para('a'), para('b')]);
    expect(sections[1]?.heading).toBe('Two');
    expect(sections[1]?.blocks).toEqual([heading('Two'), para('c')]);
  });

  it('keeps a level-3 heading inside its section rather than starting one', () => {
    const sections = deriveSections([heading('One'), sub('detail'), para('a')]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.blocks).toEqual([heading('One'), sub('detail'), para('a')]);
  });

  it('puts a run of blocks before the first heading in one leading section with no heading', () => {
    const sections = deriveSections([para('intro'), heading('One'), para('a')]);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.heading).toBeNull();
    expect(sections[0]?.blocks).toEqual([para('intro')]);
    expect(sections[1]?.heading).toBe('One');
  });

  it('surfaces the heading speaker context on its section, and null when it carries none', () => {
    const sections = deriveSections([heading('One', 'say this'), para('a'), heading('Two')]);
    expect(sections[0]?.context).toBe('say this');
    expect(sections[1]?.context).toBeNull();
  });

  it('loses no block: the sections concatenate back to the source array', () => {
    const blocks = [para('intro'), heading('One'), para('a'), sub('s'), heading('Two'), para('b')];
    expect(deriveSections(blocks).flatMap((section) => section.blocks)).toEqual(blocks);
  });
});

describe('withoutSpeakerContext', () => {
  it('removes the context from a heading that carries one', () => {
    const result = withoutSpeakerContext([{ type: 'heading', level: 2, text: 'One', context: 'say this' }]);
    const block = (result as { type: string; context?: string }[])[0];
    expect(block?.type).toBe('heading');
    expect(block?.context).toBeUndefined();
  });

  it('leaves a heading with no context, and every other block, unchanged', () => {
    const blocks: JsonValue = [
      { type: 'heading', level: 2, text: 'One' },
      { type: 'paragraph', text: 'a', marks: [] },
    ];
    expect(withoutSpeakerContext(blocks)).toEqual(blocks);
  });

  it('strips context from a level-3 heading too, so no heading ever serves it', () => {
    const result = withoutSpeakerContext([{ type: 'heading', level: 3, text: 'detail', context: 'aside' }]);
    const block = (result as { context?: string }[])[0];
    expect(block?.context).toBeUndefined();
  });

  it('returns a non-array value as it came', () => {
    expect(withoutSpeakerContext('not blocks')).toBe('not blocks');
  });
});

const list = (...items: string[]): Block => ({ type: 'list', ordered: false, items });
const quote = (text: string, attribution: string | null = null): Block => ({ type: 'quote', text, attribution });
const image = (caption: string | null = null): Block => ({ type: 'image', mediaId: 'm', alt: 'a picture', caption });
const figure = (caption: string | null = null): Block => ({ type: 'figure', mediaId: 'm', caption, data: ['1', '2'] });

describe('cardsOf — what the overview shows of each section (DECK-001/T2)', () => {
  it('takes the first paragraph as the line, not the heading', () => {
    const [card] = cardsOf(deriveSections([heading('One'), para('the first line'), para('the second')]));

    expect(card?.heading).toBe('One');
    expect(card?.firstLine).toBe('the first line');
  });

  it('takes a list item or a quote when the section opens with one instead', () => {
    const cards = cardsOf(
      deriveSections([heading('One'), list('first item', 'second'), heading('Two'), quote('what they said')]),
    );

    expect(cards[0]?.firstLine).toBe('first item');
    expect(cards[1]?.firstLine).toBe('what they said');
  });

  it('has no line for a section that carries no prose, and says what it carries instead', () => {
    const [card] = cardsOf(deriveSections([heading('One'), image('a caption'), figure()]));

    expect(card?.firstLine).toBeNull();
    expect(card?.hasImage).toBe(true);
    expect(card?.hasFigure).toBe(true);
  });

  it('skips an empty paragraph rather than showing a blank line', () => {
    const [card] = cardsOf(deriveSections([heading('One'), para('   '), para('the real line')]));

    expect(card?.firstLine).toBe('the real line');
  });

  it('carries the speaker context, which the overview shows and no investor receives', () => {
    const [card] = cardsOf(deriveSections([heading('One', 'say the number slowly'), para('a')]));

    expect(card?.context).toBe('say the number slowly');
  });

  it('names a run of blocks before the first heading rather than dropping it', () => {
    const cards = cardsOf(deriveSections([para('stray'), heading('One'), para('a')]));

    expect(cards).toHaveLength(2);
    expect(cards[0]?.heading).toBeNull();
    expect(cards[0]?.firstLine).toBe('stray');
  });

  it('reports the section order the deck is in, card for card', () => {
    const cards = cardsOf(deriveSections([heading('One'), para('a'), heading('Two'), para('b'), heading('Three')]));

    expect(cards.map((card) => card.heading)).toEqual(['One', 'Two', 'Three']);
  });
});

describe('totalsOf — what the deck adds up to (DECK-001/T4)', () => {
  it('counts a section per level-2 heading and a figure per figure block', () => {
    const totals = totalsOf(deriveSections([heading('One'), figure(), heading('Two'), figure(), para('a')]));

    expect(totals.sections).toBe(2);
    expect(totals.figures).toBe(2);
  });

  it('counts the words of every kind of prose a reader receives', () => {
    // 2 (heading) + 3 (paragraph) + 3 (two list items) + 2 (quote) + 1
    // (attribution) + 2 (image caption) + 2 (figure caption) = 15.
    const totals = totalsOf(
      deriveSections([
        heading('One two'),
        para('three four five'),
        list('six seven', 'eight'),
        quote('nine ten', 'eleven'),
        image('twelve thirteen'),
        figure('fourteen fifteen'),
      ]),
    );

    expect(totals.words).toBe(15);
  });

  it('counts no alternative text, so a deck of pictures does not read as long as one of argument', () => {
    const totals = totalsOf(deriveSections([heading('One'), image(), image(), image()]));

    expect(totals.words).toBe(1);
  });

  it('counts no speaker context, because the count is of what a reader receives', () => {
    const spoken = totalsOf(deriveSections([heading('One', 'a great deal said aloud here'), para('two words')]));
    const silent = totalsOf(deriveSections([heading('One'), para('two words')]));

    expect(spoken.words).toBe(silent.words);
  });

  it('counts nothing for an empty deck and for one that is only a divider', () => {
    expect(totalsOf(deriveSections([]))).toEqual({ sections: 0, words: 0, figures: 0 });
    expect(totalsOf(deriveSections([{ type: 'divider' }]))).toEqual({ sections: 1, words: 0, figures: 0 });
  });

  it('counts runs of whitespace as one break rather than as words', () => {
    const totals = totalsOf(deriveSections([heading('One'), para('  two   spaced   words  ')]));

    expect(totals.words).toBe(4);
  });
});

describe('reorderSections — a move is an edit of the block array (DECK-001/T3)', () => {
  const deck = [heading('One'), para('a'), heading('Two'), para('b'), para('c'), heading('Three'), para('d')];

  it('moves the section whole, body and all', () => {
    const moved = reorderSections(deck, 1, 0);

    expect(deriveSections(moved).map((section) => section.heading)).toEqual(['Two', 'One', 'Three']);
    expect(moved.slice(0, 3)).toEqual([heading('Two'), para('b'), para('c')]);
  });

  it('keeps exactly the blocks it was given, so a move can never lose or invent one', () => {
    // Compared as a bag rather than in order, since the order is the one thing
    // a move is allowed to change. Sorting the objects themselves would compare
    // every one as "[object Object]" and assert nothing.
    const bag = (blocks: Block[]): string[] => blocks.map((block) => JSON.stringify(block)).sort();

    for (const [from, to] of [[0, 2], [2, 0], [1, 2], [2, 1], [0, 1]]) {
      const moved = reorderSections(deck, from ?? 0, to ?? 0);

      expect(moved).toHaveLength(deck.length);
      expect(bag(moved)).toEqual(bag(deck));
      expect(deriveSections(moved).flatMap((section) => section.blocks)).toEqual(moved);
    }
  });

  it('puts the section where the list said, counting positions before the move', () => {
    // One, Two, Three -> Two, Three, One: moving the first to position 2 leaves
    // the one that was third in second place.
    expect(deriveSections(reorderSections(deck, 0, 2)).map((section) => section.heading)).toEqual([
      'Two',
      'Three',
      'One',
    ]);
  });

  it('gives back the very same array when the move is a move to nowhere', () => {
    for (const [from, to] of [[1, 1], [0, 0], [-1, 0], [0, -1], [3, 0], [0, 3], [1.5, 0], [0, Number.NaN]]) {
      expect(reorderSections(deck, from ?? 0, to ?? 0)).toBe(deck);
    }
  });

  it('moves a run of blocks before the first heading like any other section', () => {
    const withStray = [para('stray'), heading('One'), para('a')];

    expect(reorderSections(withStray, 0, 1)).toEqual([heading('One'), para('a'), para('stray')]);
  });

  it('has nothing to move in a deck of one section or none', () => {
    const one = [heading('Only'), para('a')];

    expect(reorderSections(one, 0, 0)).toBe(one);
    expect(reorderSections([], 0, 0)).toEqual([]);
  });
});

describe('withSpeakerContext — writing a section note (DECK-001/T6)', () => {
  const bare: Block = { type: 'heading', level: 2, text: 'One' };
  const noted: Block = { type: 'heading', level: 2, text: 'One', context: 'say it slowly' };

  it('puts the note on the heading as typed', () => {
    expect(withSpeakerContext(bare, 'say it slowly')).toEqual(noted);
  });

  it('replaces a note rather than appending to it', () => {
    expect(withSpeakerContext(noted, 'say it quickly')).toEqual({
      type: 'heading',
      level: 2,
      text: 'One',
      context: 'say it quickly',
    });
  });

  it('removes the field when the note is cleared, because empty and absent are one fact', () => {
    const cleared = withSpeakerContext(noted, '');

    expect(cleared).toEqual(bare);
    expect('context' in cleared).toBe(false);
  });

  it('treats whitespace as cleared, since that is what the space bar leaves behind', () => {
    expect('context' in withSpeakerContext(noted, '   ')).toBe(false);
  });

  it('keeps the note a card shows exactly as it was written', () => {
    const [card] = cardsOf(deriveSections([withSpeakerContext(bare, '  pause here  ')]));

    expect(card?.context).toBe('  pause here  ');
  });

  it('leaves the heading otherwise untouched, level and text alike', () => {
    const sub: Block = { type: 'heading', level: 3, text: 'Detail' };

    expect(withSpeakerContext(sub, 'aside')).toEqual({ type: 'heading', level: 3, text: 'Detail', context: 'aside' });
  });
});
