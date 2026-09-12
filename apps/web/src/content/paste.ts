/**
 * Turning pasted content into blocks (`CMS-002/T5`).
 *
 * Paste imports plain text plus recognised structure and nothing else
 * (`CMS-002` §3): headings, lists and links survive, and everything else becomes
 * a paragraph. A foreign stylesheet, a script, a table, an inline colour — none
 * of it crosses the form, because the parser reads the pasted HTML into the block
 * vocabulary `CMS-001` defines rather than keeping any markup (`CMS-R04`). The
 * only inline emphasis a paste keeps is the link, and only a safe one: a
 * `javascript:` or `data:` href drops to plain text (`isSafeMarkHref`), since a
 * stored link is rendered as an `<a href>` a reader follows. Bold and italic are
 * re-applied by selection (`CMS-002/T4`), not smuggled in with a stylesheet.
 *
 * `blocksFromText` is the plain-text path and is pure — no DOM — so it is the
 * fallback when there is no HTML and it is what the unit tests pin. `blocksFromHtml`
 * parses with the browser's own `DOMParser`, which exists only at paste time in
 * the client; it is verified in a browser, driving a real paste, because a DOM
 * parser is a browser thing and a mock of it would prove nothing.
 */

import { isSafeMarkHref, type Block, type Mark } from './blocks';

/** Elements whose content is never text: their children are dropped entirely. */
const DROP = new Set(['script', 'style', 'head', 'noscript', 'template', 'title']);

/** Elements that are a paragraph boundary of their own. */
const PARAGRAPHS = new Set(['p', 'blockquote']);

/** Transparent containers: not a block themselves, walked through for what they hold. */
const CONTAINERS = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'body', 'span', 'font']);

/** A paragraph under construction: its text so far and the link marks placed in it. */
interface Draft {
  text: string;
  marks: Mark[];
}

/** Collapse each run of whitespace to one space — the way HTML renders it — as text is appended. */
function pushText(draft: Draft, raw: string): void {
  draft.text += raw.replace(/\s+/g, ' ');
}

/**
 * Walk an inline subtree into `draft`, keeping only link marks. An anchor with a
 * target records a mark over the span its text occupies; every other element
 * contributes its text and no mark, so bold, italic, a coloured span and a bare
 * `<code>` all flatten to plain text (`CMS-002` §3: everything else is a paragraph).
 */
function collectInline(node: Node, draft: Draft): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 /* text */) {
      pushText(draft, child.textContent ?? '');
      continue;
    }
    if (child.nodeType !== 1 /* element */) {
      continue;
    }
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (DROP.has(tag)) {
      continue;
    }
    if (tag === 'br') {
      pushText(draft, ' ');
      continue;
    }
    if (tag === 'a') {
      const href = (element.getAttribute('href') ?? '').trim();
      const start = draft.text.length;
      collectInline(element, draft);
      const end = draft.text.length;
      // The link's text stays; only a safe target becomes a mark, so a pasted
      // `javascript:` or `data:` href drops to plain text (`isSafeMarkHref`).
      if (isSafeMarkHref(href) && start < end) {
        draft.marks.push({ start, end, type: 'link', href });
      }
      continue;
    }
    collectInline(element, draft);
  }
}

/** Trim a draft's ends, shifting and clipping its marks to the trimmed text; empty becomes null. */
function finishParagraph(draft: Draft): Block | null {
  const leading = draft.text.length - draft.text.trimStart().length;
  const text = draft.text.trim();
  if (text.length === 0) {
    return null;
  }
  const marks: Mark[] = [];
  for (const mark of draft.marks) {
    const start = Math.max(0, Math.min(mark.start - leading, text.length));
    const end = Math.max(0, Math.min(mark.end - leading, text.length));
    if (start < end) {
      marks.push({ ...mark, start, end });
    }
  }
  return { type: 'paragraph', text, marks };
}

/** The plain, mark-free text of an element — for a heading or a list item, which carry no marks. */
function textOf(element: Element): string {
  const draft: Draft = { text: '', marks: [] };
  collectInline(element, draft);
  return draft.text.trim();
}

/**
 * Read a subtree into blocks. Inline content between block elements accumulates
 * into a paragraph that is flushed when the next block boundary is reached, so a
 * heading followed by loose text followed by a list becomes three blocks in order.
 */
function readInto(node: Node, blocks: Block[], pending: { draft: Draft }): void {
  const flush = (): void => {
    const paragraph = finishParagraph(pending.draft);
    if (paragraph !== null) {
      blocks.push(paragraph);
    }
    pending.draft = { text: '', marks: [] };
  };

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 /* text */) {
      pushText(pending.draft, child.textContent ?? '');
      continue;
    }
    if (child.nodeType !== 1 /* element */) {
      continue;
    }
    const element = child as Element;
    const tag = element.tagName.toLowerCase();

    if (DROP.has(tag)) {
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      flush();
      const text = textOf(element);
      if (text.length > 0) {
        // Two heading levels exist (`CMS-001`): h1 and h2 map to the section
        // level, h3 and below to the sub-level, so a pasted outline keeps its
        // shape without inventing depths the model does not have.
        blocks.push({ type: 'heading', level: tag === 'h1' || tag === 'h2' ? 2 : 3, text });
      }
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      flush();
      const items = Array.from(element.children)
        .filter((li) => li.tagName.toLowerCase() === 'li')
        .map((li) => textOf(li))
        .filter((text) => text.length > 0);
      if (items.length > 0) {
        blocks.push({ type: 'list', ordered: tag === 'ol', items });
      }
      continue;
    }
    if (PARAGRAPHS.has(tag)) {
      flush();
      const draft: Draft = { text: '', marks: [] };
      collectInline(element, draft);
      const paragraph = finishParagraph(draft);
      if (paragraph !== null) {
        blocks.push(paragraph);
      }
      continue;
    }
    if (CONTAINERS.has(tag)) {
      readInto(element, blocks, pending);
      continue;
    }
    // Any other inline element (a, strong, em, code, ...) joins the pending
    // paragraph, keeping only a link mark.
    collectInline(element, pending.draft);
  }
}

/**
 * Blocks from a plain-text paste: a paragraph per run separated by a blank line,
 * each run's internal newlines becoming spaces. Pure, and the fallback when a
 * paste carries no HTML. Empty in, empty out.
 */
export function blocksFromText(text: string): Block[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((run) => run.replace(/\s+/g, ' ').trim())
    .filter((run) => run.length > 0)
    .map((run) => ({ type: 'paragraph', text: run, marks: [] }));
}

/**
 * Blocks from a pasted HTML fragment, keeping headings, lists and link marks and
 * dropping everything else to text (`CMS-002` §3). Uses the browser's `DOMParser`,
 * so it runs at paste time in the client and is verified in a browser.
 */
export function blocksFromHtml(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: Block[] = [];
  const pending = { draft: { text: '', marks: [] } as Draft };
  readInto(doc.body, blocks, pending);
  const trailing = finishParagraph(pending.draft);
  if (trailing !== null) {
    blocks.push(trailing);
  }
  return blocks;
}

/**
 * The blocks a paste imports: the HTML fragment when the clipboard carries one,
 * the plain text otherwise, and the plain text as a fallback when the HTML held
 * nothing renderable. Never returns markup, only blocks (`CMS-R04`).
 */
export function pasteToBlocks(html: string | null, text: string): Block[] {
  if (html !== null && html.trim().length > 0) {
    const fromHtml = blocksFromHtml(html);
    if (fromHtml.length > 0) {
      return fromHtml;
    }
  }
  return blocksFromText(text);
}

/**
 * Whether a paste should import blocks rather than fall to the browser's own
 * inline insertion. A single plain paragraph with no marks is ordinary inline
 * text — let the textarea take it where the cursor is; anything else (more than
 * one block, a heading or list, or a link) is structure worth importing.
 */
export function isStructured(blocks: Block[]): boolean {
  if (blocks.length !== 1) {
    return blocks.length > 1;
  }
  const [only] = blocks;
  if (only === undefined) {
    return false;
  }
  return only.type !== 'paragraph' || only.marks.length > 0;
}
