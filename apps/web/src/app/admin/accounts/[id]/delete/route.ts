/**
 * `POST /admin/accounts/<id>/delete` — erasing an account, behind a typed name
 * (`ADMIN-001/T4`).
 *
 * Its own route rather than a sixth act on the action route, which is where the
 * five reversible ones live. Deletion is the only act on the page that carries
 * something beyond its own name — the subject's name, typed by the person
 * confirming — and folding it in would put a field in the posted body that only
 * one branch reads, which makes the whole friction optional in the type that
 * reaches the handler.
 *
 * **The typed name is checked again here.** The panel that collects it leaves its
 * confirm button off until the name matches, and that is a courtesy to the person
 * confirming rather than a control: a posted body is whatever the caller sent.
 * `typedNameMatches` is the function the panel gates on, so the two cannot drift
 * into disagreeing about what counts as the name, and it runs after the subject is
 * resolved because the name it compares against is the row's.
 *
 * `eraseAccount` owns the act and every refusal of it: an admin may not erase
 * their own account and no act may leave the room with no admin who can sign in
 * (`ADMIN-DEC-01`), and the delete and its audit row are one transaction
 * (`SEC-R04`). A refusal and an id no account holds answer differently — the
 * first `unchanged`, the second `404` — so a guard that held cannot be read as a
 * path that does not exist.
 *
 * The caller gate, the origin refusal and the `no-store` answer are the action
 * route's, for its reasons: a route handler inherits no segment layout, so it asks
 * `requireAdmin` itself and a non-admin gets the `404` the console gives a guess;
 * and `Request.json()` parses the `text/plain` body a cross-site form can post
 * with no preflight, so an `Origin` that is present and not ours is refused before
 * anything else, the `SameSite=Lax` cookie being the first lock rather than the
 * only one.
 */

import { eraseAccount, personIdentity } from '../../../../../admin/accounts';
import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { withRequestId } from '../../../../../ops/request-context';
import { typedNameMatches } from '../../../destructive-actions';

import type { AccountDeleteAnswer } from '../account-actions';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  // The answer is about one account and about one moment: whether the row is still
  // there. No cache has any business holding it.
  'Cache-Control': 'no-store',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const NO_SUCH_ACCOUNT = JSON.stringify({ error: 'no_such_account' });
const NAME_MISMATCH = JSON.stringify({ error: 'name_mismatch' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

async function handleDelete(request: Request, accountId: string): Promise<Response> {
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

  const { confirmName } = body as { confirmName?: unknown };
  if (typeof confirmName !== 'string') {
    return json(400, INVALID_REQUEST);
  }

  const person = await personIdentity(accountId);
  if (person === null) {
    return json(404, NO_SUCH_ACCOUNT);
  }

  if (!typedNameMatches(confirmName, person.name)) {
    // Its own code rather than the generic one: the caller can say what was wrong,
    // and nothing is revealed by it that the page the name was read from does not
    // already show.
    return json(400, NAME_MISMATCH);
  }

  const answer: AccountDeleteAnswer = {
    outcome: (await eraseAccount(person.id, actor.id)) ? 'changed' : 'unchanged',
  };

  return json(200, JSON.stringify(answer));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return withRequestId((scoped: Request) => handleDelete(scoped, id))(request);
}
