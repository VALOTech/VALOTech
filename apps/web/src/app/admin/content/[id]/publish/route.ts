/**
 * `POST /admin/content/<id>/publish` — move the pointer a reader consults
 * (`CMS-004/T4`).
 *
 * **The revision is passed explicitly, never "publish the latest"** (`CMS-004`
 * §3). An author who left the editor open in another tab and comes back to
 * publish should publish what they read, not what the other tab saved — and the
 * confirmation they read named that revision, so publishing a different one
 * would make the confirmation a lie.
 *
 * The act itself is `publish`'s, where the revalidation, the pointer move and
 * the `content.publish` audit commit as one (`CMS-004/T3`, `SEC-R04`). Two
 * refusals are the author's to fix and are answered rather than raised: a
 * revision that no longer validates — because a file it names was deleted, or a
 * block type was retired — and a report whose period already holds a published
 * one (`RPT-002/T2`), which comes back with the report holding it so the author
 * can choose between withdrawing that one and re-filing this.
 *
 * A route handler inherits no segment layout, so this asks the gate itself
 * (`requireAdmin`), and an `Origin` present and not ours is refused before
 * anything else (`ADMIN-002`, `AUTH-001`).
 */

import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { BlockValidationError } from '../../../../../content/blocks';
import { PeriodTakenError, publish } from '../../../../../content/publish';
import { withRequestId } from '../../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handlePublish(request: Request, itemId: string): Promise<Response> {
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

  const { revisionId } = (body ?? {}) as { revisionId?: unknown };
  if (typeof revisionId !== 'string' || revisionId === '') {
    return json(400, { error: 'invalid_request' });
  }

  try {
    const item = await publish(itemId, revisionId, actor.id);
    return json(200, { id: item.id, revisionId });
  } catch (error) {
    if (error instanceof BlockValidationError) {
      return json(422, { error: 'invalid_blocks', detail: error.message });
    }
    if (error instanceof PeriodTakenError) {
      return json(409, { error: 'period_taken', period: error.period, heldBy: error.heldBy });
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withRequestId((scoped: Request) => handlePublish(scoped, id))(request);
}
