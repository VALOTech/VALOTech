/**
 * The closed vocabulary every piece of investor-facing content is written in,
 * and the validator that admits only it (`CMS-001`, `CMS-R04`).
 *
 * A revision's body is an ordered array of blocks, each one of a fixed set of
 * shapes. The set is closed and checked **on write**, not skipped on read: a
 * renderer that silently drops a block it does not understand publishes a
 * document with a hole in it and reports success, which is the failure
 * `CMS-R04` exists to forbid. An unknown block, a heading at the wrong level,
 * an image with no alternative text — each is refused at `saveDraft`/`publish`,
 * so a stored revision is renderable by construction.
 *
 * Inline emphasis is carried as **marks** — `{start, end, type}` offsets over a
 * paragraph's plain text — rather than as embedded markup. Offsets are what let
 * a paragraph stay one translatable string (`CMS-005` translates the text and
 * re-applies the offsets), be searched without a parser, and be rendered
 * without one: the text is never HTML, so a paragraph is not an injection
 * surface. A `link` mark carries its target, because a link with no target
 * cannot render; the other mark types carry nothing but their span.
 */

import type { JsonValue } from '../db/types';

export const MARK_TYPES = ['strong', 'em', 'code', 'link'] as const;
export type MarkType = (typeof MARK_TYPES)[number];

export interface Mark {
  start: number;
  end: number;
  type: MarkType;
  /** The target of a `link` mark. Required for `link`, absent for the rest. */
  href?: string;
}

/**
 * Whether a `link` mark's target is one a reader may be sent to safely. Only
 * `http`, `https`, `mailto` and `tel` — and same-site relative paths, which
 * resolve to `http(s)` against any base — are allowed; `javascript:`, `data:`
 * and `vbscript:` are refused, because a stored link is rendered as an `<a href>`
 * and those schemes run script when the link is followed. That is a stored XSS an
 * author need not have typed: a paste can carry it, and a target typed into the
 * link control can too. The refusal lives at the write boundary in `validateMarks`,
 * so no unsafe target is ever stored and a reader render is safe by construction;
 * the paste parser and the mark toolbar apply the same test up front, so neither
 * makes a mark the validator would then reject.
 */
export function isSafeMarkHref(href: string): boolean {
  const value = href.trim();
  if (value.length === 0) {
    return false;
  }
  try {
    const { protocol } = new URL(value, 'https://valo.invalid');
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:';
  } catch {
    return false;
  }
}

export const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'list',
  'quote',
  'image',
  'figure',
  'divider',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export type Block =
  | { type: 'heading'; level: 2 | 3; text: string; context?: string }
  | { type: 'paragraph'; text: string; marks: Mark[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string; attribution: string | null }
  | { type: 'image'; mediaId: string; alt: string; caption: string | null }
  | { type: 'figure'; mediaId: string; caption: string | null; data: string[] }
  | { type: 'divider' };

/**
 * Raised when a block array is not valid; the message names the first fault as
 * `blocks[i].field: why`. `blockIndex` is that `i` — the faulty block's position
 * — lifted from the message so a refusal can point at the block rather than only
 * describe it (`A11Y-R02`, `CMS-002/T3`); it is null only when the value is not a
 * block array at all, which names no single block.
 */
export class BlockValidationError extends Error {
  readonly blockIndex: number | null;

  constructor(message: string) {
    super(message);
    this.name = 'BlockValidationError';
    const match = /^blocks\[(\d+)\]/.exec(message);
    this.blockIndex = match === null ? null : Number(match[1]);
  }
}

function fail(where: string, why: string): never {
  throw new BlockValidationError(`${where}: ${why}`);
}

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(where, 'is not an object');
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, where: string): string {
  if (typeof value !== 'string') {
    fail(where, 'is not a string');
  }
  return value;
}

function validateMarks(value: unknown, textLength: number, where: string): Mark[] {
  if (!Array.isArray(value)) {
    fail(where, 'marks is not an array');
  }

  return value.map((raw, i) => {
    const mark = asObject(raw, `${where}.marks[${i}]`);
    const { start, end, type, href } = mark;

    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)) {
      fail(`${where}.marks[${i}]`, 'start and end must be integers');
    }
    // Offsets must name a real, non-empty span inside the text — an end past the
    // string, or a start after the end, is a mark that cannot be applied.
    if (start < 0 || end > textLength || start >= end) {
      fail(`${where}.marks[${i}]`, `span ${start}..${end} is not within 0..${textLength}`);
    }
    if (typeof type !== 'string' || !MARK_TYPES.includes(type as MarkType)) {
      fail(`${where}.marks[${i}]`, `type ${JSON.stringify(type)} is not one of ${MARK_TYPES.join(', ')}`);
    }
    const markType = type as MarkType;
    if (markType === 'link') {
      if (typeof href !== 'string' || href.length === 0) {
        fail(`${where}.marks[${i}]`, 'a link mark requires a non-empty href');
      }
      // The scheme is checked here, not only where a mark is made, because this
      // is the boundary every write crosses -- a paste, the toolbar, a direct
      // POST -- so a `javascript:` or `data:` target cannot be stored and later
      // rendered as an executable `<a href>` (a stored XSS).
      if (!isSafeMarkHref(href)) {
        fail(`${where}.marks[${i}]`, 'a link mark href must be http, https, mailto, tel or a relative path');
      }
      return { start, end, type: markType, href };
    }
    if (href !== undefined) {
      fail(`${where}.marks[${i}]`, `a ${markType} mark carries no href`);
    }
    return { start, end, type: markType };
  });
}

function validateBlock(raw: unknown, i: number): Block {
  const where = `blocks[${i}]`;
  const block = asObject(raw, where);
  const type = block.type;

  switch (type) {
    case 'heading': {
      const text = asString(block.text, `${where}.text`);
      if (block.level !== 2 && block.level !== 3) {
        fail(where, 'heading level must be 2 or 3 (level 1 is the item title)');
      }
      // Speaker context (DECK-001/T5): what the presenter says that is not on the
      // page. Optional, and a string when present; it is stored on the heading and
      // stripped from the investor read (`withoutSpeakerContext`), never served.
      if (block.context === undefined) {
        return { type, level: block.level, text };
      }
      const context = asString(block.context, `${where}.context`);
      return { type, level: block.level, text, context };
    }
    case 'paragraph': {
      const text = asString(block.text, `${where}.text`);
      return { type, text, marks: validateMarks(block.marks, text.length, where) };
    }
    case 'list': {
      if (typeof block.ordered !== 'boolean') {
        fail(where, 'list.ordered must be a boolean');
      }
      if (!Array.isArray(block.items) || block.items.some((item) => typeof item !== 'string')) {
        fail(where, 'list.items must be an array of strings');
      }
      return { type, ordered: block.ordered, items: block.items as string[] };
    }
    case 'quote': {
      const text = asString(block.text, `${where}.text`);
      const attribution = block.attribution === null ? null : asString(block.attribution, `${where}.attribution`);
      return { type, text, attribution };
    }
    case 'image': {
      const mediaId = asString(block.mediaId, `${where}.mediaId`);
      // Required, and non-empty: an image with no alternative text is refused
      // here rather than shipped unlabelled to a screen reader (A11Y-R02).
      const alt = asString(block.alt, `${where}.alt`);
      if (alt.trim().length === 0) {
        fail(where, 'an image requires non-empty alt text (A11Y-R02)');
      }
      const caption = block.caption === null ? null : asString(block.caption, `${where}.caption`);
      return { type, mediaId, alt, caption };
    }
    case 'figure': {
      const mediaId = asString(block.mediaId, `${where}.mediaId`);
      const caption = block.caption === null ? null : asString(block.caption, `${where}.caption`);
      if (!Array.isArray(block.data) || block.data.some((d) => typeof d !== 'string')) {
        fail(where, 'figure.data must be an array of strings, so the figure can be read aloud');
      }
      return { type, mediaId, caption, data: block.data as string[] };
    }
    case 'divider':
      return { type };
    default:
      fail(where, `unknown block type ${JSON.stringify(type)}`);
  }
}

/**
 * Validate an untrusted blocks value and return it typed, or throw
 * `BlockValidationError`. Callers on the write path (`saveDraft`, `publish`)
 * let it throw: an invalid body is refused, never stored.
 */
export function validateBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) {
    fail('blocks', 'is not an array');
  }
  return value.map((raw, i) => validateBlock(raw, i));
}

/**
 * The blocks with speaker context removed from every heading (`DECK-001/T5`).
 *
 * Speaker context is written on a heading and kept for the overview and the
 * presenter; it is never served to an investor. The deck read strips it here — in
 * the repository function rather than in a template — so a reading surface cannot
 * serve it by forgetting to leave it out (`CMS-R03`'s discipline applied to a
 * field rather than to a row). It operates on the stored `jsonb` value, which is
 * the shape `validateBlocks` admitted on write, and removes only a heading's
 * `context`; every other block is returned unchanged. A value that is not an
 * array — which the column never holds — is returned as it came.
 */
export function withoutSpeakerContext(blocks: JsonValue): JsonValue {
  if (!Array.isArray(blocks)) {
    return blocks;
  }
  return blocks.map((block) => {
    if (typeof block !== 'object' || Array.isArray(block) || block.type !== 'heading') {
      return block;
    }
    const stripped = { ...block };
    delete stripped.context;
    return stripped;
  });
}
