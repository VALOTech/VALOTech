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
 * hands back both the invite link and a sentence saying what became of the
 * message (`AUTH-003/T3`). The link comes back whether or not the message was
 * accepted: it is the one copy that exists anywhere, and an admin whose invitee
 * never receives the mail has no other way to reach them.
 *
 * The language is chosen here and stored on the account, because the message is
 * composed now and read later by somebody this system has never seen. Declining
 * to choose is a real answer and is kept as one.
 *
 * The caller gate, the origin refusal and the `no-store` answer are the account
 * routes' and for their reasons: a route handler inherits no segment layout, so it
 * asks `requireAdmin` itself and a non-admin gets the `404` the console gives a
 * guess; a cross-site `Origin` is refused before anything else, the `SameSite=Lax`
 * cookie being the first lock; and the answer carries a single-use link no cache
 * may hold.
 */

import { isAddressShaped, normaliseAddress } from '../../../../auth/address';
import { requireAdmin } from '../../../../auth/gate';
import { EmailTakenError, inviteAccount } from '../../../../auth/invitation';
import { getConfig } from '../../../../config/index';
import { INVITABLE_ROLES, type AccountRole } from '../../../../db/types';
import { isLocale, type Locale } from '../../../../i18n/locales';
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

/**
 * Whether a posted value names a role an invitation may carry; anything else is
 * malformed.
 *
 * Narrower than the account's own vocabulary, because `prospect` is not
 * invitable (`db/types.ts:INVITABLE_ROLES`) — a posted `prospect` is refused
 * here rather than reaching `inviteAccount`, so the one path that mints a
 * vouched-for account cannot mint an unvouched one.
 */
function isRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (INVITABLE_ROLES as readonly string[]).includes(value);
}

/**
 * Whether a posted value names a language the hall serves, or declines to name
 * one (`AUTH-003/T3`).
 *
 * Three things pass and they mean the same: the field absent, the field empty,
 * and the field null. A `<select>` with an unchosen option posts the empty
 * string, an older client posts nothing, and a caller stating it outright posts
 * null — all three are "the admin did not say", which the column records as null
 * rather than as English. Anything else must be one of the twenty, because a
 * locale the hall cannot render is a row whose message has nowhere to come from.
 */
function isChosenLocale(value: unknown): value is Locale | '' | null | undefined {
  return value === undefined || value === null || value === '' || (typeof value === 'string' && isLocale(value));
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

  const { name, email, role, locale } = body as {
    name?: unknown;
    email?: unknown;
    role?: unknown;
    locale?: unknown;
  };
  // A name, an address the invitation can reach, and an invitable role. The
  // address is only shape-checked here, against the same predicate the correction
  // surface applies (`ADMIN-001/T10`) — `inviteAccount` normalises it and the
  // unique index is what actually settles who already exists.
  if (
    typeof name !== 'string' ||
    name.trim() === '' ||
    typeof email !== 'string' ||
    !isAddressShaped(normaliseAddress(email)) ||
    !isRole(role) ||
    !isChosenLocale(locale)
  ) {
    return json(400, INVALID_REQUEST);
  }

  try {
    const invitation = await inviteAccount(
      { name: name.trim(), email, role, locale: typeof locale === 'string' && locale !== '' ? locale : null },
      actor.id,
    );

    return json(
      200,
      JSON.stringify({
        accountId: invitation.accountId,
        link: invitation.link,
        delivery: invitation.delivery,
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
