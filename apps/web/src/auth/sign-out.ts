/**
 * The answer both sign-out surfaces return (`AUTH-004`).
 *
 * One builder rather than two, because the three things it fixes are the three
 * the feature is about: where the person lands, that the cookie is expired
 * rather than left standing, and that the response is not stored. Two copies of
 * that would be two chances for the pair to disagree, and the disagreement
 * would be silent — a sign-out that redirects correctly and leaves the browser
 * holding a cookie reads exactly like one that worked.
 */

import { expiredCookie, serializeCookie } from './session';

/**
 * The public gateway, which is where a signed-out person lands.
 *
 * Never a page they can no longer see: that would greet a sign-out with an
 * access refusal, and it would send somebody who has just ended a session to a
 * surface that immediately asks them to start one.
 */
const GATEWAY = '/';

/**
 * The redirect a completed sign-out returns.
 *
 * `303 See Other` rather than `302`: the sign-out is a POST, and `303` is the
 * status that tells the browser to fetch the target with GET whatever the
 * original method was (RFC 9110 §15.4.4). `Location` is a relative reference,
 * which the specification permits (RFC 9110 §10.2.2) and which cannot send
 * anybody to another host when a deployment's origin is set wrongly.
 *
 * `no-store` is on the response itself rather than left to the proxy. The proxy
 * marks a response as unstorable because the request presented a session
 * cookie; this response is the one that takes that cookie away, and it is the
 * one an intermediary would most like to keep — a stored redirect carrying a
 * `Set-Cookie` that expires a session is a cached sign-out for whoever gets it
 * next.
 */
export function signedOut(): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: GATEWAY,
      'Set-Cookie': serializeCookie(expiredCookie()),
      'Cache-Control': 'no-store',
    },
  });
}
