/**
 * `POST /admin/media/<id>/delete` — taking a file out of the library
 * (`CMS-003/T10`).
 *
 * The act is `deleteMedia`'s, where the reference check, the delete and the
 * `media.delete` audit are one transaction (`CMS-003/T7`, `SEC-R04`); this
 * handler refuses a caller, re-checks the typed name the panel gated on, and
 * turns a refusal into something a person can read.
 *
 * **The typed name is checked again here**, because a posted body is whatever the
 * caller sent: the control holds Confirm off until the name matches, and that is
 * a courtesy to the admin rather than a gate on the act. Deleting a file is one
 * of the three acts nothing undoes (`ADMIN-002/T3`), so it is gated twice.
 *
 * A refused delete answers with the **titles** of the items still using the file.
 * `deleteMedia` refuses with ids, which is the right currency inside a
 * transaction and the wrong one for somebody deciding what they nearly broke.
 *
 * The caller gate, the origin refusal and the `no-store` answer are the other
 * admin routes' and for their reasons.
 */

import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { deleteMedia, itemsUsing } from '../../../../../content/media';
import { withRequestId } from '../../../../../ops/request-context';
import { typedNameMatches } from '../../../destructive-actions';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const NAME_MISMATCH = JSON.stringify({ error: 'name_mismatch' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

async function handleDelete(request: Request, mediaId: string): Promise<Response> {
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
    return json(400, INVALID_REQUEST);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json(400, INVALID_REQUEST);
  }

  const { confirmName } = body as { confirmName?: unknown };
  if (typeof confirmName !== 'string') {
    return json(400, INVALID_REQUEST);
  }

  // The name the panel asks for is the file's own id, because a file in this
  // library has no other name: it is keyed by its bytes and never by a filename
  // (`CMS-003/T4`).
  if (!typedNameMatches(mediaId, confirmName)) {
    return json(400, NAME_MISMATCH);
  }

  const result = await deleteMedia(mediaId, actor.id);
  if (result.ok) {
    return json(200, JSON.stringify({ deleted: true }));
  }

  return json(409, JSON.stringify({ error: 'in_use', usedBy: await itemsUsing(mediaId) }));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return withRequestId(() => handleDelete(request, id))(request);
}
