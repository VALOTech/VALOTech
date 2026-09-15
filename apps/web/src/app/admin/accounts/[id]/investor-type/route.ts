/**
 * `POST /admin/accounts/<id>/investor-type` — saying whether a person has
 * already invested or is still deciding, or that nobody has said
 * (`ADMIN-001/T11`, `INV-DEC-02`).
 *
 * Its own route rather than another act on the action route, for the reason
 * correcting and deleting each have one: the acts on that route are a name and a
 * call to the service that owns them, and this one carries a value beyond its
 * own name — and a value with three legal states, one of which is `null`.
 *
 * **`null` is a value here and not an absent field.** The body must name
 * `investorType`; a body that omits it is malformed rather than a request to
 * clear the column, because the two readings are opposite and a caller that meant
 * one should never silently get the other. `null` said out loud is what puts the
 * record back to nobody having said, which an admin who classified the wrong
 * account needs.
 *
 * **It writes an ordering and never an entitlement.** What this person may read
 * is their grants and each document's audience through `CMS-006`, which this
 * route does not touch and the column it writes cannot reach — so the worst a
 * wrong press does is present the hall's blocks in the wrong order.
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

import { personIdentity, setInvestorType } from '../../../../../admin/accounts';
import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { INVESTOR_TYPES, type InvestorType } from '../../../../../db/types';
import { withRequestId } from '../../../../../ops/request-context';

import type { InvestorTypeAnswer } from '../account-actions';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  // The answer is about one account at one moment: whether this press moved the
  // column or found it already holding what was asked for.
  'Cache-Control': 'no-store',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const NO_SUCH_ACCOUNT = JSON.stringify({ error: 'no_such_account' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

/**
 * Whether a posted value is one the column can hold. `null` passes and
 * `undefined` does not: the column's three states are the two named types and
 * "nobody has said", and a field nobody sent is a body that asked for nothing.
 */
function isInvestorType(value: unknown): value is InvestorType | null {
  return (
    value === null || (typeof value === 'string' && (INVESTOR_TYPES as readonly string[]).includes(value))
  );
}

async function handleInvestorType(request: Request, accountId: string): Promise<Response> {
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

  const { investorType } = body as { investorType?: unknown };
  if (!isInvestorType(investorType)) {
    return json(400, INVALID_REQUEST);
  }

  const person = await personIdentity(accountId);
  if (person === null) {
    return json(404, NO_SUCH_ACCOUNT);
  }

  const answer: InvestorTypeAnswer = {
    outcome: (await setInvestorType(person.id, investorType, actor.id)) ? 'changed' : 'unchanged',
  };

  return json(200, JSON.stringify(answer));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return withRequestId((scoped: Request) => handleInvestorType(scoped, id))(request);
}
