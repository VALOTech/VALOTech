/**
 * `POST /admin/updates/compose` — an update is written and filed in one act
 * (`POST-001/T1`).
 *
 * The path is `/admin/updates/compose` and not `/admin/updates` because the
 * composer itself is served at the latter, and one path in the App Router is
 * either a page or a handler and never both. It is the same split the item
 * surfaces already make — `/admin/content/new` is the form and
 * `/admin/content/create` is what it posts to — so this follows the convention
 * rather than inventing a second one.
 *
 * This exists beside `/admin/content/create` rather than instead of it, and the
 * difference is the whole of `POST-001`. The generic route begins an *empty*
 * item: an author names it, chooses its address, and is handed to the editor to
 * write. That is right for a report, which is long and expected and wants its
 * period settled before anybody writes a word. It is wrong for an update, which
 * is two sentences somebody has thirty seconds to file — three navigations is
 * where those two sentences are lost, and a hall with four entries a year is a
 * hall nobody signs in to.
 *
 * So this takes the finished thing: the kind, what it is about, and the words.
 * **The address is never asked for** — it is derived from the title, suffixed on
 * collision, and settled by the unique index (`composeUpdate`). **The title is
 * the first line** unless the author edited it separately (`POST-001/T4`); it
 * still arrives as a field, because the browser's form is a convenience and never
 * the boundary (`CMS-002` §3), and a body whose first line is blank must be
 * refused by name rather than stored as an untitled row.
 *
 * **The kind is required**, and that is a rule about writing rather than about
 * data: it is chosen before the body because it changes what gets written, and
 * an announcement that has to be reclassified as progress is usually an
 * announcement that was padding (`POST-001` §3).
 *
 * Creating is not publishing. The row carries no `current_revision_id`, so no
 * reader sees anything until somebody publishes through `CMS-004` — the same
 * preview, the same audit, the same withdraw as everything else.
 *
 * A route handler inherits no segment layout, so it asks the gate itself and
 * answers a non-admin the `404` the console gives a guess; an `Origin` present
 * and not ours is refused first, the `SameSite=Lax` cookie being the first lock
 * (`ADMIN-002`, `AUTH-001`).
 */

import { requireAdmin } from '../../../../auth/gate';
import { getConfig } from '../../../../config/index';
import { BlockValidationError } from '../../../../content/blocks';
import { MAX_TITLE_LENGTH } from '../../../../content/derive';
import { UnknownMediaError } from '../../../../content/items';
import { composeUpdate, SlugContentionError } from '../../../../content/updates';
import {
  CONTENT_PRODUCT_TAGS,
  CONTENT_UPDATE_KINDS,
  type ContentProductTag,
  type ContentUpdateKind,
} from '../../../../db/types';
import { withRequestId } from '../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

/**
 * The longest a title may arrive: the derivation's own bound, imported rather
 * than repeated, because a second copy of a number is a second number.
 * Checked again here because a hand-edited title never passes through the
 * derivation at all.
 */
const MAX_TITLE = MAX_TITLE_LENGTH;

/**
 * A ceiling on the document, so an unauthenticated-shaped mistake or a runaway
 * paste cannot ask the validator to walk something unbounded. Generous: an update
 * this long is a report section, which is what the length marker says on the
 * screen (`POST-001/T5`).
 */
const MAX_BLOCKS = 200;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/**
 * A refusal names the field and says what is wrong with it.
 *
 * `detail` rather than `reason`, because that is the word the console's other
 * refusals already use (`/admin/content/create`) and two spellings of one
 * concept in one console is a drift with a delay fuse.
 */
interface Refusal {
  readonly field: string;
  readonly detail: string;
}

interface Composed {
  readonly kind: ContentUpdateKind;
  readonly product: ContentProductTag | null;
  readonly title: string;
  readonly blocks: readonly unknown[];
}

function read(body: unknown): Composed | Refusal {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { field: 'body', detail: 'The request was not a set of fields.' };
  }

  const { kind, product, title, blocks } = body as Record<string, unknown>;

  if (!isOneOf(CONTENT_UPDATE_KINDS, kind)) {
    return { field: 'kind', detail: 'An update is an announcement, an achievement or progress.' };
  }

  // Absent, null and empty all mean the same thing and all pass: the author did
  // not say what this is about. A `<select>` with nothing chosen posts the empty
  // string, so refusing it would refuse the default state of the control.
  if (product !== undefined && product !== null && product !== '' && !isOneOf(CONTENT_PRODUCT_TAGS, product)) {
    return { field: 'product', detail: 'A tag is one of the six products, or the company.' };
  }

  if (typeof title !== 'string' || title.trim() === '') {
    return { field: 'title', detail: 'Write a first line: it becomes the title.' };
  }
  if (title.trim().length > MAX_TITLE) {
    return { field: 'title', detail: `A title is at most ${MAX_TITLE} characters.` };
  }

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { field: 'blocks', detail: 'An update with nothing in it is not an update.' };
  }
  if (blocks.length > MAX_BLOCKS) {
    return { field: 'blocks', detail: 'This is long enough to be a report section.' };
  }

  return {
    kind,
    product: isOneOf(CONTENT_PRODUCT_TAGS, product) ? product : null,
    title: title.trim(),
    blocks,
  };
}

async function handleCompose(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, { error: 'cross_origin' });
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_request', field: 'body' });
  }

  const wanted = read(body);
  if ('field' in wanted) {
    return json(400, { error: 'invalid_request', field: wanted.field, detail: wanted.detail });
  }

  try {
    const item = await composeUpdate({
      kind: wanted.kind,
      product: wanted.product,
      title: wanted.title,
      blocks: wanted.blocks,
      authorId: actor.id,
    });

    // The id is what the composer navigates to: the item page, where publishing
    // lives. The slug travels with it because that is the address a reader will
    // see and the author never chose it — being shown it is how it becomes
    // theirs rather than a surprise found later.
    return json(200, { id: item.id, slug: item.slug });
  } catch (error) {
    // The one expected failure that is not the author's: concurrent composes
    // kept taking the address this one derived. It is answered rather than
    // thrown, because "try again" is a true and actionable sentence and a 500 is
    // neither.
    if (error instanceof SlugContentionError) {
      return json(409, { error: 'slug_contention', detail: error.message });
    }

    // A document this route was handed and cannot store. The composer cannot
    // produce one -- `blocksFromText` emits paragraphs -- but this is the
    // boundary and not the form, so a direct caller is answered rather than
    // crashed at. 422 and not 500, and the wording is the draft route's: a 500
    // reads as the server breaking rather than the document being wrong.
    if (error instanceof BlockValidationError) {
      return json(422, { error: 'invalid_blocks', detail: error.message });
    }
    if (error instanceof UnknownMediaError) {
      return json(422, { error: 'unknown_media', detail: error.message });
    }

    throw error;
  }
}

export async function POST(request: Request): Promise<Response> {
  return withRequestId(handleCompose)(request);
}
