'use client';

/**
 * Reordering a deck's sections, by drag and by keyboard (`DECK-001/T3`).
 *
 * **The order is the block array**, so a move rewrites that array and saves it
 * down the editor's own write path (`POST /admin/content/<id>/draft`). There is
 * no order stored beside the document and no second route to keep in step: the
 * overview and the editor are two views of one object (`DECK-001` §3), and a
 * concurrent save costs an edit here exactly as it does in the editor rather
 * than scrambling a document into something nobody wrote — which is what
 * sending a permutation of positions somebody else has already changed would
 * do.
 *
 * **The keyboard is not a fallback for the drag; it is the same operation.** A
 * card is focusable, space or enter picks it up, the arrows move it while it is
 * held, space or enter puts it down, and escape puts it back where it started.
 * The arrows move focus when nothing is held and the card when something is, so
 * one key does the obvious thing in both states rather than the list having a
 * mode a person has to remember they are in (`A11Y-R01`).
 *
 * **A move is announced, not only drawn.** Reordering is invisible to somebody
 * who is not watching the list move, so every act says what happened in a live
 * region: what was picked up, where it went, that it was put down, and whether
 * it saved (`A11Y-R02`). A reorder that silently failed to save is a deck an
 * author believes they have fixed.
 *
 * Cards are keyed by a number this component mints and carries with the section,
 * never by the position and never by the heading. A position changes on every
 * move, which would make React reuse the wrong row and drop the focus a
 * keyboard move depends on; a heading is not unique, and a deck being written is
 * full of empty ones.
 */

import { useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, ReactElement } from 'react';

import type { Block } from '../../../../../content/blocks';
import { type SectionCard, cardsOf, deriveSections, reorderSections } from '../../../../../content/sections';

import styles from './overview.module.css';

const FAILED = 'The new order was not saved. Reload the page and try again.';
const LAPSED = 'Your session has ended. Open the page again to sign in.';

/** What the list holds: the document, the cards drawn from it, and their keys. */
interface Order {
  readonly blocks: Block[];
  readonly cards: SectionCard[];
  readonly ids: number[];
}

function nameOf(card: SectionCard | undefined, index: number): string {
  return card?.heading ?? `Section ${index + 1}`;
}

/**
 * What a section carries, in words rather than as a mark somebody has to read
 * the shape of (`A11Y-R02`). A section carrying neither says so: an empty space
 * is something a reader has to interpret, and the interpretation they reach is
 * usually that the page failed to load.
 */
function carries(card: SectionCard): string {
  if (card.hasImage && card.hasFigure) {
    return 'Carries an image and a figure';
  }
  if (card.hasImage) {
    return 'Carries an image';
  }
  if (card.hasFigure) {
    return 'Carries a figure';
  }
  return 'Words only';
}

export function SectionList({
  itemId,
  blocks,
  cards,
}: {
  readonly itemId: string;
  /** The document the order lives in; a move rewrites it and saves it. */
  readonly blocks: Block[];
  readonly cards: SectionCard[];
}): ReactElement {
  const [order, setOrder] = useState<Order>(() => ({
    blocks,
    cards,
    ids: cards.map((_, index) => index),
  }));
  const [grabbed, setGrabbed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const [failed, setFailed] = useState<string | null>(null);

  // Where a grab started, so escape puts the section back rather than leaving it
  // wherever the arrows had taken it by then.
  const start = useRef<{ order: Order; at: number } | null>(null);
  const rows = useRef(new Map<number, HTMLLIElement>());

  async function save(next: Block[]): Promise<void> {
    setFailed(null);
    setSaid('Saving the new order…');

    try {
      const response = await fetch(`/admin/content/${itemId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: next }),
      });

      if (response.status === 200) {
        setSaid('The new order is saved.');
      } else if (response.redirected) {
        setFailed(LAPSED);
        setSaid(LAPSED);
      } else {
        setFailed(FAILED);
        setSaid(FAILED);
      }
    } catch {
      setFailed(FAILED);
      setSaid(FAILED);
    }
  }

  /** Move a section and say so; `null` when the move was a move to nowhere. */
  function move(from: number, to: number): Order | null {
    const moved = reorderSections(order.blocks, from, to);
    if (moved === order.blocks) {
      return null;
    }

    const ids = [...order.ids];
    const [lifted] = ids.splice(from, 1);
    ids.splice(to, 0, lifted ?? from);

    const next: Order = { blocks: moved, cards: cardsOf(deriveSections(moved)), ids };
    setOrder(next);
    setSaid(`${nameOf(next.cards[to], to)} moved to position ${to + 1} of ${next.cards.length}.`);
    return next;
  }

  function pickUp(index: number): void {
    start.current = { order, at: index };
    setGrabbed(index);
    setSaid(
      `${nameOf(order.cards[index], index)} picked up. Arrow keys move it, space puts it down, escape puts it back.`,
    );
  }

  function putDown(index: number): void {
    const held = start.current;
    setGrabbed(null);
    start.current = null;
    setSaid(`${nameOf(order.cards[index], index)} put down.`);

    if (held !== null && held.at !== index) {
      void save(order.blocks);
    }
  }

  function putBack(): void {
    const held = start.current;
    if (held === null) {
      return;
    }
    setOrder(held.order);
    setGrabbed(null);
    start.current = null;
    setSaid('Put back where it was. Nothing changed.');
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLLIElement>): void {
    // A keystroke inside something focusable within the card keeps its own
    // meaning; only the row itself moves sections.
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (grabbed === index) {
        putDown(index);
      } else {
        pickUp(index);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (grabbed !== null) {
        event.preventDefault();
        putBack();
      }
      return;
    }

    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();

    const target = index + step;
    if (target < 0 || target >= order.cards.length) {
      return;
    }

    if (grabbed !== index) {
      rows.current.get(order.ids[target] ?? target)?.focus();
      return;
    }

    // The moved card is a different element at its new position, and it is the
    // one that must keep focus — found by the identity it carries, not by where
    // it now sits.
    const carried = order.ids[index];
    if (move(index, target) !== null) {
      setGrabbed(target);
      window.requestAnimationFrame(() => {
        if (carried !== undefined) {
          rows.current.get(carried)?.focus();
        }
      });
    }
  }

  function onDrop(index: number, event: DragEvent<HTMLLIElement>): void {
    event.preventDefault();
    setOver(null);
    const from = dragging;
    setDragging(null);

    if (from === null || from === index) {
      return;
    }

    const next = move(from, index);
    if (next !== null) {
      void save(next.blocks);
    }
  }

  return (
    <>
      <p className={styles.howto}>
        Drag a section to move it, or focus one and press space to pick it up — the arrow keys then move it,
        space puts it down, and escape puts it back.
      </p>

      <ol className={styles.cards}>
        {order.cards.map((card, index) => {
          const id = order.ids[index] ?? index;
          return (
            <li
              key={id}
              ref={(node) => {
                if (node === null) {
                  rows.current.delete(id);
                } else {
                  rows.current.set(id, node);
                }
              }}
              tabIndex={0}
              draggable
              aria-label={`${nameOf(card, index)}, position ${index + 1} of ${order.cards.length}${
                grabbed === index ? ', picked up' : ''
              }`}
              className={[
                styles.card,
                grabbed === index ? styles.grabbed : '',
                over === index && dragging !== index ? styles.over : '',
              ]
                .filter((name) => name !== '')
                .join(' ')}
              onKeyDown={(event) => onKeyDown(index, event)}
              onDragStart={() => setDragging(index)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(index);
              }}
              onDrop={(event) => onDrop(index, event)}
            >
              <h2 className={styles.heading}>
                {card.heading ?? <span className={styles.unheaded}>Before the first heading</span>}
              </h2>

              {card.firstLine === null ? null : <p className={styles.line}>{card.firstLine}</p>}

              <p className={styles.carries}>{carries(card)}</p>

              {card.context === null ? null : (
                <p className={styles.context}>
                  <span className={styles.contextLabel}>To say:</span> {card.context}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <p className={styles.live} role="status" aria-live="polite">
        {said}
      </p>
      {failed === null ? null : (
        <p className={styles.refused} role="alert">
          {failed}
        </p>
      )}
    </>
  );
}
