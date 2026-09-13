'use client';

/**
 * The update composer (`POST-001/T1`–`T4`).
 *
 * **One screen, and that is the feature.** The generic path asks for a type, a
 * title, an address and an audience, then hands the author to an editor to write
 * in — four decisions before a word. An update is two sentences somebody has
 * thirty seconds for, so this asks for the kind, takes the words, and files it.
 *
 * **The cursor opens in the body** (`T1`), because the first thing an author
 * wants is to type. The kind sits above it and is required (`T2`): it is read
 * before the body is written because it is placed before it, and the file
 * control stays inert until one is chosen. Inert rather than refusing on press —
 * a disabled control cannot be pressed, so a message shown on press would never
 * be read; what carries the reason instead is a line beside the button naming
 * the missing thing, tied to it by `aria-describedby` so it reaches somebody who
 * cannot see the greying (`A11Y-R02`). Nothing is preselected — a default kind is
 * a kind nobody chose, and the reason the kind exists is that an investor
 * scanning for one should not have to read the other two.
 *
 * **The title is the first line** and updates as the body is typed, until the
 * author edits it separately, after which it stops following (`T4`) — a
 * suggestion that overwrites a decision is not a suggestion. It is shown rather
 * than hidden, because it is what the update will be called in a list and an
 * author who cannot see it cannot disagree with it.
 *
 * **The address is never asked for.** It is derived from the title, and the
 * answer shows it once the item exists, because a reader will see it.
 *
 * The body is plain text and becomes a paragraph per blank-line run, which is
 * `CMS-002`'s own paste rule rather than a second one. The full block vocabulary
 * is a navigation away in the editor, where an update that wants a figure goes
 * and an update that is two sentences never looks (`POST-001` §3).
 *
 * English console chrome (`ADMIN-002/T5`).
 */

import { useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { MAX_TITLE_LENGTH, titleFromBody } from '../../../content/derive';
import { blocksFromText } from '../../../content/paste';
import {
  CONTENT_PRODUCT_TAGS,
  CONTENT_UPDATE_KINDS,
  type ContentProductTag,
  type ContentUpdateKind,
} from '../../../db/types';

import styles from './compose.module.css';

const KIND_LABEL: Readonly<Record<ContentUpdateKind, string>> = {
  announcement: 'Announcement',
  achievement: 'Achievement',
  progress: 'Progress',
};

/**
 * What each kind is for, in the words `POST-001` §3 uses. Shown under the chosen
 * one rather than on all three at once: three paragraphs above an empty body is
 * the wall of text this surface exists to avoid, and the note is wanted at the
 * moment of doubt, which is after a choice rather than before it.
 */
const KIND_NOTE: Readonly<Record<ContentUpdateKind, string>> = {
  announcement: 'Something the company is telling investors: a hire, a partnership, a raise. Not a result.',
  achievement: 'Something that happened, with evidence: a launch, a certification, a customer. Not a plan.',
  progress: 'A number that moved, or a milestone reached on a product. Not news.',
};

const PRODUCT_LABEL: Readonly<Record<ContentProductTag, string>> = {
  'valo-ads': 'VALO Ads',
  'valo-pocket': 'VALO Pocket',
  shimmra: 'Shimmra',
  amavo: 'Amavo',
  farola: 'Farola',
  verdiq: 'Verdiq',
  company: 'The company',
};

const FAILED = 'Something went wrong. Try again in a moment.';
const LAPSED = 'Your session has ended. Open the page again to sign in.';

export function Composer(): ReactElement {
  const [kind, setKind] = useState<ContentUpdateKind | null>(null);
  const [product, setProduct] = useState<string>('');
  const [body, setBody] = useState('');
  const [ownTitle, setOwnTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  // The derived title is recomputed from the body; the author's own, once they
  // have written one, is kept and never overwritten.
  const derived = useMemo(() => titleFromBody(body), [body]);
  const title = ownTitle ?? derived;
  const ready = kind !== null && body.trim() !== '' && title.trim() !== '' && !busy;

  async function file(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    setBusy(true);
    setRefused(null);

    try {
      const response = await fetch('/admin/updates/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, product, title, blocks: blocksFromText(body) }),
      });

      if (response.redirected) {
        setRefused(LAPSED);
        setBusy(false);
        return;
      }

      const answer = (await response.json().catch(() => null)) as
        | { id?: string; detail?: string }
        | null;

      if (response.status === 200 && typeof answer?.id === 'string') {
        // To the item, where publishing lives (`CMS-004`). A full navigation,
        // because the page it lands on is server-rendered from the row this
        // just wrote.
        //
        // **`busy` is deliberately never cleared here.** `assign` does not
        // block, and a `return` inside `try` still runs `finally` -- so clearing
        // it would put "File it" back under the cursor while the next document
        // is still loading, and a second press would file a second update. The
        // address rule suffixes rather than refuses, so that second one would be
        // accepted silently: `we-shipped-it-2`, a titled shell nobody meant to
        // create. The page is leaving; the control stays spent.
        window.location.assign(`/admin/content/${answer.id}`);
        return;
      }

      setRefused(typeof answer?.detail === 'string' ? answer.detail : FAILED);
      setBusy(false);
    } catch {
      setRefused(FAILED);
      setBusy(false);
    }
  }

  return (
    <form className={styles.composer} onSubmit={(event) => void file(event)}>
      {/* The note under the group describes it, so a reader who hears "What kind
          of update is this?" also hears what the answer decides (`A11Y-R02`). */}
      <fieldset className={styles.kinds} aria-describedby="kind-note">
        <legend className={styles.legend}>What kind of update is this?</legend>
        <div className={styles.choices}>
          {CONTENT_UPDATE_KINDS.map((option) => (
            <label key={option} className={styles.choice}>
              <input
                id={`kind-${option}`}
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => {
                  setKind(option);
                  setRefused(null);
                }}
              />
              <span>{KIND_LABEL[option]}</span>
            </label>
          ))}
        </div>
        <p id="kind-note" className={styles.note}>
          {kind === null ? 'Required. It decides what an investor reads this as.' : KIND_NOTE[kind]}
        </p>
      </fieldset>

      <label className={styles.field} htmlFor="update-body">
        <span className={styles.label}>The update</span>
        <textarea
          id="update-body"
          className={styles.body}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={8}
          autoFocus
          placeholder="What happened. A blank line starts a new paragraph."
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field} htmlFor="update-title">
          <span className={styles.label}>Title</span>
          <input
            id="update-title"
            className={styles.input}
            type="text"
            value={title}
            // Emptying the field hands the title back to the first line rather
            // than keeping an empty string of the author's own: without this,
            // select-all and delete leaves a title that can never become
            // non-empty again, a disabled control, and no way out but a reload
            // that loses the body.
            onChange={(event) => setOwnTitle(event.target.value === '' ? null : event.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            placeholder="Taken from the first line"
          />
          <small className={styles.hint}>
            {ownTitle === null ? 'Following the first line. Edit it to fix it.' : 'Yours. The first line no longer changes it.'}
          </small>
        </label>

        <label className={styles.field} htmlFor="update-product">
          <span className={styles.label}>About</span>
          <select
            id="update-product"
            className={styles.input}
            value={product}
            onChange={(event) => setProduct(event.target.value)}
          >
            {/* Empty and first: not saying is a real answer and a different one
                from "the company", so it is what happens when nobody chooses. */}
            <option value="">Not said</option>
            {CONTENT_PRODUCT_TAGS.map((option) => (
              <option key={option} value={option}>
                {PRODUCT_LABEL[option]}
              </option>
            ))}
          </select>
          <small className={styles.hint}>Optional. It is how an investor follows one product.</small>
        </label>
      </div>

      <div className={styles.actions}>
        {/* Inert rather than refusing, and it says which thing is missing: a
            disabled control cannot be pressed, so an on-press message would
            never be read. `aria-describedby` is what carries the reason to
            somebody who cannot see the greying (`A11Y-R02`). */}
        <button
          type="submit"
          className={styles.file}
          disabled={!ready}
          aria-describedby={ready ? undefined : 'file-blocked'}
        >
          {busy ? 'Filing…' : 'File it'}
        </button>
        {ready ? null : (
          <small id="file-blocked" className={styles.hint}>
            {kind === null ? 'Choose what kind of update this is.' : 'Write the update first.'}
          </small>
        )}
        <small className={styles.hint}>
          Filing does not publish. You land on the item, where the preview and the publish control are.
        </small>
      </div>

      {refused === null ? null : (
        <p className={styles.refused} role="alert">
          {refused}
        </p>
      )}
    </form>
  );
}
