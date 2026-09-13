/**
 * The blocks, as a reader sees them (`CMS-004/T1`).
 *
 * There is one renderer and every reading surface goes through it — the preview
 * first, and the report and deck views after (`RPT-003`, `DECK-003`). That is
 * the property `CMS-004` asks for and the reason this lives in the content
 * module rather than beside the preview: a preview with a renderer of its own
 * shows an admin something no reader will ever see, and the difference surfaces
 * after publication, in front of investors.
 *
 * **Marks are offsets, not nesting.** A paragraph's text is cut at every mark
 * boundary (`marks.ts:piecesOf`) and each piece is wrapped in the elements its
 * marks name, so a link inside a bold phrase renders as both without either
 * mark having to know about the other. A mark set that overlaps has no nesting
 * to disagree about, which is why the model stores offsets in the first place.
 *
 * **A link carries `rel="noreferrer"`.** A mark's href is checked for scheme at
 * the write boundary (`blocks.ts:isSafeMarkHref`), so what reaches here cannot
 * be `javascript:`; what it can be is somebody else's site, and a reader
 * following it should not hand that site the URL of an investor-only report.
 *
 * A `figure`'s numbers are rendered as a table rather than baked into a picture,
 * because a figure a screen reader cannot read is a figure half the room cannot
 * read (`A11Y-R02`); the picture and the numbers are the same figure said twice.
 */

import { Fragment, type ReactElement, type ReactNode } from 'react';

import type { Block, Mark } from './blocks';
import { piecesOf } from './marks';

/** Wrap one run of text in the elements its marks name, innermost last. */
function marked(text: string, marks: readonly Mark[], covering: readonly number[]): ReactNode {
  return covering.reduce<ReactNode>((inner, position) => {
    const mark = marks[position];
    if (mark === undefined) {
      return inner;
    }

    switch (mark.type) {
      case 'strong':
        return <strong>{inner}</strong>;
      case 'em':
        return <em>{inner}</em>;
      case 'code':
        return <code>{inner}</code>;
      case 'link':
        return (
          <a href={mark.href} rel="noreferrer">
            {inner}
          </a>
        );
    }
  }, text);
}

/** One block, as a reader sees it. */
function Rendered({ block }: { readonly block: Block }): ReactElement | null {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h2' : 'h3';
      // `context` is a note for whoever presents a deck (`DECK-001/T5`), not
      // something a reader is shown.
      return <Tag>{block.text}</Tag>;
    }
    case 'paragraph':
      return (
        <p>
          {/* A keyed fragment rather than a wrapper: the markup a reader
              receives should be the document, not the renderer's bookkeeping. */}
          {piecesOf(block.text, block.marks).map((piece, index) => (
            <Fragment key={index}>{marked(piece.text, block.marks, piece.marks)}</Fragment>
          ))}
        </p>
      );
    case 'list': {
      const items = block.items.map((item, index) => <li key={index}>{item}</li>);
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case 'quote':
      return (
        <blockquote>
          <p>{block.text}</p>
          {block.attribution === null ? null : <footer>{block.attribution}</footer>}
        </blockquote>
      );
    case 'image':
      return (
        <figure>
          <img src={`/media/${block.mediaId}`} alt={block.alt} />
          {block.caption === null ? null : <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    case 'figure':
      return (
        <figure>
          {block.caption === null ? null : <figcaption>{block.caption}</figcaption>}
          <table>
            <tbody>
              {block.data.map((datum, index) => (
                <tr key={index}>
                  <td>{datum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      );
    case 'divider':
      return <hr />;
  }
}

/** A revision's body, in reading order. */
export function RenderedBlocks({ blocks }: { readonly blocks: readonly Block[] }): ReactElement {
  return (
    <>
      {blocks.map((block, index) => (
        <Rendered key={index} block={block} />
      ))}
    </>
  );
}
