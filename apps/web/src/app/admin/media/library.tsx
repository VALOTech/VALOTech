'use client';

/**
 * What the library holds, and the way a file leaves it (`CMS-003/T10`).
 *
 * A file here has no name. The store is keyed by the bytes (`CMS-003/T4`), so
 * two uploads of one picture under different names are one row and there is
 * nothing to call it but what it is — its kind, its size, when it arrived and
 * who brought it. The column that decides anything is the last one: a file
 * nothing points at can go, and a file something points at cannot.
 *
 * Deleting runs through the console's one destructive control
 * (`ADMIN-002/T3`), which demands the file's id typed because deleting a file is
 * among the three acts nothing undoes. The refusal is the part worth building
 * carefully: it names the documents that still use the file, so an admin learns
 * what they would have broken rather than that something went wrong.
 */

import { useState } from 'react';
import type { ReactElement } from 'react';

import { DestructiveAction } from '../destructive-action';

import styles from './media.module.css';

/** One row, as the page's server component read it. */
export interface LibraryRow {
  readonly id: string;
  readonly mime: string;
  readonly byteSize: number;
  readonly uploadedAt: string;
  readonly uploadedBy: string | null;
  readonly usedBy: number;
}

/**
 * What a row says after a delete that did not happen. There is no outcome for
 * one that did: the row leaves the table, which says it better than a sentence
 * beside a file that is no longer there.
 */
type Outcome =
  | { readonly kind: 'in-use'; readonly usedBy: readonly string[] }
  | { readonly kind: 'failed'; readonly reason: string };

/** The kinds a person reads, rather than the media types a browser sends. */
const KIND: Readonly<Record<string, string>> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'application/pdf': 'PDF',
};

function readableSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function Library({ files }: { readonly files: readonly LibraryRow[] }): ReactElement {
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Outcome>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<readonly string[]>([]);

  async function remove(id: string, confirmName: string): Promise<void> {
    setBusy(id);
    setOutcomes((all) => {
      const { [id]: _dropped, ...rest } = all;
      return rest;
    });

    try {
      const response = await fetch(`/admin/media/${id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName }),
      });

      if (response.status === 200) {
        setGone((all) => [...all, id]);
      } else if (response.status === 409) {
        const body = (await response.json()) as { usedBy: string[] };
        setOutcomes((all) => ({ ...all, [id]: { kind: 'in-use', usedBy: body.usedBy } }));
      } else if (response.redirected) {
        setOutcomes((all) => ({
          ...all,
          [id]: { kind: 'failed', reason: 'Your session has ended. Open the page again to sign in.' },
        }));
      } else {
        setOutcomes((all) => ({
          ...all,
          [id]: { kind: 'failed', reason: 'The file was not deleted. Try again in a moment.' },
        }));
      }
    } catch {
      setOutcomes((all) => ({
        ...all,
        [id]: { kind: 'failed', reason: 'The file was not deleted. Try again in a moment.' },
      }));
    } finally {
      setBusy(null);
    }
  }

  const standing = files.filter((file) => !gone.includes(file.id));

  if (standing.length === 0) {
    return (
      <p className={styles.empty}>
        {files.length === 0
          ? 'Nothing is stored yet. A file put in above appears here.'
          : 'Everything that was here has been deleted.'}
      </p>
    );
  }

  return (
    <table className={styles.library}>
      <thead>
        <tr>
          <th scope="col">Kind</th>
          <th scope="col">Size</th>
          <th scope="col">Added (UTC)</th>
          <th scope="col">By</th>
          <th scope="col">Used by</th>
          <th scope="col">
            <span className={styles.actionHead}>Delete</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {standing.map((file) => {
          const outcome = outcomes[file.id];

          return (
            <tr key={file.id}>
              <td>{KIND[file.mime] ?? file.mime}</td>
              <td className={styles.figure}>{readableSize(file.byteSize)}</td>
              <td className={styles.figure}>{file.uploadedAt}</td>
              <td>{file.uploadedBy ?? 'an erased account'}</td>
              <td className={styles.figure}>
                {file.usedBy === 0 ? 'nothing' : `${file.usedBy} item${file.usedBy === 1 ? '' : 's'}`}
              </td>
              <td>
                <DestructiveAction
                  action="media.delete"
                  subject={file.id}
                  disabled={busy !== null}
                  details={
                    file.usedBy === 0 ? undefined : (
                      <>
                        {file.usedBy} item{file.usedBy === 1 ? '' : 's'} still point
                        {file.usedBy === 1 ? 's' : ''} at this file, so the delete will be refused.
                      </>
                    )
                  }
                  onConfirm={(typedName) => void remove(file.id, typedName)}
                />
                {outcome === undefined ? null : <Refusal outcome={outcome} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Refusal({ outcome }: { readonly outcome: Outcome }): ReactElement {
  if (outcome.kind === 'in-use') {
    return (
      <div className={styles.refused} role="alert">
        <p>Not deleted. These still use it:</p>
        <ul>
          {outcome.usedBy.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <p className={styles.refused} role="alert">
      {outcome.reason}
    </p>
  );
}
