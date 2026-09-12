/**
 * The media library's page (`CMS-003/T9`, `CMS-003/T10`).
 *
 * It carries the upload control and the listing, which are the two halves of the
 * same job: what is in the library, and how a file gets in or out. The listing
 * is a staff read and composes no audience predicate — the question is what the
 * library holds, not what any one person may see — and only the console reaches
 * it, behind the admin gate (`ADMIN-002/T1`).
 *
 * The role check is the `/admin` segment layout's and is not repeated here
 * (`ADMIN-002/T1`); English chrome, like the rest of the console
 * (`ADMIN-002/T5`).
 */

import type { ReactElement } from 'react';

import { libraryContents } from '../../../content/media';

import { Library } from './library';
import { UploadControl } from './upload-control';

export default async function MediaPage(): Promise<ReactElement> {
  const files = await libraryContents();

  return (
    <>
      <h1>Media</h1>
      <p>
        The images and files content points at. A file is stored once and reused: uploading the same
        one twice leaves a single copy, and what is stored is never quite what was sent — a picture
        is re-encoded and a PDF loses its metadata, so neither carries where it was made.
      </p>

      <UploadControl />

      <h2>What is stored</h2>
      <Library
        files={files.map((file) => ({
          id: file.id,
          mime: file.mime,
          byteSize: file.byteSize,
          // Serialised here rather than in the client component: a Date crossing
          // that boundary arrives as a string anyway, and the column is UTC
          // (`OPS-R02`), so the page says which it is once.
          uploadedAt: file.uploadedAt.toISOString().slice(0, 16).replace('T', ' '),
          uploadedBy: file.uploadedBy,
          usedBy: file.usedBy,
        }))}
      />
    </>
  );
}
