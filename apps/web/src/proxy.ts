/**
 * `Cache-Control: no-store` on every authenticated response (`AUTH-004`).
 *
 * The failure this closes is the back button. A browser that stored a rendered
 * gated page will re-display it from history after the session that earned it
 * has been ended, so the person who signed out on a shared laptop watches the
 * next person press Back into their room. The session is genuinely gone —
 * nothing new can be fetched — which is exactly why the stale render is the
 * only thing left to leak, and why the header is the fix rather than a
 * refinement.
 *
 * **What counts as authenticated is the cookie, not the path.** A prefix list
 * would be a proxy for the property and would be under-inclusive the day a
 * surface is added and the list is not — silently, since a cacheable room looks
 * identical to an uncacheable one until somebody presses Back. Reading the
 * cookie is the definition itself: a response is authenticated when the request
 * that asked for it presented a session, so `INV-002`'s room is covered by the
 * commit that mounts it and by no edit here. It is also the accurate test for
 * the back-button case, because the pages in a signed-out person's history are
 * precisely the ones fetched while their cookie was present.
 *
 * A cookie that no longer resolves — expired, or a row `AUTH-004` has just
 * deleted — still marks the response. That is the fail-closed direction: the
 * cost is one unstorable response for somebody signed out, and the alternative
 * costs a stored page belonging to somebody who was signed in.
 *
 * `proxy.ts` rather than `middleware.ts`: Next 16 deprecated the middleware
 * file convention in favour of this one, which always runs on the Node.js
 * runtime. That is Next's own rule for a proxy, not a consequence of what this
 * file imports — the cookie parser it calls reaches no crypto and opens no
 * pool. It shares that parser with the gate rather than copying it (R9), which
 * is what a second cookie parser on an auth path would be a place to get wrong.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { presentedToken } from './auth/gate';

export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  if (presentedToken(request.headers) !== null) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
}

/**
 * Everything but the build's own immutable assets.
 *
 * `_next/static` and `_next/image` are content-addressed and identical for
 * every reader, so marking them unstorable would make a signed-in reader
 * re-download the bundle on each navigation and would protect nothing: they
 * carry no session and differ for nobody.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
