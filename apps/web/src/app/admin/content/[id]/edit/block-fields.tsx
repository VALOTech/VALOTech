'use client';

/**
 * The fields each block type demands (`CMS-002/T2`), and the factory that makes
 * an empty one of a chosen type (`CMS-002/T1`).
 *
 * The editor's model is the block array, not the DOM (`CMS-002` §3): a field
 * edit produces a new `Block` value and hands it up, and the same `Block` union
 * the one schema module validates is the one these controls edit. Every input
 * carries a label, so each control has an accessible name (`A11Y-R02`). Marks
 * (`CMS-002/T4`) are a later task: a paragraph's text is edited here as plain
 * text and its marks travel unchanged.
 */

import type { ReactElement } from 'react';
import { useId } from 'react';

import type { Block, BlockType } from '../../../../../content/blocks';

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

function ParagraphFields({ block, onChange }: { block: Narrow<'paragraph'>; onChange: (b: Block) => void }): ReactElement {
  return (
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
export function BlockFields({ block, onChange }: { block: Block; onChange: (b: Block) => void }): ReactElement {
  switch (block.type) {
    case 'heading':
      return <HeadingFields block={block} onChange={onChange} />;
    case 'paragraph':
      return <ParagraphFields block={block} onChange={onChange} />;
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
