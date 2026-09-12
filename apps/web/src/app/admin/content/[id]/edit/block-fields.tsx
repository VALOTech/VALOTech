'use client';

/**
 * The fields each block type demands (`CMS-002/T2`), and the factory that makes
 * an empty one of a chosen type (`CMS-002/T1`).
 *
 * The editor's model is the block array, not the DOM (`CMS-002` §3): a field
 * edit produces a new `Block` value and hands it up, and the same `Block` union
 * the one schema module validates is the one these controls edit. Every input
 * carries a label, so each control has an accessible name (`A11Y-R02`). A
 * paragraph's emphasis is marks over its plain text (`CMS-002/T4`): the toolbar
 * applies one to the textarea's selection, the marks list shows and removes
 * them, and editing the text remaps their offsets — all on the block's own data
 * through `content/marks.ts`, never a rendered node.
 */

import type { ClipboardEvent, ReactElement } from 'react';
import { useId, useRef, useState } from 'react';

import type { Block, BlockType, Mark, MarkType } from '../../../../../content/blocks';
import { applyMark, remapMarks, removeMark } from '../../../../../content/marks';
import { isStructured, pasteToBlocks } from '../../../../../content/paste';

import styles from './editor.module.css';

/** The written name of each type — visible on the block and its menu entry. */
export const TYPE_LABELS: Readonly<Record<BlockType, string>> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  list: 'List',
  quote: 'Quote',
  image: 'Image',
  figure: 'Figure',
  divider: 'Divider',
};

/** An empty block of the chosen type, with the fields its schema requires. */
export function defaultBlock(type: BlockType): Block {
  switch (type) {
    case 'heading':
      return { type, level: 2, text: '' };
    case 'paragraph':
      return { type, text: '', marks: [] };
    case 'list':
      return { type, ordered: false, items: [''] };
    case 'quote':
      return { type, text: '', attribution: null };
    case 'image':
      return { type, mediaId: '', alt: '', caption: null };
    case 'figure':
      return { type, mediaId: '', caption: null, data: [''] };
    case 'divider':
      return { type };
  }
}

/** An empty text field stores as `null` for the columns the schema makes optional. */
function orNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}

type Narrow<T extends BlockType> = Extract<Block, { type: T }>;

function Field({ label, children }: { label: string; children: (id: string) => ReactElement }): ReactElement {
  const id = useId();
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.fieldLabel}>{label}</span>
      {children(id)}
    </label>
  );
}

function HeadingFields({ block, onChange }: { block: Narrow<'heading'>; onChange: (b: Block) => void }): ReactElement {
  return (
    <>
      <Field label="Level">
        {(id) => (
          <select
            id={id}
            className={styles.select}
            value={block.level}
            onChange={(e) => onChange({ ...block, level: Number(e.target.value) === 3 ? 3 : 2 })}
          >
            <option value={2}>Heading 2</option>
            <option value={3}>Heading 3</option>
          </select>
        )}
      </Field>
      <Field label="Text">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        )}
      </Field>
    </>
  );
}

/** The written name of each mark type, on the toolbar and in the marks list. */
const MARK_LABELS: Readonly<Record<MarkType, string>> = {
  strong: 'Bold',
  em: 'Italic',
  code: 'Code',
  link: 'Link',
};

/** The three emphasis marks the toolbar toggles; a link is separate, since it needs a target. */
const EMPHASIS: readonly MarkType[] = ['strong', 'em', 'code'];

function ParagraphFields({
  block,
  onChange,
  onPaste,
}: {
  block: Narrow<'paragraph'>;
  onChange: (b: Block) => void;
  onPaste: (blocks: Block[]) => void;
}): ReactElement {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [href, setHref] = useState('');
  const hasSelection = selection.start < selection.end;

  function rememberSelection(): void {
    const element = textareaRef.current;
    if (element !== null) {
      setSelection({ start: element.selectionStart, end: element.selectionEnd });
    }
  }

  // The text and its marks are one value handed up together: editing the text
  // remaps the marks so a span still covers the words it covered, and the model
  // stays the block array rather than a rendered node (`CMS-002/T4`).
  function changeText(text: string): void {
    onChange({ ...block, text, marks: remapMarks(block.marks, block.text, text) });
  }

  function addEmphasis(type: MarkType): void {
    onChange({ ...block, marks: applyMark(block.marks, type, selection.start, selection.end) });
  }

  function addLink(): void {
    onChange({ ...block, marks: applyMark(block.marks, 'link', selection.start, selection.end, href) });
    setHref('');
  }

  // A paste carrying structure -- a heading, a list, more than one paragraph, or
  // a link -- is imported as blocks and nothing else (CMS-002/T5); plain inline
  // text falls through to the textarea's own insertion, so a pasted word lands at
  // the cursor and its offsets are remapped by changeText. text/html is read when
  // the clipboard offers it, which is how a pasted link survives as a mark.
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    const blocks = pasteToBlocks(html.length > 0 ? html : null, text);
    if (isStructured(blocks)) {
      event.preventDefault();
      onPaste(blocks);
    }
  }

  return (
    <div className={styles.paragraph}>
      <label className={styles.field} htmlFor={id}>
        <span className={styles.fieldLabel}>Text</span>
        <textarea
          id={id}
          ref={textareaRef}
          className={styles.textarea}
          value={block.text}
          onChange={(e) => changeText(e.target.value)}
          onSelect={rememberSelection}
          onPaste={handlePaste}
        />
      </label>

      <div className={styles.markBar} role="group" aria-label="Emphasis">
        {EMPHASIS.map((type) => (
          <button
            key={type}
            type="button"
            className={styles.button}
            disabled={!hasSelection}
            // Keep the textarea's selection: a button that took focus would collapse it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => addEmphasis(type)}
          >
            {MARK_LABELS[type]}
          </button>
        ))}
        <span className={styles.linkControl}>
          <input
            className={styles.input}
            aria-label="Link URL"
            placeholder="https://…"
            value={href}
            onChange={(event) => setHref(event.target.value)}
          />
          <button
            type="button"
            className={styles.button}
            disabled={!hasSelection || href.trim() === ''}
            onMouseDown={(event) => event.preventDefault()}
            onClick={addLink}
          >
            Link
          </button>
        </span>
      </div>

      <MarksList text={block.text} marks={block.marks} onChange={(marks) => onChange({ ...block, marks })} />
    </div>
  );
}

/**
 * The paragraph's marks, each shown as its kind and the words it covers, with a
 * control to remove it. A textarea cannot render bold inline, so this list is
 * how an author sees which text a mark holds — and, after the text is edited,
 * that the offsets still land on the right words (`CMS-002/T4`). Absent until a
 * mark exists.
 */
function MarksList({
  text,
  marks,
  onChange,
}: {
  text: string;
  marks: Mark[];
  onChange: (marks: Mark[]) => void;
}): ReactElement | null {
  if (marks.length === 0) {
    return null;
  }
  return (
    <ul className={styles.markList} aria-label="Marks on this paragraph">
      {marks.map((mark, index) => {
        const covered = text.slice(mark.start, mark.end);
        return (
          <li key={`${mark.type}-${mark.start}-${mark.end}-${index}`} className={styles.markItem}>
            <span className={styles.markKind}>{MARK_LABELS[mark.type]}</span>
            <span className={styles.markText}>{covered}</span>
            {mark.type === 'link' ? <span className={styles.markHref}>{mark.href}</span> : null}
            <button
              type="button"
              className={styles.button}
              aria-label={`Remove ${MARK_LABELS[mark.type]} on “${covered}”`}
              onClick={() => onChange(removeMark(marks, index))}
            >
              Remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function QuoteFields({ block, onChange }: { block: Narrow<'quote'>; onChange: (b: Block) => void }): ReactElement {
  return (
    <>
      <Field label="Text">
        {(id) => (
          <textarea
            id={id}
            className={styles.textarea}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        )}
      </Field>
      <Field label="Attribution (optional)">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={block.attribution ?? ''}
            onChange={(e) => onChange({ ...block, attribution: orNull(e.target.value) })}
          />
        )}
      </Field>
    </>
  );
}

function ImageFields({ block, onChange }: { block: Narrow<'image'>; onChange: (b: Block) => void }): ReactElement {
  return (
    <>
      <Field label="Media id">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={block.mediaId}
            onChange={(e) => onChange({ ...block, mediaId: e.target.value })}
          />
        )}
      </Field>
      <Field label="Alternative text (required)">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={block.alt}
            onChange={(e) => onChange({ ...block, alt: e.target.value })}
          />
        )}
      </Field>
      <Field label="Caption (optional)">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={block.caption ?? ''}
            onChange={(e) => onChange({ ...block, caption: orNull(e.target.value) })}
          />
        )}
      </Field>
    </>
  );
}

function FigureFields({ block, onChange }: { block: Narrow<'figure'>; onChange: (b: Block) => void }): ReactElement {
  return (
    <>
      <Field label="Media id">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={block.mediaId}
            onChange={(e) => onChange({ ...block, mediaId: e.target.value })}
          />
        )}
      </Field>
      <Field label="Caption (optional)">
        {(id) => (
          <input
            id={id}
            className={styles.input}
            value={block.caption ?? ''}
            onChange={(e) => onChange({ ...block, caption: orNull(e.target.value) })}
          />
        )}
      </Field>
      <StringListEditor
        label="Data — the numbers behind the figure"
        noun="value"
        values={block.data}
        onChange={(data) => onChange({ ...block, data })}
      />
    </>
  );
}

/**
 * A string array edited as a row of inputs with add and remove, shared by a
 * list's items and a figure's data. At least one row is kept, so the control
 * always offers somewhere to type; the schema admits an empty array, and a
 * single empty row validates as one empty string.
 */
function StringListEditor({
  label,
  noun,
  values,
  onChange,
}: {
  label: string;
  noun: string;
  values: string[];
  onChange: (next: string[]) => void;
}): ReactElement {
  function setAt(index: number, value: string): void {
    onChange(values.map((existing, i) => (i === index ? value : existing)));
  }

  return (
    <div className={styles.field} role="group" aria-label={label}>
      <span className={styles.fieldLabel}>{label}</span>
      {values.map((value, index) => (
        // The row's identity is its position: every input is controlled by the
        // array, and these rows are added and removed but never reordered, so a
        // positional key drives the right value into each row.
        <div className={styles.itemRow} key={index}>
          <input
            className={styles.input}
            aria-label={`${noun} ${index + 1}`}
            value={value}
            onChange={(e) => setAt(index, e.target.value)}
          />
          <button
            type="button"
            className={styles.button}
            aria-label={`Remove ${noun} ${index + 1}`}
            disabled={values.length <= 1}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className={styles.button} onClick={() => onChange([...values, ''])}>
        Add {noun}
      </button>
    </div>
  );
}

function ListFields({ block, onChange }: { block: Narrow<'list'>; onChange: (b: Block) => void }): ReactElement {
  const orderId = useId();
  return (
    <>
      <label className={styles.field} htmlFor={orderId}>
        <span className={styles.fieldLabel}>Ordered (numbered)</span>
        <input
          id={orderId}
          type="checkbox"
          checked={block.ordered}
          onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
        />
      </label>
      <StringListEditor
        label="Items"
        noun="item"
        values={block.items}
        onChange={(items) => onChange({ ...block, items })}
      />
    </>
  );
}

/** Dispatch to the fields for this block's type. */
export function BlockFields({
  block,
  onChange,
  onPaste,
}: {
  block: Block;
  onChange: (b: Block) => void;
  onPaste: (blocks: Block[]) => void;
}): ReactElement {
  switch (block.type) {
    case 'heading':
      return <HeadingFields block={block} onChange={onChange} />;
    case 'paragraph':
      return <ParagraphFields block={block} onChange={onChange} onPaste={onPaste} />;
    case 'list':
      return <ListFields block={block} onChange={onChange} />;
    case 'quote':
      return <QuoteFields block={block} onChange={onChange} />;
    case 'image':
      return <ImageFields block={block} onChange={onChange} />;
    case 'figure':
      return <FigureFields block={block} onChange={onChange} />;
    case 'divider':
      return <p className={styles.empty}>A divider has no fields.</p>;
  }
}
