/**
 * `POST /admin/content/<id>/audience` — who may read this item (`RPT-001/T5`,
 * `POST-002/T5`).
 *
 * The audience is a column the read predicate turns into an answer
 * (`CMS-006`), so this route writes one value and the whole hall follows: no
 * cache to clear, no second list to keep, no template filter to remember. The
 * act itself is `changeAudience`'s, where the column write and the
 * `content.audience_change` audit commit as one (`CMS-006/T6`, `SEC-R04`).
 *
 * **The audience arrives as one of three words or not at all.** It is checked
 * against the vocabulary rather than passed to the column and left to the
 * constraint, because a `23514` reaching a caller is a `500` describing an
 * invariant instead of a `400` naming a field, and the value is echoed by the
 * database message either way (`DATA-R02`).
 *
 * Asking for the audience the item already holds is answered `200` and writes
 * nothing, which is `changeAudience`'s own posture: an audience change is a
 * change, and a trail that logged a write altering nothing would record an act
 * that did not happen. A second click on the control the item is already set to
 * is exactly that, so it is a no-op rather than an error.
 *
 * A route handler inherits no segment layout, so this asks the gate itself
 * (`requireAdmin`), and an `Origin` present and not ours is refused before
 * anything else (`ADMIN-002`, `AUTH-001`).
 */

import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { audienceOptions, changeAudience } from '../../../../../content/audience';
import { CONTENT_AUDIENCES, type ContentAudience } from '../../../../../db/types';
import { withRequestId } from '../../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isAudience(value: unknown): value is ContentAudience {
  return typeof value === 'string' && (CONTENT_AUDIENCES as readonly string[]).includes(value);
}

async function handleAudience(request: Request, itemId: string): Promise<Response> {
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
    return json(400, { error: 'invalid_request' });
  }

  const { audience } = (body ?? {}) as { audience?: unknown };
  if (!isAudience(audience)) {
    return json(400, { error: 'invalid_request', field: 'audience' });
  }

  // `audienceOptions` answers `null` for an item that is not there and for an
  // identifier that is not one, so a garbage path is the same `404` as a missing
  // item rather than the `500` a uuid column would raise (`CMS-006/T4`).
  const options = await audienceOptions(itemId);
  if (options === null) {
    return json(404, { error: 'not_found' });
  }

  const item = await changeAudience(itemId, audience, actor.id);
  return json(200, { id: item.id, audience: item.audience });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withRequestId((scoped: Request) => handleAudience(scoped, id))(request);
}
