/**
 * `POST /admin/updates/to-report` — an update that got long enough to be a report
 * section, moved into the report being written (`POST-001/T5`).
 *
 * **The honest answer to "this got long" is usually not "make it shorter".** An
 * update is short by nature, so a composer that only counted words and tutted
 * would be telling an author their writing is wrong when what actually happened
 * is that they wrote a report section into the wrong surface. This moves it
 * instead.
 *
 * **The destination is the server's choice, not the caller's, and that is a
 * security property rather than a convenience.** The request carries blocks and
 * nothing else; `draftReport` picks the item. A route that accepted an item id
 * would let any admin append arbitrary text to any content item in the room —
 * a published deck, another author's report — through a surface whose whole
 * stated purpose is one destination.
 *
 * Appending, never replacing. `appendToDraft` keeps what the draft already holds,
 * under the item's own lock, so two authors moving text into one report both land
 * (`CMS-001` §6). Nothing is published: the report's draft is still a draft, and
 * `CMS-004` still owns the moment anybody reads it.
 *
 * A route handler inherits no segment layout, so it asks the gate itself and
 * answers a non-admin the `404` the console gives a guess; a cross-site `Origin`
 * is refused before anything else (`ADMIN-002`, `AUTH-001`).
 */

import { requireAdmin } from '../../../../auth/gate';
import { getConfig } from '../../../../config/index';
import { BlockValidationError } from '../../../../content/blocks';
import { appendToDraft, UnknownMediaError, UnreadableDraftError } from '../../../../content/items';
import { draftReport } from '../../../../content/reports';
import { withRequestId } from '../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

/**
 * The same ceiling the composer's own route carries. A document longer than this
 * is not a report section either; it is a runaway paste, and the validator should
 * not be asked to walk something unbounded.
 */
const MAX_BLOCKS = 200;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handleMove(request: Request): Promise<Response> {
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

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json(400, { error: 'invalid_request', field: 'body' });
  }

  const { blocks } = body as { blocks?: unknown };

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return json(400, {
      error: 'invalid_request',
      field: 'blocks',
      detail: 'There is nothing to move.',
    });
  }
  if (blocks.length > MAX_BLOCKS) {
    return json(400, {
      error: 'invalid_request',
      field: 'blocks',
      detail: 'This is longer than a report section.',
    });
  }

  const report = await draftReport();

  // Nothing is being written. The composer does not offer the control in this
  // state, so reaching here means the draft was published or withdrawn while the
  // page was open — an answer the author can act on, not a failure.
  if (report === null) {
    return json(409, {
      error: 'no_draft_report',
      detail: 'No report is being drafted now. Start one, then move this into it.',
    });
  }

  try {
    const appended = await appendToDraft(report.id, blocks);

    // The report had an open draft when it was chosen and does not now, which
    // means it was published in between. The words are not lost — they are still
    // in the composer, which has not been cleared.
    if (appended === null) {
      return json(409, {
        error: 'no_draft_report',
        detail: 'That report was published while this was open. Nothing was moved.',
      });
    }

    // The translation count travels back so the surface can say what the move
    // cost. Appending changes the report's text, and `CMS-005` will not carry a
    // translation across a change of text — so the drop is right and the silence
    // would not be: the person who reviewed those locales is usually not the
    // person who just pressed the button.
    return json(200, {
      reportId: report.id,
      title: report.title,
      translationsDropped: appended.translationsDropped,
    });
  } catch (error) {
    if (error instanceof BlockValidationError) {
      return json(422, { error: 'invalid_blocks', detail: error.message });
    }
    if (error instanceof UnknownMediaError) {
      return json(422, { error: 'unknown_media', detail: error.message });
    }

    // The report's own stored draft, not the fragment this caller sent. Its own
    // code and its own sentence, because pointing somebody at a block index in a
    // document they cannot see is an error message that asks for nothing.
    if (error instanceof UnreadableDraftError) {
      return json(409, { error: 'unreadable_draft', detail: error.message });
    }

    throw error;
  }
}

export async function POST(request: Request): Promise<Response> {
  return withRequestId(handleMove)(request);
}
