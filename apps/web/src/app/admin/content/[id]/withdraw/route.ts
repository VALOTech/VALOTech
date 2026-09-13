/**
 * `POST /admin/content/<id>/withdraw` — one step back (`CMS-004/T4`).
 *
 * **No confirmation, deliberately.** Withdrawing is the reversible direction —
 * re-publishing moves the pointer forward again and the revision never left the
 * database — so a mistaken withdraw costs one click (`CMS-004` §3). The
 * dangerous direction is publishing, and that is the one with the confirmation;
 * a dialogue on both would train an author through the one that matters.
 *
 * **Withdrawal is not deletion.** The item, its revisions and its history stay;
 * what moves is the pointer a reader consults. Where there is no earlier
 * published revision the item becomes invisible to every reader, and the screen
 * says that in those words rather than "unpublish", because the two outcomes
 * differ and the control is the same.
 *
 * The act is `withdraw`'s, where the pointer move and the `content.withdraw`
 * audit commit as one (`CMS-004/T5`, `SEC-R04`). An identifier naming no item —
 * including one that is not an identifier at all — is a `404` rather than the
 * `500` a uuid column would raise (`CMS-004/T7`).
 */

import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { NoSuchItemError, withdraw } from '../../../../../content/publish';
import { withRequestId } from '../../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handleWithdraw(request: Request, itemId: string): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, { error: 'cross_origin' });
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  try {
    const item = await withdraw(itemId, actor.id);
    return json(200, { id: item.id, published: item.current_revision_id !== null });
  } catch (error) {
    if (error instanceof NoSuchItemError) {
      return json(404, { error: 'not_found' });
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withRequestId((scoped: Request) => handleWithdraw(scoped, id))(request);
}
