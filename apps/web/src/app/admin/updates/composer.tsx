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
 * **Two things are shown beside the writing rather than enforced on it.** The
 * tagged product's standing (`T6`), so an update saying something moved is
 * written beside what it moved from and the two cannot quietly disagree. And a
 * marker at around two hundred words (`T5`), which offers to move the text into
 * the report being drafted — because an update that got long is usually a report
 * section written in the wrong surface, and cutting it would be the wrong advice.
 * Neither blocks anything: the marker can be ignored for ever, and there is no
 * length this refuses.
 *
 * English console chrome (`ADMIN-002/T5`).
 */

import { useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { MAX_TITLE_LENGTH, titleFromBody } from '../../../content/derive';
import type { PortfolioStage } from '../../../db/types';
import type { Standing } from '../../../portfolio/board';
import { standingOf } from '../../../portfolio/board';
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

/**
 * Where an update stops being an update (`POST-001` §3).
 *
 * Around two hundred words. Nothing is enforced at it — the marker appears and the
 * author may ignore it for ever — because a limit on an update is a limit on what
 * somebody had to say, and the interesting case is not that they wrote too much
 * but that they wrote it in the wrong place.
 */
const LONG_UPDATE_WORDS = 200;

/**
 * How the four stage words read to an admin. The vocabulary is closed
 * (`INV-003` §3), and this is keyed by it rather than by `string` so a fifth
 * stage stops the build here instead of reaching a screen as a raw token.
 */
const STAGE_LABEL: Readonly<Record<PortfolioStage, string>> = {
  building: 'Building',
  'in private use': 'In private use',
  'in market': 'In market',
  paused: 'Paused',
};

const CHANGED = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const FAILED = 'Something went wrong. Try again in a moment.';
const LAPSED = 'Your session has ended. Open the page again to sign in.';

/** The report being written, as much of it as the composer needs to offer a move. */
export interface DraftReport {
  readonly id: string;
  readonly title: string;
  readonly period: string | null;
}

export function Composer({
  board,
  draft,
}: {
  /** All six standings, read once on the server (`POST-001/T6`). */
  readonly board: readonly Standing[];
  /** The report an author is drafting, or null when none is (`POST-001/T5`). */
  readonly draft: DraftReport | null;
}): ReactElement {
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

  // Counted rather than measured in characters: two hundred words is the unit
  // `POST-001` §3 states, and it is the one a person writing prose can feel.
  const words = useMemo(() => body.trim().split(/\s+/).filter((word) => word !== '').length, [body]);
  const long = words >= LONG_UPDATE_WORDS;

  // Null for "not said" and for the company, which is not a board row: the board
  // is where products stand, and the company is not a product.
  const tagged = product === '' ? null : standingOf(board, product);
  const ready = kind !== null && body.trim() !== '' && title.trim() !== '' && !busy;

  /**
   * Move what is written into the report being drafted (`POST-001/T5`).
   *
   * The destination is not sent: the route asks `draftReport` itself, so this
   * surface cannot append to anything but the one report an author is writing.
   * Nothing is cleared on the way out — if the move is refused the words are
   * still here, which is the whole reason the refusal is worth showing.
   */
  async function moveToReport(): Promise<void> {
    setBusy(true);
    setRefused(null);

    try {
      const response = await fetch('/admin/updates/to-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: blocksFromText(body) }),
      });

      if (response.redirected) {
        setRefused(LAPSED);
        setBusy(false);
        return;
      }

      const answer = (await response.json().catch(() => null)) as
        | { reportId?: string; detail?: string }
        | null;

      if (response.status === 200 && typeof answer?.reportId === 'string') {
        // To the report's editor, where the moved text now sits at the end and
        // the author can put it where it belongs. `busy` stays set for the
        // reason it stays set after filing: the page is leaving.
        window.location.assign(`/admin/content/${answer.reportId}/edit`);
        return;
      }

      setRefused(typeof answer?.detail === 'string' ? answer.detail : FAILED);
      setBusy(false);
    } catch {
      setRefused(FAILED);
      setBusy(false);
    }
  }

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

      {/* Where the tagged product stands, so an update saying something moved is
          written beside what it moved from (`POST-001/T6`). The stage is a word
          and not a colour alone (`A11Y-R03`), and a product nobody has written a
          row for says so rather than showing an assumption as a statement. */}
      {tagged === null ? null : (
        <aside className={styles.standing} aria-label="Where this product stands">
          <p className={styles.standingStage}>
            <strong>{STAGE_LABEL[tagged.stage]}</strong>
            {tagged.set && tagged.changedAt !== null ? (
              <span className={styles.hint}> · last changed {CHANGED.format(tagged.changedAt)}</span>
            ) : (
              <span className={styles.hint}> · nobody has set this yet</span>
            )}
          </p>
          {tagged.headline === null ? null : <p className={styles.hint}>{tagged.headline}</p>}
        </aside>
      )}

      {/* **The live region is always in the DOM and holds no counter.** A region
          inserted together with its first content is announced unreliably, and
          one containing {words} would announce again on every keystroke past the
          threshold — a metronome for exactly the reader who cannot skim past it.
          So the announcement is one sentence that changes once, and the count
          below is visual. */}
      <p className={styles.announce} role="status">
        {long ? 'This update is long enough to be a report section.' : ''}
      </p>

      {/* Not a limit and not an error: nothing is enforced at two hundred words.
          It is offered because the honest answer to "this got long" is usually
          that it belongs in the report, not that it should be cut. */}
      {!long ? null : (
        <aside className={styles.marker}>
          <p>
            <strong>{words} words.</strong> An update this long is usually a report section.
          </p>
          {draft === null ? (
            <p className={styles.hint}>
              No report is being drafted at the moment, so there is nowhere to move it. Filing it as an
              update is fine.
            </p>
          ) : (
            <>
              <button type="button" className={styles.move} disabled={busy} onClick={() => void moveToReport()}>
                Move it into the {draft.period ?? 'current'} report
              </button>
              <small className={styles.hint}>
                It goes to the end of {draft.title}, still a draft, where you can put it where it
                belongs. Any translations of that draft are dropped, because its words change.
              </small>
            </>
          )}
        </aside>
      )}

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
