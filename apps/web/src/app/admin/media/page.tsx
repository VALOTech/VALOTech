/**
 * The media library's page (`CMS-003/T9`).
 *
 * It carries the upload control and says what the library is for. The listing of
 * what is stored is not here: `CMS-003`'s serving rule answers who may read a
 * file by the audience of whatever references it, and a page that listed every
 * file would have to answer that question a second way.
 *
 * The role check is the `/admin` segment layout's and is not repeated here
 * (`ADMIN-002/T1`); English chrome, like the rest of the console
 * (`ADMIN-002/T5`).
 */

import type { ReactElement } from 'react';

import { UploadControl } from './upload-control';

export default function MediaPage(): ReactElement {
  return (
    <>
      <h1>Media</h1>
      <p>
        The images and files content points at. A file is stored once and reused: uploading the same
        one twice leaves a single copy, and what is stored is never quite what was sent — a picture
        is re-encoded and a PDF loses its metadata, so neither carries where it was made.
      </p>

      <UploadControl />
    </>
  );
}
