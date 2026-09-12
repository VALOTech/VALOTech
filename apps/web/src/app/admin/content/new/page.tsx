'use client';

/**
 * The form an item begins in (`CMS-002/T9`).
 *
 * **The type is the first question, because it decides the rest.** An update
 * carries a kind, a report carries a period, a deck carries neither
 * (`CMS-001`), and asking for a period on a deck would be asking for something
 * to be ignored. The fields appear as the type is chosen rather than sitting
 * greyed out, so the form is only ever showing what it will use.
 *
 * The **address** is offered filled in from the title and stays editable: it is
 * what a reader will one day see (`CMS-006` §6), so an author chooses it, and
 * seeing it forming as they type is what makes it theirs rather than a surprise.
 * Once it has been edited by hand the title stops rewriting it, because a
 * suggestion that overwrites a decision is not a suggestion.
 *
 * Creating is not publishing and the form says so, because the two are easy to
 * confuse and only one of them is visible to a reader. Submitting goes to the
 * editor, which is the next thing an author wants — the item exists and is empty.
 *
 * The server validates the same rules and its answer names the field
 * (`CMS-002` §3), so a refusal puts the author back in the control that caused
 * it rather than leaving a banner to act on by eye (`A11Y-R02`). English console
 * chrome (`ADMIN-002/T5`).
 */

import { useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import {
  CONTENT_AUDIENCES,
  CONTENT_TYPES,
  CONTENT_UPDATE_KINDS,
  type ContentAudience,
  type ContentType,
  type ContentUpdateKind,
} from '../../../../db/types';

import styles from './new.module.css';

const TYPE_LABEL: Readonly<Record<ContentType, string>> = {
  report: 'Report',
  update: 'Update',
  deck: 'Deck',
};

const TYPE_NOTE: Readonly<Record<ContentType, string>> = {
  report: 'A periodic account of how the company is doing, filed under the period it covers.',
  update: 'A short piece between reports: an announcement, an achievement, or progress.',
  deck: 'A presentation an investor reads section by section.',
};

const KIND_LABEL: Readonly<Record<ContentUpdateKind, string>> = {
  announcement: 'Announcement',
  achievement: 'Achievement',
  progress: 'Progress',
};

const AUDIENCE_LABEL: Readonly<Record<ContentAudience, string>> = {
  public: 'Anyone, including a visitor who has not signed in',
  investor: 'Every investor',
  granted: 'Only investors it is granted to',
};

/** A title, as an address: lower-case, hyphenated, nothing a URL would escape. */
function addressFrom(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function NewItemPage(): ReactElement {
  const [type, setType] = useState<ContentType>('update');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [audience, setAudience] = useState<ContentAudience>('investor');
  const [kind, setKind] = useState<ContentUpdateKind>('progress');
  const [period, setPeriod] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ field: string; detail: string } | null>(null);

  // Once the address is edited by hand the title stops rewriting it.
  const slugIsMine = useRef(false);

  function retitle(value: string): void {
    setTitle(value);
    if (!slugIsMine.current) {
      setSlug(addressFrom(value));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setRefusal(null);

    try {
      const response = await fetch('/admin/content/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          slug,
          audience,
          ...(type === 'update' ? { kind } : {}),
          ...(type === 'report' ? { period } : {}),
        }),
      });

      if (response.status === 200) {
        const { id } = (await response.json()) as { id: string };
        window.location.assign(`/admin/content/${id}/edit`);
        return;
      }

      if (response.redirected) {
        setRefusal({ field: 'body', detail: 'Your session has ended. Open the page again to sign in.' });
      } else if (response.status === 409) {
        setRefusal({ field: 'slug', detail: 'That address is already taken. Choose another.' });
      } else if (response.status === 400) {
        const body = (await response.json()) as { field?: string; detail?: string };
        setRefusal({
          field: body.field ?? 'body',
          detail: body.detail ?? 'Something in the form was not accepted.',
        });
      } else {
        setRefusal({ field: 'body', detail: 'Nothing was created. Try again in a moment.' });
      }
    } catch {
      setRefusal({ field: 'body', detail: 'Nothing was created. Try again in a moment.' });
    } finally {
      setBusy(false);
    }
  }

  const invalid = (field: string): boolean => refusal?.field === field;

  return (
    <>
      <a className={styles.crumb} href="/admin/content">
        ← Content
      </a>
      <h1>Start something new</h1>
      <p className={styles.lead}>
        This creates it and opens the editor. Nothing is visible to any reader until it is
        published, so there is no hurry to get it right here.
      </p>

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <fieldset className={styles.types}>
          <legend>What is it</legend>
          {CONTENT_TYPES.map((option) => (
            <label key={option} className={styles.type}>
              <input
                type="radio"
                name="type"
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
              />
              <span className={styles.typeName}>{TYPE_LABEL[option]}</span>
              <span className={styles.typeNote}>{TYPE_NOTE[option]}</span>
            </label>
          ))}
        </fieldset>

        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => retitle(event.target.value)}
            aria-invalid={invalid('title')}
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Address</span>
          <input
            type="text"
            value={slug}
            onChange={(event) => {
              slugIsMine.current = true;
              setSlug(event.target.value);
            }}
            aria-invalid={invalid('slug')}
            aria-describedby="slug-note"
            required
          />
          <span className={styles.note} id="slug-note">
            Lower-case letters, digits and hyphens. A reader will see this one day.
          </span>
        </label>

        {type === 'update' ? (
          <label className={styles.field}>
            <span className={styles.label}>Kind</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as ContentUpdateKind)}
              aria-invalid={invalid('kind')}
            >
              {CONTENT_UPDATE_KINDS.map((option) => (
                <option key={option} value={option}>
                  {KIND_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {type === 'report' ? (
          <label className={styles.field}>
            <span className={styles.label}>Period</span>
            <input
              type="text"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              placeholder="2026-Q3"
              aria-invalid={invalid('period')}
              aria-describedby="period-note"
              required
            />
            <span className={styles.note} id="period-note">
              A quarter such as 2026-Q3, or a month such as 2026-07.
            </span>
          </label>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>Readable by</span>
          <select
            value={audience}
            onChange={(event) => setAudience(event.target.value as ContentAudience)}
            aria-invalid={invalid('audience')}
          >
            {CONTENT_AUDIENCES.map((option) => (
              <option key={option} value={option}>
                {AUDIENCE_LABEL[option]}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? 'Creating…' : 'Create and open the editor'}
          </button>
        </div>

        {refusal === null ? null : (
          <p className={styles.refused} role="alert">
            {refusal.detail}
          </p>
        )}
      </form>
    </>
  );
}
