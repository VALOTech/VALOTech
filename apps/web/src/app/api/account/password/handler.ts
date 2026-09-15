/**
 * `POST /api/account/password` — the reader changes their own password
 * ([`ADMIN-DEC-06`](../../../../../../docs/decisions-log.md#ADMIN-DEC-06)).
 *
 * **The session is the authorisation and the subject at once.** The account
 * whose password moves is the one the cookie resolves to and is never taken from
 * the body: an id in a posted form would be a password reset anybody could aim
 * at anybody.
 *
 * **The current password is demanded, and that is deliberate rather than
 * conventional.** A session that can set the password it was opened with is a
 * session no remedy reaches: whoever holds a stolen cookie makes themselves the
 * credential, and ending the session afterwards ends nothing. The act refuses
 * without it, and `changeOwnPassword` verifies it inside the statement that
 * writes.
 *
 * **A status describes the request; the query string describes the act.** A
 * cross-site post, a body that is not a form, and a caller with no session are
 * answered with a status, because each is a statement about the request and
 * about no account. Everything the person did — a password the policy refuses, a
 * current password that does not match, too many attempts — is an outcome, and
 * outcomes ride back to the page, which is a page and not a dead end. The page
 * carries no client script, so a refusal that answered `400` would leave the
 * reader on a bare body with no way back.
 *
 * **The limit is counted after the policy and before the verification.** A
 * password the policy refuses is a statement about the value typed and
 * distinguishes nothing about the account, so a typo in the *new* field does not
 * spend an allowance; a guess at the *current* one always does, and pays for the
 * Argon2 pass it is about to cost. The counter is the reader's own account and
 * is namespaced away from sign-in's, so an attacker who has a session cannot
 * spend the allowance that guards the front door.
 *
 * **A change ends every session and issues one.** The deletion is the act's, in
 * the transaction that writes the hash (`AUTH-002`); the fresh session is this
 * handler's, because a cookie is a property of the response. The reader stays
 * signed in where they are standing and every other device is turned out, which
 * is the whole point of changing a password you think somebody knows.
 *
 * An `Origin` present and not ours is refused before anything else: a route
 * handler gets no automatic origin check, and while the session cookie is
 * `SameSite=Lax` and so is not sent on a cross-site `POST` at all, this is the
 * second lock rather than the only one.
 */

import { requireInvestor } from '../../../../auth/gate';
import { changeOwnPassword } from '../../../../auth/password-change';
import { checkPassword, type PasswordProblem } from '../../../../auth/password-policy';
import { getRateLimiter } from '../../../../auth/rate-limit';
import { issue, serializeCookie } from '../../../../auth/session';
import { getConfig } from '../../../../config/index';
import { type AccountOutcome, backToAccount } from '../../../hall/account/outcomes';

const TEXT_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/plain; charset=utf-8',
};

/** The sentence the page shows for each way the policy can refuse a password. */
const POLICY_OUTCOME: Readonly<Record<PasswordProblem, AccountOutcome>> = {
  'too-short': 'password-too-short',
  'too-long': 'password-too-long',
  'too-common': 'password-too-common',
};

export async function handleAccountPassword(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response('cross_origin', { status: 403, headers: TEXT_HEADERS });
  }

  const actor = await requireInvestor(request);
  if (actor instanceof Response) {
    return actor;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  const currentPassword = form.get('currentPassword');
  const newPassword = form.get('newPassword');
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  const problem = checkPassword(newPassword);
  if (problem !== null) {
    return backToAccount(POLICY_OUTCOME[problem]);
  }

  if (getRateLimiter().hit(`account-password:${actor.id}`).limited) {
    return backToAccount('password-too-many');
  }

  if ((await changeOwnPassword(actor.id, currentPassword, newPassword)) === 'refused') {
    return backToAccount('password-refused');
  }

  // Every session the account held is gone, including the one that asked, so
  // this response has to carry a new one or the reader is signed out by their
  // own success. The header is set on the redirect rather than composed with it,
  // because the redirect is the same one every other outcome returns and a
  // second spelling of the destination is a second chance to point it somewhere
  // else.
  const answer = backToAccount('password-changed');
  answer.headers.set('Set-Cookie', serializeCookie(await issue(actor.id)));

  return answer;
}
