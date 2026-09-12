/**
 * Applying and maintaining a paragraph's marks (`CMS-002/T4`).
 *
 * A mark is a `{start, end, type}` span over the paragraph's plain text
 * (`CMS-001`, `blocks.ts`), never embedded markup. The editor's model is the
 * block array and not the DOM (`CMS-002` §3), so a mark is placed from a
 * selection — a `<textarea>`'s `selectionStart`/`selectionEnd` are already the
 * plain-text offsets a mark stores — and it must survive the text being edited
 * around it. Both operations are pure functions over the block's own data, which
 * is what keeps the model the array: nothing here reads or writes a node.
 *
 * The result of every function is a valid mark set for the text it describes —
 * each span non-empty and within the text — so `validateBlocks` admits it
 * without a second normalisation. Marks are kept sorted by start, then end, so a
 * paragraph's marks have one order whoever wrote them.
 */

import { isSafeMarkHref, type Mark, type MarkType } from './blocks';

/** Sorted by start, then end, so a rendered or stored paragraph has one order. */
function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The parts of `mark` that lie outside `[start, end)` — nothing, one side, or both. */
function clipOut(mark: Mark, start: number, end: number): Mark[] {
  const pieces: Mark[] = [];
  if (mark.start < start) {
    pieces.push({ ...mark, end: Math.min(mark.end, start) });
  }
  if (mark.end > end) {
    pieces.push({ ...mark, start: Math.max(mark.start, end) });
  }
  return pieces.filter((piece) => piece.start < piece.end);
}

/**
 * Apply a mark of `type` over `[start, end)` and return the new mark set.
 *
 * An empty or inverted span applies nothing: a mark covers a selection, and
 * there is no selection to mark. `start` and `end` come from a selection over
 * the text, so they are already within it; this function does not re-clamp them
 * and a caller that passes offsets from some other string is the bug.
 *
 * Emphasis marks of one type do not stack: applying `strong` over a span that
 * overlaps or merely touches an existing `strong` unions the two into one, so a
 * paragraph never holds two `strong` marks a reader cannot tell apart and a
 * second application over the same words is idempotent rather than a duplicate.
 *
 * A `link` is different because it carries a target: applying one clips any
 * existing link out of the new span first, so a character is under at most one
 * link and the newest wins where they overlap — two links on one word have no
 * meaning a renderer could honour. A link with no target — or an unsafe one, a
 * `javascript:` or `data:` scheme a paste might carry — applies nothing, the same
 * refusal `validateBlocks` makes on write (`isSafeMarkHref`).
 */
export function applyMark(marks: Mark[], type: MarkType, start: number, end: number, href?: string): Mark[] {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end) {
    return marks;
  }

  if (type === 'link') {
    const target = (href ?? '').trim();
    // An empty or unsafe target applies no link (`isSafeMarkHref`): the words
    // stay unmarked rather than becoming a link the validator would refuse.
    if (!isSafeMarkHref(target)) {
      return marks;
    }
    const cleared = marks.flatMap((mark) => (mark.type === 'link' ? clipOut(mark, start, end) : [mark]));
    return sortMarks([...cleared, { start, end, type: 'link', href: target }]);
  }

  let low = start;
  let high = end;
  const rest: Mark[] = [];
  for (const mark of marks) {
    // Same type and touching (`mark.start <= high && low <= mark.end`, so an
    // abutting pair like 0..3 and 3..5 joins): absorb it into the span.
    if (mark.type === type && mark.start <= high && low <= mark.end) {
      low = Math.min(low, mark.start);
      high = Math.max(high, mark.end);
    } else {
      rest.push(mark);
    }
  }
  return sortMarks([...rest, { start: low, end: high, type }]);
}

/** Remove the mark at `index`, leaving the rest in their order. Out of range is a no-op. */
export function removeMark(marks: Mark[], index: number): Mark[] {
  if (index < 0 || index >= marks.length) {
    return marks;
  }
  return marks.filter((_, i) => i !== index);
}

/**
 * Move every mark's offsets from `oldText`'s coordinates to `newText`'s, so a
 * mark still covers the words it covered after the text around it is edited
 * (`CMS-002/T4`: offsets maintained under edits).
 *
 * The edit is found as one replaced run rather than tracked keystroke by
 * keystroke: the longest common prefix and suffix of the two strings bound a
 * single region `[p, oldEnd)` that became `[p, newEnd)`, which is exactly what a
 * paste, a deletion or a typed character each are. A position before the region
 * is unmoved; one after it shifts by the length change; one inside it resolves
 * to the region's edge — a mark's start to where the change begins, its end to
 * where the change now ends — so a mark whose text was partly replaced grows to
 * cover the replacement and one whose text was deleted shrinks. A mark left with
 * nothing between its ends is dropped: the words it named are gone.
 *
 * This is a heuristic, not a record of what the author did — two disjoint edits
 * between the same two strings are indistinguishable from one spanning run — but
 * it is exact for a single contiguous edit, which is what an editor produces
 * between renders, and it never leaves a mark outside the text or inverted.
 */
export function remapMarks(marks: Mark[], oldText: string, newText: string): Mark[] {
  if (oldText === newText) {
    return marks;
  }

  const shorter = Math.min(oldText.length, newText.length);

  let prefix = 0;
  while (prefix < shorter && oldText[prefix] === newText[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const oldEnd = oldText.length - suffix; // old `[prefix, oldEnd)` was replaced
  const newEnd = newText.length - suffix; // by new `[prefix, newEnd)`
  const delta = newText.length - oldText.length;

  // A start and an end map differently at the edit's front edge, and that
  // asymmetry is the whole point: text inserted exactly at `prefix` sits after a
  // mark that ended there (its end holds, `pos <= prefix`) and before a mark
  // that started there (its start moves past the insertion, `pos < prefix` is
  // false so it shifts) -- so typing between two words does not paint the new
  // text with the emphasis of either. A position strictly inside the replaced
  // run resolves to the run's edge: a start to where the change begins, an end
  // to where it now ends, so a mark whose text was partly replaced still spans
  // the replacement rather than a stale offset into it.
  const mapStart = (pos: number): number => {
    if (pos < prefix) {
      return pos;
    }
    if (pos >= oldEnd) {
      return pos + delta;
    }
    return prefix;
  };

  const mapEnd = (pos: number): number => {
    if (pos <= prefix) {
      return pos;
    }
    if (pos >= oldEnd) {
      return pos + delta;
    }
    return newEnd;
  };

  const remapped: Mark[] = [];
  for (const mark of marks) {
    const start = mapStart(mark.start);
    const end = mapEnd(mark.end);
    if (start < end) {
      remapped.push({ ...mark, start, end });
    }
  }
  return sortMarks(remapped);
}
