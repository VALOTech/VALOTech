/**
 * `POST /admin/accounts/<id>/role` — moving a person between the three roles,
 * which is how a `prospect` becomes an `investor` once they have invested
 * (`AUTH-DEC-06`, `ADMIN-001/T13`).
 *
 * Its own route rather than another act on the action route, for the reason the
 * investor type has one: the acts on that route are a name and a call to the
 * service that owns them, and this one carries a value beyond its own name.
 *
 * **Unlike the investor type, this route writes an entitlement.** What the
 * person may read changes the instant it returns, because the gate reads the
 * role from `accounts` on every request and `content/access.ts` composes its
 * predicate from it. `changeRole` also ends every session the account holds, so
 * a demotion takes effect on a live reader rather than on their next sign-in.
 *
 * **It refuses `prospect` as a target.** A role is narrowed here only in the
 * direction a person can be put back: an admin who invited somebody by mistake
 * suspends or deletes the account rather than recasting them as somebody who
 * registered themselves, which the record would then say untruthfully — nobody
 * registered them, and `AUTH-005` is the only path that produces a prospect.
 * The narrowing is `INVITABLE_ROLES`, which is the same set the invitation path
 * accepts and for the same reason.
 *
 * The caller gate, the origin refusal and the `no-store` answer are the other
 * account routes' and for their reasons: a route handler inherits no segment
 * layout, so it asks `requireAdmin` itself and a non-admin gets the `404` the
 * console gives a guess; `Request.json()` parses the `text/plain` body a
 * cross-site form can post with no preflight, so an `Origin` that is present
 * and not ours is refused before anything else; and the answer is about one
 * account at one moment, which no cache has any business holding.
 */

import { changeRole, personIdentity } from '../../../../../admin/accounts';
import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { INVITABLE_ROLES, type AccountRole } from '../../../../../db/types';
import { withRequestId } from '../../../../../ops/request-context';

import type { RoleChangeAnswer } from '../account-actions';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const NO_SUCH_ACCOUNT = JSON.stringify({ error: 'no_such_account' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

/**
 * Whether a posted value names a role this route may move somebody to.
 * `prospect` fails here, which is why the check is against the invitable set
 * rather than the account's whole vocabulary.
 */
function isTargetRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (INVITABLE_ROLES as readonly string[]).includes(value);
}

async function handleRole(request: Request, accountId: string): Promise<Response> {
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

  const { role } = body as { role?: unknown };
  if (!isTargetRole(role)) {
    return json(400, INVALID_REQUEST);
  }

  const person = await personIdentity(accountId);
  if (person === null) {
    return json(404, NO_SUCH_ACCOUNT);
  }

  // The service's own outcome travels whole. Every refusal it names is a state
  // the console has a sentence for, and flattening them here would put the
  // reasoning in two places -- one of which would go stale.
  const answer: RoleChangeAnswer = { outcome: await changeRole(person.id, role, actor.id) };

  return json(200, JSON.stringify(answer));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return withRequestId((scoped: Request) => handleRole(scoped, id))(request);
}
