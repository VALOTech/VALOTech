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

import { type Block, withoutSpeakerContext } from './blocks';
import { deriveSections } from './sections';

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
