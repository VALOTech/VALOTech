'use client';

/**
 * The review screen's two controls (`CMS-005/T4`, `CMS-005/T3`).
 *
 * `StartTranslation` is the whole of starting one: the room runs no translation
 * service (`CMS-DEC-04`), so pressing it copies the English under this language's
 * label and nothing else. The button says that rather than promising a
 * translation, because a control named "Translate" that produces English is the
 * kind of surface an admin trusts once.
 *
 * `ReviewScreen` pairs each string with the English it replaces and lets only the
 * words be edited: the structure, the order and the picture are the document's
 * and are rebuilt on the server from the source (`content/translation.ts`). Every
 * field is a labelled control tied to the English beside it by `aria-describedby`,
 * so the pair survives a screen reader, where a two-column layout does not
 * (`A11Y-R02`).
 *
 * **Marking is the save.** There is no separate draft-save: the text a reviewer
 * wrote and their approval of it travel together (`CMS-005` section 3), so no row
 * is ever marked reviewed holding something nobody read. That makes losing the
 * tab expensive, so the screen says so standing rather than in a toast that is
 * gone before anybody looks up.
 */

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type { Block } from '../../../../../../content/blocks';
import { fieldsOf } from '../../../../../../content/translation';

import styles from './review.module.css';

type Outcome =
  | { readonly kind: 'reviewed' }
  | { readonly kind: 'failed'; readonly reason: string };

const FAILED = 'Nothing was saved. Try again in a moment.';
const LAPSED = 'Your session has ended. Open the page again to sign in.';

/** Start a translation of this language by seeding it with the English. */
export function StartTranslation({
  itemId,
  locale,
  language,
}: {
  readonly itemId: string;
  readonly locale: string;
  readonly language: string;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function start(): Promise<void> {
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch(`/admin/content/${itemId}/locales/${locale}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (response.status === 200) {
        window.location.reload();
        return;
      }
      setFailure(response.redirected ? LAPSED : FAILED);
    } catch {
      setFailure(FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.start}>
      <p>
        {language} has not been started. Starting it copies the English text under this language’s
        label, for you to translate here. Nothing is shown to a reader until you mark it reviewed.
      </p>
      <button type="button" className={styles.primary} onClick={() => void start()} disabled={busy}>
        {busy ? 'Starting…' : `Start ${language} from the English`}
      </button>
      {failure === null ? null : (
        <p className={styles.failed} role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}

/** The source beside the translation, one editable string at a time. */
export function ReviewScreen({
  itemId,
  locale,
  language,
  source,
  translation,
  reviewed,
}: {
  readonly itemId: string;
  readonly locale: string;
  readonly language: string;
  readonly source: readonly Block[];
  readonly translation: readonly Block[];
  readonly reviewed: boolean;
}): ReactElement {
  const sourceFields = source.map((block) => fieldsOf(block));
  const [values, setValues] = useState<string[][]>(() =>
    translation.map((block) => fieldsOf(block).map((field) => field.value)),
  );
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  function edit(block: number, field: number, value: string): void {
    setOutcome(null);
    setValues((all) =>
      all.map((row, index) =>
        index === block ? row.map((entry, position) => (position === field ? value : entry)) : row,
      ),
    );
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);

    try {
      const response = await fetch(`/admin/content/${itemId}/locales/${locale}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: values }),
      });

      if (response.status === 200) {
        setOutcome({ kind: 'reviewed' });
      } else if (response.redirected) {
        setOutcome({ kind: 'failed', reason: LAPSED });
      } else {
        setOutcome({ kind: 'failed', reason: FAILED });
      }
    } catch {
      setOutcome({ kind: 'failed', reason: FAILED });
    } finally {
      setBusy(false);
    }
  }

  // Compared against the English by position, which is the same walk the server
  // rebuilds the document with, so the count is of fields a reviewer has not
  // touched rather than of fields that merely look similar.
  const english = sourceFields.flat().map((field) => field.value);
  const untranslated = values.flat().filter((value, index) => value === english[index]).length;

  return (
    <form className={styles.review} onSubmit={(event) => void submit(event)}>
      <p className={styles.standing}>
        Nothing here is saved until you mark {language} reviewed, and marking it is what shows it to
        readers.
      </p>

      <ol className={styles.blocks}>
        {source.map((block, blockIndex) => {
          const fields = sourceFields[blockIndex] ?? [];

          return (
            <li key={blockIndex} className={styles.block}>
              {fields.length === 0 ? (
                <p className={styles.nothing}>Nothing to translate in this block.</p>
              ) : (
                fields.map((field, fieldIndex) => {
                  const id = `t-${blockIndex}-${fieldIndex}`;
                  const sourceId = `s-${blockIndex}-${fieldIndex}`;

                  return (
                    <div key={fieldIndex} className={styles.pair}>
                      <div className={styles.sourceSide}>
                        <span className={styles.fieldLabel}>{field.label} · English</span>
                        <p className={styles.sourceText} id={sourceId}>
                          {field.value === '' ? <span className={styles.blank}>(empty)</span> : field.value}
                        </p>
                      </div>
                      <div className={styles.targetSide}>
                        <label className={styles.fieldLabel} htmlFor={id}>
                          {field.label} · {language}
                        </label>
                        <textarea
                          id={id}
                          className={styles.field}
                          rows={field.long ? 4 : 2}
                          value={values[blockIndex]?.[fieldIndex] ?? ''}
                          aria-describedby={sourceId}
                          onChange={(event) => edit(blockIndex, fieldIndex, event.target.value)}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </li>
          );
        })}
      </ol>

      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Marking…' : reviewed ? `Mark ${language} reviewed again` : `Mark ${language} reviewed`}
        </button>
        {untranslated === 0 ? null : (
          <p className={styles.note}>
            {untranslated} {untranslated === 1 ? 'field is' : 'fields are'} still the English text.
            Marking reviewed says a person read every one of them, so a field left as it stands is a
            choice rather than an oversight.
          </p>
        )}
      </div>

      {outcome === null ? null : outcome.kind === 'reviewed' ? (
        <p className={styles.saved} role="status">
          {language} is reviewed and is now served to readers who ask for it.
        </p>
      ) : (
        <p className={styles.failed} role="alert">
          {outcome.reason}
        </p>
      )}
    </form>
  );
}
