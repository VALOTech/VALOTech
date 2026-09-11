/**
 * `POST /admin/accounts/<id>/action` — the five acts the person page offers
 * (`ADMIN-001/T2`).
 *
 * One route rather than five. Each act is a name in a posted body and a call to
 * the service that owns it, so what differs between them is one line; five routes
 * would be five copies of the gate, the origin check and the body parse, and the
 * fifth would be the one written in a hurry.
 *
 * **The services are the boundary, not this handler.** Whether an act may happen
 * is decided where it is performed — an admin may not suspend their own account or
 * the last one that can sign in (`ADMIN-DEC-01`), a resend reaches only somebody
 * who has not accepted, a reset writes only for an active account — and each
 * service audits its own write inside its own transaction (`SEC-R04`). A check
 * repeated here would be a second copy to drift, and worse, one a reader could
 * mistake for the enforcement.
 *
 * What this handler owns is the refusal of a caller, not of an act: a route
 * handler inherits no segment layout, so the `/admin` layout's admin check
 * (`ADMIN-002`) does not run here and it asks the gate itself. A non-admin gets
 * the same `404` the pages give and a signed-out caller the sign-in redirect. It
 * also resolves the subject before dispatching, so an id no account holds is a
 * `404` rather than an act that answers "nothing changed" — which is what a real
 * refusal answers, and the two should not read alike.
 *
 * A route handler gets no automatic origin check, and `Request.json()` parses the
 * `text/plain` body a cross-site form can post with no CORS preflight. An `Origin`
 * present and not ours is refused before anything else, the same defence the
 * draft-save route carries (`CMS-002`); the session cookie is `SameSite=Lax` and
 * so is not sent cross-site at all, and this is the second lock rather than the
 * only one.
 */

import {
  endAllSessions,
  personIdentity,
  type PersonIdentity,
  reinstateAccount,
  suspendAccount,
} from '../../../../../admin/accounts';
import { requireAdmin } from '../../../../../auth/gate';
import { requestReset, resendInvitation } from '../../../../../auth/invitation';
import { getConfig } from '../../../../../config/index';
import { withRequestId } from '../../../../../ops/request-context';

import { type AccountAction, type AccountActionAnswer, isAccountAction } from '../account-actions';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  // The answer is about one account and is never shared: a resend's body carries
  // a single-use link, and no cache has any business holding it.
  'Cache-Control': 'no-store',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const NO_SUCH_ACCOUNT = JSON.stringify({ error: 'no_such_account' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

/** Perform one act and say what came of it. The service decides; this reports. */
async function perform(
  action: AccountAction,
  person: PersonIdentity,
  actorId: string,
): Promise<AccountActionAnswer> {
  switch (action) {
    case 'resend-invitation': {
      const invitation = await resendInvitation(person.id);

      return invitation === null
        ? { outcome: 'unchanged' }
        : { outcome: 'changed', link: invitation.link, deliverByHand: invitation.deliverByHand };
    }
    case 'reset-password':
      // By the address the account holds rather than one a caller supplies: the
      // reset flow is keyed by address, and the only address an admin may start
      // one for is the one already on the row they are looking at.
      await requestReset(person.email);

      return { outcome: 'requested' };
    case 'suspend':
      return { outcome: (await suspendAccount(person.id, actorId)) ? 'changed' : 'unchanged' };
    case 'reinstate':
      return { outcome: (await reinstateAccount(person.id, actorId)) ? 'changed' : 'unchanged' };
    case 'end-sessions':
      return { outcome: (await endAllSessions(person.id, actorId)) ? 'changed' : 'unchanged' };
  }
}

async function handleAccountAction(request: Request, accountId: string): Promise<Response> {
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

  const { action } = body as { action?: unknown };
  if (!isAccountAction(action)) {
    return json(400, INVALID_REQUEST);
  }

  const person = await personIdentity(accountId);
  if (person === null) {
    return json(404, NO_SUCH_ACCOUNT);
  }

  return json(200, JSON.stringify(await perform(action, person, actor.id)));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return withRequestId((scoped: Request) => handleAccountAction(scoped, id))(request);
}
