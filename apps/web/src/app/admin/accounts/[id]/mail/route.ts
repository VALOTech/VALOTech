/**
 * `POST /admin/accounts/<id>/mail` — an admin stopping investor mail to one
 * person, with the reason they are stopping it (`MAIL-002/T4`).
 *
 * Its own route rather than another act on the action route, which is where the
 * acts that are *a name and a call to the service that owns it* live. This one
 * carries a value beyond its own name, and folding it in would put a field in the
 * posted body that only one branch reads — the same reason deleting and
 * correcting have routes of their own.
 *
 * **This is a person doing what a webhook would.** SMTP answers once, at
 * hand-off, and a message that bounces afterwards becomes a notice in the
 * `MAIL_FROM` mailbox that nothing here reads (`MAIL-002` §3). So an admin who
 * finds such a notice sets this, and the reason they type is the only record of
 * why an address stopped being written to. It is required for exactly that: a
 * suppression with no reason is one nobody can undo with confidence a year
 * later, which is why the schema will not hold one either.
 *
 * The reason stays in the `unsubscribes` row and never reaches the trail. No
 * action's audit list names a field for it (`SEC-DEC-01`), and whether admin free
 * text may enter the seven-year trail at all is the open question `SEC-DEC-03`
 * holds; the two-year row is where it belongs meanwhile.
 *
 * The caller gate, the origin refusal and the `no-store` answer are the other
 * account routes' and for their reasons: a route handler inherits no segment
 * layout, so it asks `requireAdmin` itself and a non-admin gets the `404` the
 * console gives a guess; `Request.json()` parses the `text/plain` body a
 * cross-site form can post with no preflight, so an `Origin` present and not ours
 * is refused first; and the answer is about one account at one moment.
 */

import { personIdentity } from '../../../../../admin/accounts';
import { requireAdmin } from '../../../../../auth/gate';
import { getConfig } from '../../../../../config/index';
import { reasonIsRecordable, stopInvestorMail } from '../../../../../mail/unsubscribe';
import { withRequestId } from '../../../../../ops/request-context';

import type { StopSendingAnswer } from '../account-actions';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const NO_SUCH_ACCOUNT = JSON.stringify({ error: 'no_such_account' });
const INVALID_REASON = JSON.stringify({ error: 'invalid_reason' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

async function handleStopSending(request: Request, accountId: string): Promise<Response> {
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

  const { reason } = body as { reason?: unknown };
  if (typeof reason !== 'string') {
    return json(400, INVALID_REQUEST);
  }

  // Refused rather than trimmed to fit, the way a setting outside its bounds is
  // (`CFG-001`): a reason cut at five hundred characters records a sentence
  // nobody wrote, in the one column that explains why somebody stopped hearing
  // from the company.
  if (!reasonIsRecordable(reason)) {
    return json(400, INVALID_REASON);
  }

  const person = await personIdentity(accountId);
  if (person === null) {
    return json(404, NO_SUCH_ACCOUNT);
  }

  const changed = await stopInvestorMail({
    by: 'admin',
    accountId: person.id,
    actorId: actor.id,
    reason,
  });
  const answer: StopSendingAnswer = { outcome: changed ? 'changed' : 'unchanged' };

  return json(200, JSON.stringify(answer));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return withRequestId((scoped: Request) => handleStopSending(scoped, id))(request);
}
