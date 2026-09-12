/**
 * The strings in a block a translator replaces, and putting them back
 * (`CMS-005/T4`).
 *
 * A translation is the same document in another language: the same blocks in the
 * same order, the same image naming the same file, the same list with the same
 * number of items. What changes is the words. So the review screen does not edit
 * blocks — it edits a flat list of strings, each one shown beside the English it
 * replaces, and this module is what turns a block into that list and the list
 * back into a block.
 *
 * **Position is the key.** `fieldsOf` and `translated` walk a block in the same
 * order, so a field is addressed by where it is rather than by a path string
 * that would have to be parsed back. The pair is pinned by a round trip — the
 * fields of a block, put back unchanged, are that block — which is the one test
 * that fails the moment the two walks disagree.
 *
 * **A marked span is a field of its own.** A paragraph is cut at every mark
 * boundary, and each piece — plain run, bold phrase, linked phrase — is offered
 * separately; the offsets are then rebuilt from the translated pieces. The
 * alternative was measured and is worse: `marks.ts:remapMarks` reads a whole
 * replaced paragraph as one edited run and grows every mark to cover it, so
 * translating `hello world` with `strong` on `hello` emphasises the entire
 * translation — and a link over two words becomes a link over the paragraph. That
 * behaviour is right where it lives, under a cursor moving through text a person
 * is typing; a translation replaces the whole string at once, which is exactly
 * the case it cannot read. Cutting at the boundaries is what `CMS-005` means by
 * a translator keeping the marks the seed carried and changing only the words.
 *
 * A mark whose piece is translated to nothing is dropped, which is the honest
 * outcome: a translator who removed the emphasised phrase removed its emphasis
 * with it.
 */

import type { Block, Mark, MarkType } from './blocks';

/** How a marked piece of a paragraph is named, so a translator sees what it is. */
const MARK_LABELS: Readonly<Record<MarkType, string>> = {
  strong: 'bold',
  em: 'italic',
  code: 'code',
  link: 'link',
};

/**
 * The pieces a paragraph's text falls into at its mark boundaries, each with the
 * marks covering it.
 *
 * Marks may overlap — a link inside a bold phrase is two marks over one run — so
 * the cut points are every start and every end, and a piece carries the index of
 * every mark that covers it. Rebuilding then gives each mark the span of the
 * pieces it covered, which is how emphasis survives a translation of a different
 * length.
 */
function piecesOf(text: string, marks: readonly Mark[]): { text: string; marks: number[] }[] {
  const cuts = [...new Set([0, text.length, ...marks.flatMap((mark) => [mark.start, mark.end])])]
    .filter((cut) => cut >= 0 && cut <= text.length)
    .sort((left, right) => left - right);

  const pieces: { text: string; marks: number[] }[] = [];
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const start = cuts[index] ?? 0;
    const end = cuts[index + 1] ?? 0;
    pieces.push({
      text: text.slice(start, end),
      marks: marks
        .map((mark, position) => (mark.start <= start && mark.end >= end ? position : -1))
        .filter((position) => position >= 0),
    });
  }

  // A paragraph with no text still offers one field, so an empty string can be
  // translated into one rather than disappearing from the screen.
  return pieces.length === 0 ? [{ text, marks: [] }] : pieces;
}

/** One string a translator replaces, and what the screen calls it. */
export interface TranslatableField {
  /** The label beside the pair, naming what this string is in the document. */
  readonly label: string;
  /** The current value: the source text on a seed, the translation after that. */
  readonly value: string;
  /**
   * True when the string is a line of prose rather than a word or a number, so
   * the screen can give it room to be a paragraph instead of a single line.
   */
  readonly long: boolean;
}

/**
 * Every string in this block a translator replaces, in the order the screen
 * shows them and `translated` puts them back.
 *
 * A `divider` has none, and an `image`'s file is not among them: a translation
 * shows the same picture, and a `mediaId` in a translator's hands is a way for a
 * document to end up pointing at a different file in one language.
 */
export function fieldsOf(block: Block): TranslatableField[] {
  switch (block.type) {
    case 'heading':
      return [
        { label: 'Heading', value: block.text, long: false },
        ...(block.context === undefined
          ? []
          : [{ label: 'Speaker note', value: block.context, long: true }]),
      ];
    case 'paragraph':
      return piecesOf(block.text, block.marks).map((piece) => ({
        label:
          piece.marks.length === 0
            ? 'Paragraph'
            : `Paragraph (${piece.marks
                .map((position) => MARK_LABELS[block.marks[position]?.type ?? 'strong'])
                .join(', ')})`,
        value: piece.text,
        long: true,
      }));
    case 'list':
      return block.items.map((item, index) => ({
        label: `List item ${index + 1}`,
        value: item,
        long: false,
      }));
    case 'quote':
      return [
        { label: 'Quote', value: block.text, long: true },
        ...(block.attribution === null
          ? []
          : [{ label: 'Attribution', value: block.attribution, long: false }]),
      ];
    case 'image':
      return [
        { label: 'Image alternative text', value: block.alt, long: false },
        ...(block.caption === null ? [] : [{ label: 'Image caption', value: block.caption, long: false }]),
      ];
    case 'figure':
      return [
        ...(block.caption === null ? [] : [{ label: 'Figure caption', value: block.caption, long: false }]),
        ...block.data.map((datum, index) => ({
          label: `Figure value ${index + 1}`,
          value: datum,
          long: false,
        })),
      ];
    case 'divider':
      return [];
  }
}

/**
 * The block with `values` in place of its strings, taken in `fieldsOf`'s order.
 *
 * A value beyond what the block has is ignored and a missing one keeps what was
 * there, so a screen that posts a stale field count changes nothing it did not
 * mean to — the alternative is a document quietly truncated by an off-by-one.
 */
export function translated(block: Block, values: readonly string[]): Block {
  const next = (index: number, fallback: string): string => values[index] ?? fallback;

  switch (block.type) {
    case 'heading':
      return block.context === undefined
        ? { ...block, text: next(0, block.text) }
        : { ...block, text: next(0, block.text), context: next(1, block.context) };
    case 'paragraph': {
      const pieces = piecesOf(block.text, block.marks);
      const translations = pieces.map((piece, index) => next(index, piece.text));

      // Each mark's new span runs from where its first piece begins to where
      // its last one ends, measured over the text the pieces now make.
      const spans = block.marks.map(() => ({ start: -1, end: -1 }));
      let at = 0;
      pieces.forEach((piece, index) => {
        const length = (translations[index] ?? '').length;
        for (const position of piece.marks) {
          const span = spans[position];
          if (span === undefined) {
            continue;
          }
          span.start = span.start === -1 ? at : span.start;
          span.end = at + length;
        }
        at += length;
      });

      return {
        ...block,
        text: translations.join(''),
        marks: block.marks
          .map((mark, position) => ({ ...mark, ...spans[position] }))
          .filter((mark) => mark.start >= 0 && mark.end > mark.start),
      };
    }
    case 'list':
      return { ...block, items: block.items.map((item, index) => next(index, item)) };
    case 'quote':
      return block.attribution === null
        ? { ...block, text: next(0, block.text) }
        : { ...block, text: next(0, block.text), attribution: next(1, block.attribution) };
    case 'image':
      return block.caption === null
        ? { ...block, alt: next(0, block.alt) }
        : { ...block, alt: next(0, block.alt), caption: next(1, block.caption) };
    case 'figure': {
      const offset = block.caption === null ? 0 : 1;
      return {
        ...block,
        ...(block.caption === null ? {} : { caption: next(0, block.caption) }),
        data: block.data.map((datum, index) => next(offset + index, datum)),
      };
    }
    case 'divider':
      return block;
  }
}
