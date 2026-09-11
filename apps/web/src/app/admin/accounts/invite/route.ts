/**
 * `POST /admin/accounts/invite` — bringing an account into existence by inviting a
 * named person (`ADMIN-001/T6`).
 *
 * This is the only way an account comes to be: it issues an invitation, and no
 * admin ever sets a password on somebody else's behalf (`AUTH-003`) — an admin
 * who could would be able to sign in as that person, and the trail would say the
 * person did it. The act itself is `inviteAccount`'s, where the account, its
 * single-use token and the `account.create` audit row commit as one (`SEC-R04`);
 * this handler validates the request, refuses a caller who is not an admin, and
 * hands the invite link back for the admin to deliver, because nothing mails it
 * yet (`AUTH-003/T3`).
 *
 * The caller gate, the origin refusal and the `no-store` answer are the account
 * routes' and for their reasons: a route handler inherits no segment layout, so it
 * asks `requireAdmin` itself and a non-admin gets the `404` the console gives a
 * guess; a cross-site `Origin` is refused before anything else, the `SameSite=Lax`
 * cookie being the first lock; and the answer carries a single-use link no cache
 * may hold.
 */

import { requireAdmin } from '../../../../auth/gate';
import { EmailTakenError, inviteAccount } from '../../../../auth/invitation';
import { getConfig } from '../../../../config/index';
import { ACCOUNT_ROLES, type AccountRole } from '../../../../db/types';
import { withRequestId } from '../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  // The answer carries a single-use invite link, which exists in it and in no
  // row; no cache has any business holding it.
  'Cache-Control': 'no-store',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const EMAIL_TAKEN = JSON.stringify({ error: 'email_taken' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

/** Whether a posted value names one of the two roles; anything else is malformed. */
function isRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (ACCOUNT_ROLES as readonly string[]).includes(value);
}

async function handleInvite(request: Request): Promise<Response> {
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

  const { name, email, role } = body as { name?: unknown; email?: unknown; role?: unknown };
  // A name and an address the invitation can reach, and one of the two roles. The
  // address is only shape-checked here — `inviteAccount` normalises it and the
  // unique index is what actually settles who already exists.
  if (typeof name !== 'string' || name.trim() === '' || typeof email !== 'string' || !email.includes('@') || !isRole(role)) {
    return json(400, INVALID_REQUEST);
  }

  try {
    const invitation = await inviteAccount({ name: name.trim(), email, role }, actor.id);

    return json(
      200,
      JSON.stringify({
        accountId: invitation.accountId,
        link: invitation.link,
        deliverByHand: invitation.deliverByHand,
      }),
    );
  } catch (error) {
    // The one expected failure: the address already belongs to an account. Its own
    // code so the form can say so, and it reveals nothing a directed invitation of
    // a known address does not (`SEC-R03` governs the anonymous reset, not this).
    if (error instanceof EmailTakenError) {
      return json(409, EMAIL_TAKEN);
    }
    throw error;
  }
}

export async function POST(request: Request): Promise<Response> {
  return withRequestId(handleInvite)(request);
}
