/**
 * The security baseline every response carries (`SEC-001`), and
 * `Cache-Control: no-store` on the authenticated ones (`AUTH-004`).
 *
 * Both properties belong to responses rather than to routes, so both are set in
 * one place. A per-route list would be a proxy for the property and would be
 * under-inclusive the day a surface is added and the list is not — silently, in
 * both directions: a page with no Content-Security-Policy looks identical to a
 * protected one until somebody injects a script, and a cacheable room looks
 * identical to an uncacheable one until somebody presses Back.
 *
 * **What counts as authenticated is the cookie, not the path.** Reading the
 * cookie is the definition itself: a response is authenticated when the request
 * that asked for it presented a session, so `INV-002`'s room is covered by the
 * commit that mounts it and by no edit here. It is also the accurate test for
 * the back-button case, because the pages in a signed-out person's history are
 * precisely the ones fetched while their cookie was present. A cookie that no
 * longer resolves — expired, or a row `AUTH-004` has just deleted — still marks
 * the response, which is the fail-closed direction: the cost is one unstorable
 * response for somebody signed out, and the alternative costs a stored page
 * belonging to somebody who was signed in.
 *
 * The failure `no-store` closes is the back button. A browser that stored a
 * rendered gated page will re-display it from history after the session that
 * earned it has been ended, so the person who signed out on a shared laptop
 * watches the next person press Back into their room. The session is genuinely
 * gone — nothing new can be fetched — which is exactly why the stale render is
 * the only thing left to leak.
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
import { newRequestId, REQUEST_ID_HEADER } from './ops/request-context';

/**
 * The headers whose value is the same for every response.
 *
 * `Strict-Transport-Security` is two years with `includeSubDomains` and
 * `preload`. A browser ignores the header entirely on a response that did not
 * arrive over TLS (RFC 6797), so it is inert in development and binding in
 * production. The `preload` token is a statement of eligibility and not an
 * enrolment: browsers act on it only once the domain is submitted to and
 * accepted by the preload list, which is a separate, human, and slow-to-undo
 * step — and the step that makes plain HTTP unreachable for every subdomain.
 *
 * `Permissions-Policy` names the capabilities with an empty allow-list rather
 * than omitting them, because an omitted feature is permitted by default.
 * `browsing-topics` and `interest-cohort` are the current and the retired names
 * for interest-based ad targeting; a browser acts on whichever it implements, so
 * both are denied and neither is trusted to be the live one.
 */
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()'],
];

/**
 * A fresh 128-bit nonce, base64 as the Content-Security-Policy grammar requires.
 *
 * Per request, and unguessable, because the whole protection is that an
 * injected script cannot carry the value: a nonce reused across responses is
 * one an attacker reads from the previous page and writes into the next.
 */
function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}

/**
 * The policy, with the one exception this application actually needs.
 *
 * `script-src` admits `'self'` and this response's nonce, and nothing else.
 * Next serialises the rendered tree into two inline `<script>` tags on every
 * page, so a policy carrying neither a nonce nor `'unsafe-inline'` blocks them
 * and React cannot hydrate — the page paints and then does nothing. The nonce
 * is the price of refusing `'unsafe-inline'`, which would have removed the
 * protection from every page in order to make one page work.
 */
function contentSecurityPolicy(nonce: string): string {
  return (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; " +
    `script-src 'self' 'nonce-${nonce}'; ` +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );
}

export function proxy(request: NextRequest): NextResponse {
  const policy = contentSecurityPolicy(createNonce());

  // The request id is minted here, at the edge, because this is the one place
  // every request passes through: a line logged anywhere in the request that
  // follows reads it from the context the handler opens (`OPS-002/T2`). It goes
  // on the request so the handler can open that context from it, and on the
  // response so the reader and the logs downstream can name the same request.
  const requestId = newRequestId();

  // Next reads the nonce off the *request*'s policy and stamps it onto the tags
  // it emits, so the header has to be visible to the render and not only to the
  // browser. The render is what applies it, which is why every route renders per
  // request: a page prerendered at build time carries no nonce, and its inline
  // scripts are refused by the very policy sent with it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', policy);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy', policy);
  response.headers.set(REQUEST_ID_HEADER, requestId);

  for (const [name, value] of SECURITY_HEADERS) {
    response.headers.set(name, value);
  }

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
 * carry no session and differ for nobody. A Content-Security-Policy on them
 * would govern nothing either — they are not documents. `nosniff` would still
 * bind, but these are content-addressed build artefacts served with a known
 * type, not the uploaded media that header guards (`CMS-003`).
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
