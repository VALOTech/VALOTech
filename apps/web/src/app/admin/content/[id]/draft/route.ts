/**
 * `POST /admin/content/<id>/draft` — save the open draft of an item's body
 * (`CMS-002/T6`, `CMS-002/T7`).
 *
 * The editor validates with the one schema module before it posts, so a
 * well-behaved client never reaches here with a body the schema refuses. This
 * route re-validates anyway, because a browser-side validator is a convenience
 * and never a boundary (`CMS-002` §3): the validation lives in `saveDraft`,
 * which is the one write path, so there is no way to store a body past it. When
 * it refuses, the `BlockValidationError` message names the block index and the
 * field (`blocks[2].alt: ...`), and that message is the whole of the 422 body —
 * an actionable error rather than "invalid document", and nothing of the
 * submitted body beyond the path and reason the validator itself reports.
 *
 * A route handler inherits no segment layout, so the `/admin` layout's admin
 * check (`ADMIN-002`) does not run here: this handler asks the gate itself
 * (`requireAdmin`), which answers a non-admin the same `404` the pages give and
 * a signed-out caller the sign-in redirect.
 *
 * A route handler gets no automatic origin check, and `Request.json()` parses
 * the `text/plain` body a cross-site form can post with no CORS preflight. An
 * `Origin` present and not ours is refused before anything else, the same
 * defence the sign-in route carries (`AUTH-001`); the session cookie is
 * `SameSite=Lax` and so is not sent cross-site at all, and this is the second
 * lock rather than the only one.
 */

import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { BlockValidationError } from '../../../../../content/blocks';
import { saveDraft } from '../../../../../content/items';
import { withRequestId } from '../../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

async function handleDraftSave(request: Request, itemId: string): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, CROSS_ORIGIN);
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // The parse error's only content is where the caller's own body broke; the
    // 400 stands for it and it is not echoed back.
    return json(400, INVALID_REQUEST);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json(400, INVALID_REQUEST);
  }

  const { blocks } = body as { blocks?: unknown };

  try {
    const revision = await saveDraft(itemId, blocks, actor.id);
    return json(200, JSON.stringify({ revisionId: revision.id }));
  } catch (error) {
    // The one expected refusal is an invalid body, and it is a 422 carrying the
    // validator's own message — never a 500, which would read as the server
    // breaking rather than the document being wrong. Any other error is
    // unexpected and propagates.
    if (error instanceof BlockValidationError) {
      return json(422, JSON.stringify({ error: 'invalid_blocks', detail: error.message }));
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withRequestId((scoped: Request) => handleDraftSave(scoped, id))(request);
}
