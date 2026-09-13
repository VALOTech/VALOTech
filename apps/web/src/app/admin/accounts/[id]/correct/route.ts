/**
 * `POST /admin/accounts/<id>/correct` — correcting a person's name or the
 * address they sign in with (`ADMIN-001/T10`).
 *
 * Its own route rather than another act on the action route, which is where the
 * acts that are *a name and a call to the service that owns it* live. A
 * correction carries two values beyond its own name, and folding it in would put
 * two fields in the posted body that only one branch reads — the same reason
 * deleting has a route of its own.
 *
 * **The service is the boundary.** What a correction may write, what counts as
 * having changed nothing, whether the address is somebody else's, and what goes
 * with an address that moves are all `correctIdentity`'s, decided inside the one
 * transaction that writes (`SEC-R04`). This handler parses the request, refuses a
 * caller who is not an admin, and gives each of the act's four answers the status
 * that says what it was: a correction that wrote and one that had nothing to
 * write are both the `200` the console's other acts answer with, an address
 * another account holds is the `409` the invite surface already answers with, and
 * a value the column cannot hold is a `400` naming which of the two it was —
 * because a form with two inputs that says only "refused" is a form the admin has
 * to guess at.
 *
 * The caller gate, the origin refusal and the `no-store` answer are the other
 * account routes' and for their reasons: a route handler inherits no segment
 * layout, so it asks `requireAdmin` itself and a non-admin gets the `404` the
 * console gives a guess; `Request.json()` parses the `text/plain` body a
 * cross-site form can post with no preflight, so an `Origin` that is present and
 * not ours is refused before anything else, the `SameSite=Lax` cookie being the
 * first lock rather than the only one; and the answer is about one account at one
 * moment, which no cache has any business holding.
 */

import { correctIdentity, personIdentity } from '../../../../../admin/accounts';
import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { withRequestId } from '../../../../../ops/request-context';

import type { AccountCorrectionAnswer } from '../account-actions';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  // The answer is about one account and about one moment: which of its fields
  // just moved, and whether the link somebody was sent still works.
  'Cache-Control': 'no-store',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const NO_SUCH_ACCOUNT = JSON.stringify({ error: 'no_such_account' });
const EMAIL_TAKEN = JSON.stringify({ error: 'email_taken' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

/** A field of the posted body: a string, or absent, and nothing else. */
function optionalText(value: unknown): { ok: true; value: string | undefined } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return typeof value === 'string' ? { ok: true, value } : { ok: false };
}

async function handleCorrection(request: Request, accountId: string): Promise<Response> {
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

  const { name, email } = body as { name?: unknown; email?: unknown };
  const askedName = optionalText(name);
  const askedEmail = optionalText(email);
  if (!askedName.ok || !askedEmail.ok) {
    return json(400, INVALID_REQUEST);
  }

  // A body naming neither field asks for no act at all, which is malformed
  // rather than a correction that changed nothing.
  if (askedName.value === undefined && askedEmail.value === undefined) {
    return json(400, INVALID_REQUEST);
  }

  const person = await personIdentity(accountId);
  if (person === null) {
    return json(404, NO_SUCH_ACCOUNT);
  }

  const result = await correctIdentity(
    person.id,
    { name: askedName.value, email: askedEmail.value },
    actor.id,
  );

  switch (result.outcome) {
    case 'address-taken':
      // The same code the invite surface answers with, because it is the same
      // condition and the console says one thing about it. It reveals nothing an
      // admin cannot read off the account list they came from.
      return json(409, EMAIL_TAKEN);
    case 'invalid':
      return json(400, JSON.stringify({ error: 'invalid_field', field: result.field }));
    // Named rather than left to a `default`, so a fifth outcome would arrive as a
    // function that no longer returns on every path instead of as a `200` nobody
    // decided to give it.
    case 'changed':
    case 'unchanged': {
      const answer: AccountCorrectionAnswer = result;

      return json(200, JSON.stringify(answer));
    }
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return withRequestId((scoped: Request) => handleCorrection(scoped, id))(request);
}
