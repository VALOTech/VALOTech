import type { ReactElement } from 'react';

import { validateBlocks } from '../../../../../content/blocks';
import { forAuthor } from '../../../../../content/read';
import { requireAdminPage } from '../../../../../auth/page-guard';

import { Editor } from './editor';

/**
 * The page an admin edits an item's draft on (`CMS-002`). It lives under
 * `/admin`, so the segment layout's admin gate has already run; it resolves the
 * admin again only because a content read is scoped by its reader (`DATA-R05`)
 * and the layout has no channel to hand the actor down.
 *
 * `forAuthor` returns the item's latest revision — the open draft while one is
 * open, otherwise the most recently published body, which is where a new draft
 * begins. An item with no revision yet, or one this admin cannot reach, seeds an
 * empty editor. The stored blocks pass through the one schema module here so the
 * client is handed a typed, valid array to start from.
 */
export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const actor = await requireAdminPage();
  const { id } = await params;

  const view = await forAuthor(id, actor);
  const initialBlocks = view === null ? [] : validateBlocks(view.revision.blocks);

  // A deck is the one type that is presented as well as read, so it is the one
  // whose headings carry a speaker note (`DECK-001/T6`). The editor is told the
  // type rather than shown every field every type could have.
  return <Editor itemId={id} type={view?.item.type ?? null} initialBlocks={initialBlocks} />;
}
