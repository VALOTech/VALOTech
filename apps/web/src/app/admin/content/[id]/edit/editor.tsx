'use client';

/**
 * The block editor (`CMS-002/T1`, `T2`, `T3`, `T6`, `T7`).
 *
 * The model is the block array, never the DOM (`CMS-002` §3): state is an
 * ordered list of blocks, and the surface is that list rendered. The block row
 * is the keyboard hub — focus it and the arrow keys move between blocks, `Enter`
 * makes a new one after it, and `Backspace` merges it into the one above; a
 * keystroke inside a field keeps its native meaning, so typing is never
 * hijacked (`A11Y-R01`). The same operations are also on visible, named buttons,
 * so nothing here needs a remembered shortcut.
 *
 * Saving is explicit (`T6`): a control, and `Ctrl`/`Cmd`-S. The unsaved state is
 * a standing line rather than a toast that is gone before an author looks up.
 * Between saves the blocks are kept in the browser's local storage under the
 * item's id and offered back if the tab was closed with work in it; that copy
 * is a convenience and the server's draft is the truth, so it is discarded the
 * moment a save succeeds (`CMS-002` §3).
 *
 * The one schema module validates before the POST (`T7`): an invalid document
 * is refused here with the block and field named, so the author does not reach
 * the server with something it will refuse — and the server validates again and
 * names the same fault, because a browser-side check is a convenience and never
 * a boundary. A refusal moves focus to the offending block rather than leaving a
 * banner to act on by eye, so a missing image alt is fixed where it is rather
 * than hunted for (`T3`, `A11Y-R02`).
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import { type Block, BLOCK_TYPES, BlockValidationError, validateBlocks } from '../../../../../content/blocks';

import { BlockFields, defaultBlock, TYPE_LABELS } from './block-fields';
import styles from './editor.module.css';

interface Item {
  readonly key: string;
  readonly block: Block;
}

/** The local-storage key the draft is mirrored under, per item. */
function storageKey(itemId: string): string {
  return `valotech.cms.draft.${itemId}`;
}

/** The three text-bearing types, whose text a merge concatenates. */
function textOf(block: Block): string | null {
  return block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote' ? block.text : null;
}

function withText(block: Block, text: string): Block {
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
    return { ...block, text };
  }
  return block;
}

function blocksOf(items: readonly Item[]): Block[] {
  return items.map((item) => item.block);
}

export function Editor({ itemId, initialBlocks }: { itemId: string; initialBlocks: Block[] }): ReactElement {
  const [items, setItems] = useState<Item[]>(() =>
    initialBlocks.map((block, index) => ({ key: `b${index}`, block })),
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restore, setRestore] = useState<Block[] | null>(null);

  const nextKey = useRef(initialBlocks.length);
  const selectedKey = useRef<string | null>(null);
  const focusKey = useRef<string | null>(null);
  const blockRefs = useRef(new Map<string, HTMLLIElement>());
  const firstWrite = useRef(true);

  function makeItem(block: Block): Item {
    nextKey.current += 1;
    return { key: `b${nextKey.current}`, block };
  }

  // Focus the block a mutation asked to focus, after it has rendered.
  useEffect(() => {
    if (focusKey.current === null) {
      return;
    }
    blockRefs.current.get(focusKey.current)?.focus();
    focusKey.current = null;
  });

  // Offer a local copy left from a previous visit, once, before the writer
  // below can overwrite it. It is offered only when it differs from the server
  // draft this page loaded — an identical copy is nothing to restore.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(itemId));
      if (stored !== null && stored !== JSON.stringify(initialBlocks)) {
        setRestore(validateBlocks(JSON.parse(stored)));
      }
    } catch {
      // A private window, cleared storage, or a copy that no longer parses:
      // there is simply nothing to offer, and the server draft stands.
    }
  }, [itemId, initialBlocks]);

  // Mirror the blocks to local storage as they change, skipping the first
  // render so the offer above reads the previous visit's copy, not this one.
  useEffect(() => {
    if (firstWrite.current) {
      firstWrite.current = false;
      return;
    }
    try {
      window.localStorage.setItem(storageKey(itemId), JSON.stringify(blocksOf(items)));
    } catch {
      // Losing the convenience copy is survivable; the save path is the truth.
    }
  }, [items, itemId]);

  // Warn before leaving with unsaved work. The browser shows its own prompt
  // when the event is cancelled; there is nothing to phrase here.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const saveRef = useRef<() => void>(() => {});
  saveRef.current = save;

  // Ctrl/Cmd-S saves, the way an author expects a document to. The latest save
  // is reached through a ref so the listener is attached once.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function change(next: Item[], focus: string | null): void {
    setItems(next);
    setDirty(true);
    setError(null);
    focusKey.current = focus;
  }

  function update(key: string, block: Block): void {
    change(items.map((item) => (item.key === key ? { ...item, block } : item)), null);
  }

  function insertAfter(afterKey: string | null, block: Block): void {
    const item = makeItem(block);
    const index = afterKey === null ? -1 : items.findIndex((existing) => existing.key === afterKey);
    const at = index < 0 ? items.length : index + 1;
    change([...items.slice(0, at), item, ...items.slice(at)], item.key);
  }

  function remove(key: string): void {
    const index = items.findIndex((item) => item.key === key);
    if (index < 0) {
      return;
    }
    const neighbour = items[index - 1] ?? items[index + 1];
    change(items.filter((item) => item.key !== key), neighbour?.key ?? null);
  }

  function move(key: string, direction: -1 | 1): void {
    const index = items.findIndex((item) => item.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) {
      return;
    }
    const reordered = [...items];
    const moved = reordered[index];
    const displaced = reordered[target];
    if (moved === undefined || displaced === undefined) {
      return;
    }
    reordered[index] = displaced;
    reordered[target] = moved;
    change(reordered, key);
  }

  // Backspace at the block's start: merge into the block above, concatenating
  // the text when both carry text, and focus the block that remains.
  function mergeUp(key: string): void {
    const index = items.findIndex((item) => item.key === key);
    const previous = items[index - 1];
    const current = items[index];
    if (index <= 0 || previous === undefined || current === undefined) {
      return;
    }
    const previousText = textOf(previous.block);
    const currentText = textOf(current.block);
    const merged =
      previousText !== null && currentText !== null
        ? items.map((item, i) => (i === index - 1 ? { ...item, block: withText(item.block, previousText + currentText) } : item))
        : items;
    change(
      merged.filter((_, i) => i !== index),
      previous.key,
    );
  }

  // A paste that carries structure (CMS-002/T5) arrives as blocks rather than
  // text: replace the block pasted into when it is an empty paragraph, otherwise
  // keep it and insert the pasted blocks after it. Focus the last one landed.
  function pasteBlocks(key: string, blocks: Block[]): void {
    if (blocks.length === 0) {
      return;
    }
    const index = items.findIndex((item) => item.key === key);
    if (index < 0) {
      return;
    }
    const current = items[index];
    const replace =
      current !== undefined &&
      current.block.type === 'paragraph' &&
      current.block.text.trim() === '' &&
      current.block.marks.length === 0;
    const made = blocks.map((block) => makeItem(block));
    const head = replace ? items.slice(0, index) : items.slice(0, index + 1);
    const tail = items.slice(index + 1);
    change([...head, ...made, ...tail], made[made.length - 1]?.key ?? null);
  }

  function onBlockKeyDown(key: string, event: ReactKeyboardEvent<HTMLLIElement>): void {
    // Only when the block row itself holds focus — a keystroke inside a field
    // keeps its native meaning.
    if (event.target !== event.currentTarget) {
      return;
    }
    const index = items.findIndex((item) => item.key === key);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      blockRefs.current.get(items[index + 1]?.key ?? key)?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      blockRefs.current.get(items[index - 1]?.key ?? key)?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      insertAfter(key, defaultBlock('paragraph'));
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      mergeUp(key);
    }
  }

  function save(): void {
    let blocks: Block[];
    try {
      blocks = validateBlocks(blocksOf(items));
    } catch (validation) {
      if (validation instanceof BlockValidationError) {
        setError(validation.message);
        // Take the author to the refused block instead of leaving a banner to
        // act on by eye; the focus effect moves to it on this render (`T3`).
        const faulty = validation.blockIndex === null ? undefined : items[validation.blockIndex];
        if (faulty !== undefined) {
          focusKey.current = faulty.key;
        }
      } else {
        setError('The document is not valid.');
      }
      return;
    }
    setError(null);
    setSaving(true);
    void postDraft(blocks);
  }

  async function postDraft(blocks: Block[]): Promise<void> {
    try {
      const response = await fetch(`/admin/content/${itemId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });
      if (response.redirected) {
        setError('Your session has ended. Open the page again to sign in.');
      } else if (response.status === 200) {
        setDirty(false);
        discardLocalCopy();
      } else if (response.status === 422) {
        const body = (await response.json()) as { detail?: string };
        setError(body.detail ?? 'The server refused the document.');
      } else {
        setError(`The draft could not be saved (status ${response.status}).`);
      }
    } catch {
      setError('The draft could not be saved — the network request failed.');
    } finally {
      setSaving(false);
    }
  }

  function discardLocalCopy(): void {
    try {
      window.localStorage.removeItem(storageKey(itemId));
    } catch {
      // Nothing to discard, or storage is unavailable; the server draft stands.
    }
  }

  function applyRestore(blocks: Block[]): void {
    change(
      blocks.map((block) => makeItem(block)),
      null,
    );
    setRestore(null);
  }

  return (
    <div className={styles.editor}>
      <h1>Edit content</h1>

      {restore !== null ? (
        <div className={styles.restoreBanner} role="status">
          <p>A local copy of unsaved changes was found from a previous visit.</p>
          <div className={styles.blockControls}>
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => applyRestore(restore)}>
              Restore it
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                discardLocalCopy();
                setRestore(null);
              }}
            >
              Discard it
            </button>
          </div>
        </div>
      ) : null}

      <p className={`${styles.statusLine} ${dirty ? styles.dirty : styles.clean}`} role="status">
        {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
      </p>

      {error !== null ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        <span className={styles.clean}>or press Ctrl/Cmd-S</span>
      </div>

      {items.length === 0 ? <p className={styles.empty}>No blocks yet. Add one below.</p> : null}

      <ul className={styles.blocks}>
        {items.map((item, index) => (
          <li
            key={item.key}
            className={styles.block}
            tabIndex={0}
            aria-label={`${TYPE_LABELS[item.block.type]} block, ${index + 1} of ${items.length}`}
            ref={(element) => {
              if (element === null) {
                blockRefs.current.delete(item.key);
              } else {
                blockRefs.current.set(item.key, element);
              }
            }}
            onFocus={() => {
              selectedKey.current = item.key;
            }}
            onKeyDown={(event) => onBlockKeyDown(item.key, event)}
          >
            <div className={styles.blockHeader}>
              <span className={styles.blockType}>{TYPE_LABELS[item.block.type]}</span>
              <div className={styles.blockControls}>
                <button
                  type="button"
                  className={styles.button}
                  aria-label={`Move ${TYPE_LABELS[item.block.type]} up`}
                  disabled={index === 0}
                  onClick={() => move(item.key, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className={styles.button}
                  aria-label={`Move ${TYPE_LABELS[item.block.type]} down`}
                  disabled={index === items.length - 1}
                  onClick={() => move(item.key, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className={styles.button}
                  aria-label={`Delete ${TYPE_LABELS[item.block.type]}`}
                  onClick={() => remove(item.key)}
                >
                  Delete
                </button>
              </div>
            </div>
            <BlockFields
              block={item.block}
              onChange={(block) => update(item.key, block)}
              onPaste={(blocks) => pasteBlocks(item.key, blocks)}
            />
          </li>
        ))}
      </ul>

      <details className={styles.toolbar}>
        <summary>Add a block</summary>
        <div className={styles.menu} role="group" aria-label="Block types">
          {BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={styles.button}
              onClick={() => insertAfter(selectedKey.current, defaultBlock(type))}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
