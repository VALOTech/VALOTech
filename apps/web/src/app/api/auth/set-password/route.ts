/**
 * `POST /api/auth/set-password` — the invitee or the resetter chooses a password
 * and is signed in (`AUTH-003/T4`). The set-password form at `/invite/<token>`
 * and `/reset/<token>` posts `{ token, password }` here; the token decides which
 * account, and the same path serves both flows because they differ only in how
 * the token was issued (`AUTH-003`).
 *
 * The policy is checked before the token is consumed, so a password the policy
 * refuses does not spend the person's one-time link: they fix it and try again
 * against the same token. The token is consumed and the password written in one
 * transaction inside `setPasswordWithToken`, so a burned token always leaves a
 * password set.
 *
 *  - `204` with the session cookie — set and signed in.
 *  - `400 weak_password` with the `problem`, so the form says which rule to fix.
 *  - `400 invalid_request` — the body is not two strings.
 *  - `409 expired` — the token is missing, used or expired (one answer, `SEC-R03`).
 *  - `403 suspended` — the account's access was ended; a link cannot restore it.
 *  - `403 cross_origin` — a cross-site page driving the form (login CSRF).
 */

import { setPasswordWithToken } from '../../../../auth/invitation';
import { hashPassword } from '../../../../auth/password';
import { checkPassword } from '../../../../auth/password-policy';
import { issue, serializeCookie } from '../../../../auth/session';
import { getConfig } from '../../../../config/index';
import { withRequestId } from '../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const EXPIRED = JSON.stringify({ error: 'expired' });
const SUSPENDED = JSON.stringify({ error: 'suspended' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });

/**
 * A token is 32 bytes base64url — 43 characters — so a field longer than this is
 * not a token and is turned away before it is hashed for lookup, the same
 * unbounded-input bound `AUTH-001` keeps on the address it reads.
 */
const MAX_TOKEN_LENGTH = 256;

interface Submission {
  readonly token: string;
  readonly password: string;
}

/**
 * The submission a well-formed body carries, or `null`. The password is not
 * length-bounded here: `checkPassword` reports `too-long` so the form can say so,
 * and it does that before any hash, so an over-long value costs a parse and no
 * Argon2 pass.
 */
async function readSubmission(request: Request): Promise<Submission | null> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const { token, password } = body as Record<string, unknown>;

  if (typeof token !== 'string' || typeof password !== 'string') {
    return null;
  }

  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  return { token, password };
}

export const POST = withRequestId(async (request: Request): Promise<Response> => {
  // The same login-CSRF guard the sign-in door carries: a route handler gets no
  // automatic origin check, so a cross-site page could post a password into a
  // token it somehow holds. An Origin that is present and not ours is refused
  // before the token is touched.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response(CROSS_ORIGIN, { status: 403, headers: JSON_HEADERS });
  }

  const submission = await readSubmission(request);

  if (submission === null) {
    return new Response(INVALID_REQUEST, { status: 400, headers: JSON_HEADERS });
  }

  const problem = checkPassword(submission.password);

  if (problem !== null) {
    return new Response(JSON.stringify({ error: 'weak_password', problem }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  // Hashed before the transaction, never inside it: Argon2 is deliberately slow,
  // and a row held across it would serialise every concurrent accept.
  const passwordHash = await hashPassword(submission.password);
  const result = await setPasswordWithToken(submission.token, passwordHash);

  if (result.kind === 'invalid') {
    return new Response(EXPIRED, { status: 409, headers: JSON_HEADERS });
  }

  if (result.kind === 'suspended') {
    return new Response(SUSPENDED, { status: 403, headers: JSON_HEADERS });
  }

  const cookie = await issue(result.accountId);

  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': serializeCookie(cookie) },
  });
});
