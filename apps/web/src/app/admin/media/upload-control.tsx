'use client';

/**
 * The control an admin puts a file into (`CMS-003/T9`).
 *
 * A file is chosen by the button or dropped on the area, which is one control
 * either way: the area carries a role, takes focus, and answers Enter and Space,
 * so a person who never uses a pointer reaches it the same way and the file input
 * itself stays out of the tab order rather than being a second, silent target
 * (`A11Y-R01`, `A11Y-R02`).
 *
 * The cap and the accepted kinds are stated before a file is chosen (`CMS-003`
 * §3), and a file that fails either is refused here, named, and never sent — the
 * round trip teaches nothing the person could not be told at once. Neither check
 * is the guarantee: the server refuses the size again and decides the kind by
 * sniffing the bytes, because an extension is written by whoever uploads
 * (`CMS-003/T1`). What this one buys is the answer arriving immediately.
 *
 * Every outcome is a sentence about this file. "Already in the library" is a
 * success and says so, because the store is keyed by content and a second upload
 * of one file is one row (`CMS-003/T4`) — reporting that as new would be a lie,
 * and reporting it as a failure would send the admin looking for a problem.
 */

import { useId, useRef, useState } from 'react';
import type { DragEvent, ReactElement } from 'react';

import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  UPLOAD_ACCEPT,
} from '../../../content/upload-limits';

import styles from './media.module.css';

type Outcome =
  | { readonly kind: 'stored'; readonly name: string; readonly deduped: boolean }
  | { readonly kind: 'refused'; readonly reason: string };

/** A size a person reads, rather than a count of bytes. */
function readableSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * What this file fails on before it is sent, or `null` when nothing here can
 * tell. The extension check is the picker's own filter said again, because a
 * dropped file never passed through the picker.
 */
function refusalFor(file: File): string | null {
  if (file.size === 0) {
    return `${file.name} is empty.`;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${readableSize(file.size)}, over the ${MAX_UPLOAD_LABEL} limit.`;
  }

  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!UPLOAD_ACCEPT.split(',').includes(extension)) {
    return `${file.name} is not a PNG, a JPEG or a PDF.`;
  }

  return null;
}

export function UploadControl(): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const describedBy = useId();

  async function send(file: File): Promise<void> {
    const refusal = refusalFor(file);
    if (refusal !== null) {
      setOutcome({ kind: 'refused', reason: refusal });
      return;
    }

    setBusy(true);
    setOutcome(null);

    const body = new FormData();
    body.set('file', file);

    try {
      const response = await fetch('/admin/media/upload', { method: 'POST', body });

      if (response.redirected) {
        setOutcome({ kind: 'refused', reason: 'Your session has ended. Open the page again to sign in.' });
      } else if (response.status === 200) {
        const stored = (await response.json()) as { deduped: boolean };
        setOutcome({ kind: 'stored', name: file.name, deduped: stored.deduped });
      } else if (response.status === 413) {
        setOutcome({ kind: 'refused', reason: `${file.name} is over the ${MAX_UPLOAD_LABEL} limit.` });
      } else if (response.status === 415) {
        // The server read the bytes rather than the name, so this is the answer
        // a renamed file earns and the one the local check cannot give.
        setOutcome({ kind: 'refused', reason: `${file.name} is not a PNG, a JPEG or a PDF.` });
      } else {
        setOutcome({ kind: 'refused', reason: `${file.name} was not stored. Try again in a moment.` });
      }
    } catch {
      setOutcome({ kind: 'refused', reason: `${file.name} was not stored. Try again in a moment.` });
    } finally {
      setBusy(false);
      // The same file chosen twice in a row is a change the input would not
      // report, and an admin who retries after a refusal means to retry.
      if (inputRef.current !== null) {
        inputRef.current.value = '';
      }
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setOver(false);

    const [file] = Array.from(event.dataTransfer.files);
    if (file !== undefined && !busy) {
      void send(file);
    }
  }

  return (
    <section className={styles.upload} aria-busy={busy}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a file to upload, or drop one here"
        aria-describedby={describedBy}
        aria-disabled={busy}
        className={`${styles.zone} ${over ? styles.zoneOver : ''}`}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!busy) {
              inputRef.current?.click();
            }
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <strong className={styles.zoneLead}>{busy ? 'Storing…' : 'Choose a file, or drop one here'}</strong>
        <span id={describedBy} className={styles.zoneTerms}>
          PNG, JPEG or PDF, up to {MAX_UPLOAD_LABEL}. A picture is re-encoded and a PDF loses its
          metadata before either is stored.
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className={styles.picker}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          if (file !== undefined) {
            void send(file);
          }
        }}
      />

      {outcome === null ? null : <Result outcome={outcome} />}
    </section>
  );
}

function Result({ outcome }: { readonly outcome: Outcome }): ReactElement {
  if (outcome.kind === 'refused') {
    return (
      <p className={styles.refused} role="alert">
        {outcome.reason}
      </p>
    );
  }

  return (
    <p className={styles.stored} role="status">
      {outcome.deduped
        ? `${outcome.name} was already in the library. It is one file, not two.`
        : `${outcome.name} is in the library.`}
    </p>
  );
}
