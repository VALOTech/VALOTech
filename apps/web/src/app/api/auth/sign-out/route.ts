/**
 * `POST /api/auth/sign-out` — ending this session, on the server (`AUTH-004`).
 *
 * The order is the whole feature. The row is deleted first and the cookie is
 * expired second, because clearing the cookie first leaves a live session with
 * nobody holding the reference: the browser has forgotten a credential that
 * still works, and a crash between the two steps leaves it working until its
 * natural expiry. Asking the browser to forget is not revocation, and the
 * shared laptop and the copied cookie are the cases where the browser is not
 * the party being asked.
 *
 * A failed delete is therefore not caught. If the database refuses, the caller
 * gets a `500` and keeps a cookie that still matches a live row — which is the
 * truth. Answering `303` and expiring the cookie anyway would report a sign-out
 * that did not happen, on the one path where that report is the safety property.
 *
 * `POST` only, and the file exports nothing else: a `GET /sign-out` is signed
 * out by any page that can embed an image and by any link checker, and Next
 * answers the methods a route does not export with `405`.
 *
 * There is no `Origin` check as there is on sign-in. The session cookie is
 * `SameSite=Lax`, so a *cross-site* POST arrives carrying no cookie and this
 * handler finds no token. The residual is *same-site*: the gateway on the
 * apex and this application on a subdomain share a site, so a page there could
 * post a signed-in reader's cookie here and force a sign-out. That is
 * denial-of-session, not theft, and the only Origin check that preserves the
 * no-error-state rule is a silent no-op on a cross-origin post — which
 * manufactures a sign-out that did not take, worse than the forced one it
 * prevents. So the claim is bounded rather than the code changed.
 */

import { presentedToken } from '../../../../auth/gate';
import { invalidateSession } from '../../../../auth/session';
import { signedOut } from '../../../../auth/sign-out';

export async function POST(request: Request): Promise<Response> {
  const token = presentedToken(request.headers);

  // No cookie, or one whose row is already gone, redirects like any other
  // sign-out: the caller's intent is satisfied either way, and an
  // already-signed-out error would only be a way for a stale tab to alarm
  // somebody who did the right thing.
  if (token !== null) {
    await invalidateSession(token);
  }

  return signedOut();
}
