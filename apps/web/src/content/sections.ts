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
