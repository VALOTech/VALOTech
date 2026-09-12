/**
 * Resolving a session cookie to the reader who presented it, and the two
 * helpers a page or a route asks for the reader it needs (`AUTH-002`).
 * `session.ts` writes a session; this is the read side of the same scheme.
 *
 * The cookie carries a token and the row holds its SHA-256, so resolving is a
 * lookup by hash rather than a comparison against anything a database dump
 * contains. A session resolves only while its account is active, which is what
 * makes a suspension take effect on the reader's next request rather than on
 * their next sign-in.
 *
 * Resolving also slides the session forward: `last_seen_at` and `expires_at`
 * both move. That is a write on every gated request, which a room with a
 * handful of readers affords; if it ever stops being affordable the write
 * becomes periodic rather than the expiry becoming absolute, because an
 * investor timed out mid-report costs more than the row does.
 *
 * What comes back is an `Actor`, and every repository read takes one as its
 * first argument. The scoping rule is then a signature rather than a habit:
 * forgetting it does not compile (`DATA-R05`).
 */

import { createHash } from 'node:crypto';

import { sql } from 'kysely';

import { getConfig } from '../config/index';
import { getDb } from '../db/index';
import type { AccountRole } from '../db/types';
import { sessionCookieName, tokenOfCookie } from './session';

/**
 * The reader a gated read is performed for: who they are and what they may
 * see. It is the account's identity and nothing else, because nothing a read
 * filters on needs more, and a wider object is one a caller starts rendering.
 */
export interface Actor {
  readonly id: string;
  readonly role: AccountRole;
}

/**
 * What the gate needs from a request: the headers the cookie arrived in.
 *
 * A `Request` satisfies it, which is what a route handler and middleware hold.
 * A Server Component holds no `Request` and passes the headers it does hold.
 * Narrowing the parameter to the one thing the gate reads is what keeps both
 * surfaces on one resolution path — a helper only one of them can call is a
 * helper the other reimplements, and a second cookie parser on an auth path is
 * a second place for it to be wrong.
 */
export type SessionRequest = Pick<Request, 'headers'>;

/** The form, which is where a reader with no session is sent (`AUTH-001`). */
const SIGN_IN = '/sign-in';

/**
 * The session token the request presents, or `null` when it presents none.
 *
 * The first cookie of the name wins, which is the one a browser sends first
 * for the most specific path. Outside development the `__Host-` prefix is what
 * stops a second cookie of that name existing at all: it forbids `Domain`, so
 * no sibling host can set one. Development serves plain HTTP, cannot use the
 * prefix, and accepts that a cookie planted by another service on `localhost`
 * would be read here.
 *
 * The signature is checked here, which is what puts it before every row
 * lookup rather than beside one of them: a caller that holds a token from
 * this function holds one this server signed, and there is no other way for a
 * request's cookie to become a token. A value that fails the check is not a
 * different kind of answer — it is no token at all, the same answer as no
 * cookie, so no caller grew a branch to handle it and none can forget to.
 *
 * Exported because three surfaces read the cookie and only one of them
 * resolves it: the gate, `AUTH-004`'s sign-out — which deletes a session by
 * the token it was handed and never needs an actor — and the proxy, which
 * only asks whether a request is an authenticated one. A second parser on
 * any of those paths is a second place for the cookie name, the
 * first-cookie-wins rule and the signature to be wrong.
 */
export function presentedToken(headers: Headers): string | null {
  const header = headers.get('cookie');

  if (header === null) {
    return null;
  }

  const name = sessionCookieName();

  for (const part of header.split(';')) {
    const pair = part.trim();
    const separator = pair.indexOf('=');

    if (separator < 0 || pair.slice(0, separator) !== name) {
      continue;
    }

    return tokenOfCookie(pair.slice(separator + 1));
  }

  return null;
}

/**
 * The reader a token belongs to, or `null` when it belongs to nobody.
 *
 * Resolving and sliding are one statement rather than a read followed by a
 * write. The predicate that admits the session is the same one that authorises
 * the update, so an expired row cannot be slid forward by an ordering mistake:
 * there is no ordering, and a row the predicate excluded is a row the update
 * did not touch. It also costs one round trip on the path every gated read
 * runs through.
 *
 * Both the predicate and the new expiry read the database's clock. Mixing them
 * — the application's clock for the value, the server's for the comparison —
 * would turn a skewed process into sessions that expire early or late, and the
 * skew would be invisible on both sides of it.
 */
export async function resolveSession(token: string | null): Promise<Actor | null> {
  if (token === null) {
    return null;
  }

  const { ttlSeconds } = getConfig().session;

  const reader = await getDb()
    .updateTable('sessions')
    .from('accounts')
    .set({
      last_seen_at: sql<Date>`now()`,
      expires_at: sql<Date>`now() + make_interval(secs => cast(${ttlSeconds} as int))`,
    })
    .whereRef('sessions.account_id', '=', 'accounts.id')
    .where('sessions.token_hash', '=', createHash('sha256').update(token).digest('hex'))
    .where('sessions.expires_at', '>', sql<Date>`now()`)
    .where('accounts.state', '=', 'active')
    .returning(['accounts.id as id', 'accounts.role as role'])
    .executeTakeFirst();

  return reader ?? null;
}

/**
 * The reader a token belongs to, resolved without sliding the session.
 *
 * `resolveSession` slides the expiry on every gated read, which is right for a
 * read and wrong for a destructive one: a path that is about to delete the
 * session must not first extend it, because a delete that then fails would
 * leave the session live with a fresh full lifetime -- worse than doing
 * nothing. This is the same predicate as a plain read, so an expired cookie or
 * a suspended account yields nobody; it just does not write.
 */
export async function accountForToken(token: string | null): Promise<Actor | null> {
  if (token === null) {
    return null;
  }

  const reader = await getDb()
    .selectFrom('sessions')
    .innerJoin('accounts', 'accounts.id', 'sessions.account_id')
    .where('sessions.token_hash', '=', createHash('sha256').update(token).digest('hex'))
    .where('sessions.expires_at', '>', sql<Date>`now()`)
    .where('accounts.state', '=', 'active')
    .select(['accounts.id as id', 'accounts.role as role'])
    .executeTakeFirst();

  return reader ?? null;
}

/**
 * The answer a caller returns when there is no reader to serve.
 *
 * `303` rather than `307`: the form is fetched with GET whatever the refused
 * request was, so a POST to a gated route does not arrive at the sign-in page
 * still carrying the body it was refused for (RFC 9110 §15.4.4). `Location`
 * holds a relative reference, which the specification permits (RFC 9110
 * §10.2.2) and which cannot send a reader to another host when a deployment's
 * origin is set wrongly.
 */
function toSignIn(): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: SIGN_IN, 'Cache-Control': 'no-store' },
  });
}

/**
 * The answer a caller returns to a reader who is signed in and not entitled:
 * the one a path that does not exist gives.
 *
 * A `403` would confirm the surface exists to somebody who only guessed at it,
 * and so would a redirect, which is not what an unknown path answers. `404` is
 * the only answer that tells them nothing. It carries `no-store` because a
 * `404` is heuristically cacheable (RFC 9110 §15.5.5) and this one is a
 * property of who asked rather than of what was asked for — a shared cache
 * holding it would answer an admin with it.
 */
function notFound(): Response {
  return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * The reader of a room surface, or the response to return instead.
 *
 * An admin passes: they may read what an investor may. Both roles are named
 * rather than the check being left to every account resolving, because a third
 * role is a decision rather than an edit (§7.3) and until somebody makes it,
 * one added to the vocabulary is refused here rather than admitted silently.
 */
export async function requireInvestor(request: SessionRequest): Promise<Actor | Response> {
  const actor = await resolveSession(presentedToken(request.headers));

  if (actor === null) {
    return toSignIn();
  }

  return actor.role === 'investor' || actor.role === 'admin' ? actor : notFound();
}

/**
 * The reader of an admin surface, or the response to return instead.
 *
 * An investor with a live session is answered `404`, not `403` and not a
 * redirect: the console's existence is not confirmed to somebody who guessed
 * the path. A reader with no session is sent to the form, which is what every
 * gated path does and so states nothing about this one.
 */
export async function requireAdmin(request: SessionRequest): Promise<Actor | Response> {
  const actor = await resolveSession(presentedToken(request.headers));

  if (actor === null) {
    return toSignIn();
  }

  return actor.role === 'admin' ? actor : notFound();
}
