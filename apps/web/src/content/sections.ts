/**
 * Deriving a deck's sections from its blocks (`DECK-001/T1`, `CMS-R04`).
 *
 * A deck is one document, not a deck of slides: a section is a level-2 heading
 * and every block until the next level-2 heading, and the block array is the
 * single source (`DECK-001` §3). Nothing about a section is stored twice, so the
 * overview and the linear editor are two views of one object rather than two
 * representations to keep in step; reordering a section (`DECK-001/T3`) rewrites
 * the block array, and this derivation is its inverse.
 *
 * The derivation loses nothing: concatenating every section's blocks, in order,
 * yields the input array unchanged. A run of blocks before the first level-2
 * heading — which a finished deck does not have, but a draft mid-edit can — is
 * one leading section with no heading, so the round-trip holds whatever shape the
 * draft is in. A level-3 heading is content inside a section, not a section of
 * its own.
 *
 * `cardsOf` and `totalsOf` are what the overview shows of that derivation
 * (`DECK-001/T2`, `DECK-001/T4`) — what each section is about and carries, and
 * what the deck adds up to. Both are pure and both read the sections rather than
 * the block array a second time, so the card list and the count cannot describe
 * two different readings of one deck.
 */

import type { Block } from './blocks';

/** One section of a deck: its heading and speaker context, and its blocks in order. */
export interface DeckSection {
  /** The level-2 heading's text, or `null` for a run of blocks before the first heading. */
  readonly heading: string | null;
  /** The heading's speaker context (`DECK-001/T5`), or `null` when it carries none. */
  readonly context: string | null;
  /** The section's blocks in order, the heading first — a contiguous slice of the source array. */
  readonly blocks: Block[];
}

/**
 * Move the section at `from` to sit at `to`, and give back the block array that
 * says so (`DECK-001/T3`).
 *
 * The block array is the single source, so a reorder is an edit of it rather
 * than of an order stored beside it (`DECK-001` §3). `deriveSections` is this
 * function's inverse and a section is a contiguous slice, so moving one is
 * moving its slice whole: every block travels with the heading it belongs to,
 * and nothing is added, dropped or rewritten. The result carries exactly the
 * blocks the input did, in a different order, which is what lets the overview
 * and the editor stay two views of one object.
 *
 * An index outside the list, and a move to where the section already is, both
 * give back the blocks unchanged. A caller asking for either has asked for
 * nothing to happen, and the honest answer to that is the document it already
 * had — not a refusal it would have to distinguish from a real one.
 *
 * `to` is the position in the list as it stands *before* the move, which is what
 * a person means by "put this third": the section is lifted out and put back at
 * that index, so moving section 0 to 2 in a deck of four leaves the one that was
 * third in second place.
 */
export function reorderSections(blocks: Block[], from: number, to: number): Block[] {
  const sections = deriveSections(blocks);

  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= sections.length ||
    to >= sections.length ||
    from === to
  ) {
    return blocks;
  }

  const moved = sections[from];
  if (moved === undefined) {
    return blocks;
  }

  const rest = sections.filter((_, index) => index !== from);
  return [...rest.slice(0, to), moved, ...rest.slice(to)].flatMap((section) => section.blocks);
}

/** One section as the overview shows it: what it is about, and what it carries. */
export interface SectionCard {
  readonly heading: string | null;
  /** The speaker context, shown here and served to no investor (`DECK-001/T5`). */
  readonly context: string | null;
  /** The first line of prose after the heading, or `null` when it carries none. */
  readonly firstLine: string | null;
  readonly hasImage: boolean;
  readonly hasFigure: boolean;
}

/** What the deck adds up to, which is how its author learns it became a document. */
export interface DeckTotals {
  readonly sections: number;
  readonly words: number;
  readonly figures: number;
}

/**
 * The words a reader receives, for the count.
 *
 * A heading, a paragraph, a list's items, a quote and its attribution, and a
 * caption are all prose on the page and are counted. Two things are not. An
 * image's alternative text stands in for the picture rather than adding to the
 * document, so counting it would make a deck of photographs read as long as one
 * of argument. Speaker context is never served to anybody (`DECK-001` §3), and
 * the question this count answers — is this still something a person will read —
 * is about what they receive.
 */
function textOf(block: Block): string[] {
  switch (block.type) {
    case 'heading':
      return [block.text];
    case 'paragraph':
      return [block.text];
    case 'list':
      return block.items;
    case 'quote':
      return block.attribution === null ? [block.text] : [block.text, block.attribution];
    case 'image':
      return block.caption === null ? [] : [block.caption];
    case 'figure':
      return block.caption === null ? [] : [block.caption];
    case 'divider':
      return [];
  }
}

function words(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

/**
 * The first line of prose a section carries after its heading.
 *
 * A picture and a table are not lines, so a section that is a heading and an
 * image has none — and the card says what it carries instead, which is the
 * reason `DECK-001` §3 asks for both and not for one standing in for the other.
 * The line is returned whole: where it is cut is the card's business, and a
 * server that truncated it would be deciding a width it cannot see.
 */
function firstLineOf(section: DeckSection): string | null {
  for (const block of section.blocks) {
    if (block.type === 'paragraph' && block.text.trim() !== '') {
      return block.text;
    }
    if (block.type === 'list' && block.items.length > 0) {
      return block.items[0] ?? null;
    }
    if (block.type === 'quote') {
      return block.text;
    }
  }

  return null;
}

/** The cards the overview lists, in the deck's own order (`DECK-001/T2`). */
export function cardsOf(sections: DeckSection[]): SectionCard[] {
  return sections.map((section) => ({
    heading: section.heading,
    context: section.context,
    firstLine: firstLineOf(section),
    hasImage: section.blocks.some((block) => block.type === 'image'),
    hasFigure: section.blocks.some((block) => block.type === 'figure'),
  }));
}

/**
 * What the deck adds up to (`DECK-001/T4`).
 *
 * Counted over the sections rather than over the block array, so the section
 * count and the word count are answers about one object: a deck whose overview
 * shows thirty cards cannot report a total taken from a different reading of the
 * same blocks.
 */
export function totalsOf(sections: DeckSection[]): DeckTotals {
  let wordCount = 0;
  let figures = 0;

  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.type === 'figure') {
        figures += 1;
      }
      for (const text of textOf(block)) {
        wordCount += words(text);
      }
    }
  }

  return { sections: sections.length, words: wordCount, figures };
}

/** Split a deck's blocks into sections, one per level-2 heading. */
export function deriveSections(blocks: Block[]): DeckSection[] {
  const sections: { heading: string | null; context: string | null; blocks: Block[] }[] = [];
  let current: { heading: string | null; context: string | null; blocks: Block[] } | null = null;

  for (const block of blocks) {
    if (block.type === 'heading' && block.level === 2) {
      current = { heading: block.text, context: block.context ?? null, blocks: [block] };
      sections.push(current);
    } else if (current === null) {
      current = { heading: null, context: null, blocks: [block] };
      sections.push(current);
    } else {
      current.blocks.push(block);
    }
  }

  return sections;
}
