import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { Composer } from './composer';

export const metadata: Metadata = { title: 'Write an update' };

/**
 * `GET /admin/updates` — where an update gets written (`POST-001`).
 *
 * A page of its own rather than a variant of the new-item form, because the two
 * are answering different questions. That form asks what an author is starting;
 * this one assumes the answer and takes the thing itself. An update that has to
 * be started, named, addressed and then written is an update that does not get
 * written, and a room with four entries a year is a room nobody signs in to.
 *
 * The heading says what filing does and does not do. Publishing is `CMS-004`'s,
 * one navigation on, with the preview and the audit every other kind of writing
 * goes through — an update is not special in that respect and this page does not
 * pretend it is.
 */
export default function ComposeUpdatePage(): ReactElement {
  return (
    <>
      <h1>Write an update</h1>
      <p>
        Short, and between reports. Choose what kind it is, write it, and file it — the title and the
        address come from what you wrote. Filing is not publishing.
      </p>
      <Composer />
    </>
  );
}
