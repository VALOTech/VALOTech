/**
 * The two ways content is read, and there are only two (`CMS-001`, `CMS-006`).
 *
 * Every read takes the reader it is performed for (`DATA-R05`), so omitting the
 * check is a type error rather than a leak, and both compose `visibleTo` rather
 * than restating an audience rule of their own (`CMS-R03`).
 *
 * They are two functions rather than one with a flag because the difference
 * between them is the whole of the access model. `forReader` answers a reading
 * surface: it returns an item joined to **the revision its published pointer
 * names**, so an item with no published revision has nothing for it to return —
 * to an anonymous visitor, to an investor, and to an admin alike (`CMS-R02`).
 * `forAuthor` answers an author surface: it returns the **latest** revision,
 * published or not, and it is admin-only. That role check is the gate, not a
 * second opinion: the predicate scopes which *item* is reachable, while the
 * revision this one selects is the newest rather than the published one, so an
 * unpublished body would follow a reachable item out. One function with a
 * parameter would put those two behaviours one boolean apart.
 *
 * A refusal is `null`, and it is the same `null` an item that does not exist
 * gets. A caller cannot tell the two apart, which is what lets the route above
 * answer one `404` for both — a `403` on a specific slug confirms the item
 * exists, which is the whole of what an attacker was asking.
 */

import type { Actor } from '../auth/gate';
import { getDb } from '../db/index';
import type { JsonValue } from '../db/types';

import { visibleTo } from './access';
import type { ContentItem, ContentRevision } from './items';

/** An item and the one revision of it a caller is entitled to read. */
export interface ContentView {
  readonly item: ContentItem;
  readonly revision: ContentRevision;
}

/**
 * The revision's columns, aliased away from the item's. Both rows are selected
 * in one statement, and `id`, `item_id` and `created_at` exist on each.
 */
const REVISION_COLUMNS = [
  'content_revisions.id as revision_id',
  'content_revisions.item_id as revision_item_id',
  'content_revisions.blocks as revision_blocks',
  'content_revisions.author_id as revision_author_id',
  'content_revisions.created_at as revision_created_at',
  'content_revisions.published_at as revision_published_at',
] as const;

type JoinedRow = ContentItem & {
  revision_id: string;
  revision_item_id: string;
  revision_blocks: JsonValue;
  revision_author_id: string | null;
  revision_created_at: Date;
  revision_published_at: Date | null;
};

/**
 * Split the joined row back into its two rows. The item is what remains once
 * the aliased revision columns are taken out, so a column added to
 * `content_items` reaches the caller without this function being edited.
 */
function toView(row: JoinedRow): ContentView {
  const {
    revision_id,
    revision_item_id,
    revision_blocks,
    revision_author_id,
    revision_created_at,
    revision_published_at,
    ...item
  } = row;

  return {
    item,
    revision: {
      id: revision_id,
      item_id: revision_item_id,
      blocks: revision_blocks,
      author_id: revision_author_id,
      created_at: revision_created_at,
      published_at: revision_published_at,
    },
  };
}

/**
 * The item and its published revision, as this reader may see them, or `null`.
 *
 * The join reaches the revision the published pointer names, and binds it to
 * this item and to being published — neither of which the schema enforces on
 * the pointer itself. The foreign key allows `current_revision_id` to name any
 * revision, including another item's or an unpublished one; `publish` and
 * `withdraw` never create either state, but this read does not trust that,
 * because it is the path an anonymous visitor reaches and the body it serves is
 * what the audience rule exists to protect. So the revision must belong to this
 * item (`item_id`) and carry a `published_at`, or the join finds nothing.
 */
export async function forReader(itemId: string, reader: Actor | null): Promise<ContentView | null> {
  const row = await getDb()
    .selectFrom('content_items')
    .innerJoin('content_revisions', (join) =>
      join
        .onRef('content_revisions.id', '=', 'content_items.current_revision_id')
        .onRef('content_revisions.item_id', '=', 'content_items.id'),
    )
    .selectAll('content_items')
    .select(REVISION_COLUMNS)
    .where('content_items.id', '=', itemId)
    .where('content_revisions.published_at', 'is not', null)
    .where(visibleTo(reader))
    .executeTakeFirst();

  return row === undefined ? null : toView(row);
}

/**
 * The item and its latest revision, published or not, for an admin, or `null`.
 *
 * Latest is by creation, and the identifier breaks a tie so two revisions
 * stamped in the same microsecond cannot make the answer depend on the plan.
 * Since `saveDraft` keeps one open draft per item, the newest row is that draft
 * while one is open and the most recently written published revision otherwise.
 */
export async function forAuthor(itemId: string, actor: Actor): Promise<ContentView | null> {
  if (actor.role !== 'admin') {
    return null;
  }

  const row = await getDb()
    .selectFrom('content_items')
    .innerJoin('content_revisions', 'content_revisions.item_id', 'content_items.id')
    .selectAll('content_items')
    .select(REVISION_COLUMNS)
    .where('content_items.id', '=', itemId)
    .where(visibleTo(actor))
    .orderBy('content_revisions.created_at', 'desc')
    .orderBy('content_revisions.id', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row === undefined ? null : toView(row);
}
