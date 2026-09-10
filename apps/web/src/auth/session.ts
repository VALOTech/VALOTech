/**
 * Writing and unwriting a session (`AUTH-002`). Sign-in is the only thing that
 * issues one; `AUTH-004` and `ADMIN-001` are the only things that end one.
 *
 * The cookie carries a random token and the `sessions` row stores only its
 * hash, so a database dump is a set of hashes rather than a set of live
 * sessions. The hash is SHA-256, not Argon2: the token is 256 bits from the
 * system CSPRNG, so there is no low-entropy secret for a slow hash to protect
 * and a per-request verification cost would buy nothing.
 *
 * Issuing writes the row and hands the cookie back rather than setting it. The
 * caller applies it to its own response, which keeps this function a plain
 * asynchronous call with no request context to construct — and keeps the
 * cookie's attributes an object a test can read rather than a header it has to
 * parse.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { Transaction } from 'kysely';

import { getConfig } from '../config/index';
import { getDb } from '../db/index';
import type { Database } from '../db/types';

/** 256 bits from the system CSPRNG, which is what makes the token unguessable. */
const TOKEN_BYTES = 32;

const MILLISECONDS_PER_SECOND = 1000;

/**
 * The cookie a signed-in reader carries. The attributes `AUTH-002` fixes are
 * literal types rather than free values, so a caller cannot construct a session
 * cookie without them: `HttpOnly` keeps script from reading it, `SameSite=Lax`
 * keeps a cross-site POST from carrying it, and `Path=/` is one of the three
 * conditions the `__Host-` prefix requires.
 */
export interface SessionCookie {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: true;
  readonly sameSite: 'Lax';
  readonly secure: boolean;
  readonly path: '/';
  readonly maxAge: number;
}

/**
 * The cookie's name, which depends on the environment.
 *
 * The `__Host-` prefix forbids a `Domain` attribute and requires `Secure` and
 * `Path=/`, so a subdomain cannot set the cookie the application reads.
 * Development serves plain HTTP and cannot satisfy `Secure`, so it uses the
 * bare name; a browser would silently reject a `__Host-` cookie sent without
 * it, and a silently rejected session cookie looks exactly like a broken
 * sign-in.
 *
 * A function rather than a constant, because the environment is read through
 * `getConfig()` and a constant would read it at import — which would make
 * importing this module require a complete environment.
 */
export function sessionCookieName(): string {
  return getConfig().app.env === 'development' ? 'valotech' : '__Host-valotech';
}

/**
 * Serialise a session cookie into a `Set-Cookie` header value.
 *
 * `HttpOnly` carries no value and the type admits no session cookie without it,
 * so it is written rather than read.
 */
export function serializeCookie(cookie: SessionCookie): string {
  const attributes = [
    `${cookie.name}=${cookie.value}`,
    `Path=${cookie.path}`,
    `Max-Age=${cookie.maxAge}`,
    `SameSite=${cookie.sameSite}`,
    'HttpOnly',
  ];

  if (cookie.secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

/**
 * The cookie that ends the one `issue` set: same name, no value, `Max-Age=0`.
 *
 * A browser matches a cookie for replacement by name, path and domain, so every
 * attribute the issued cookie carries is carried here too. A `Max-Age=0` sent
 * under a different path would leave the original standing and add a second,
 * already-expired cookie beside it — and the reader would go on presenting a
 * token whose row `AUTH-004` had just deleted, which looks like a sign-out that
 * did not take.
 *
 * `Secure` matters for the same reason on the production cookie: the `__Host-`
 * prefix requires it, and a browser rejects a `__Host-` cookie sent without it —
 * including the one sent to expire it.
 */
export function expiredCookie(): SessionCookie {
  return {
    name: sessionCookieName(),
    value: '',
    httpOnly: true,
    sameSite: 'Lax',
    secure: getConfig().app.env !== 'development',
    path: '/',
    maxAge: 0,
  };
}

/**
 * Write a session for `accountId` and return the cookie that presents it.
 *
 * Every call mints a fresh token and a fresh row, which is the rotation
 * `AUTH-002` requires: a value planted in a reader's browser before they sign
 * in is replaced by the `Set-Cookie` this produces, so it never becomes an
 * authenticated session. The reader's own sessions on other devices are left
 * alone — ending those is what a privilege change does, not what signing in on
 * a second device means.
 */
export async function issue(accountId: string): Promise<SessionCookie> {
  const config = getConfig();
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  await getDb()
    .insertInto('sessions')
    .values({
      account_id: accountId,
      token_hash: createHash('sha256').update(token).digest('hex'),
      expires_at: new Date(Date.now() + config.session.ttlSeconds * MILLISECONDS_PER_SECOND),
    })
    .execute();

  return {
    name: sessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.app.env !== 'development',
    path: '/',
    maxAge: config.session.ttlSeconds,
  };
}

/**
 * Delete the session a token presents.
 *
 * Deleting nothing is success. A token whose row is already gone — signed out
 * twice, or a stale tab posting after a privilege change — has had its intent
 * satisfied already, and `AUTH-004` requires that state to redirect rather than
 * to raise: an error there would show alarming text to somebody who did the
 * right thing.
 *
 * The lookup is by hash, as everywhere else on this path: the row holds the
 * SHA-256 and never the token, so a delete keyed on the raw value would match
 * nothing and report the same success it reports for a session that was really
 * ended. That failure is silent by construction, which is why `AUTH-004`'s
 * suite asserts the row is gone rather than asserting the call returned.
 */
export async function invalidateSession(token: string): Promise<void> {
  await getDb()
    .deleteFrom('sessions')
    .where('token_hash', '=', createHash('sha256').update(token).digest('hex'))
    .execute();
}

/**
 * Delete every session an account holds, on any device, inside the caller's
 * transaction.
 *
 * The parameter is a `Transaction`, never the pool, and that is the atomicity
 * `ADMIN-001` requires expressed as a type. A suspension or a role change
 * changes the account and ends its sessions as one act: a state change that
 * commits while this delete fails is a privilege change that has not happened,
 * and a delete that commits while the state change fails signs somebody out for
 * nothing. `Transaction<Database>` is not assignable from `Kysely<Database>`,
 * so a caller holding the bare handle cannot reach this at all, and the
 * discipline is checked by the compiler rather than remembered by whoever
 * writes the next call site.
 *
 * It takes an account id and nothing about who asked, because two callers need
 * exactly this and for different reasons: a person ending every session because
 * they think their password is known (`AUTH-004`), and an admin suspending or
 * re-roling that account (`ADMIN-001`). Whether the caller may do it is the
 * caller's question — this one is the write, and putting an authorisation check
 * inside it would be a check the admin path has to defeat.
 *
 * Revocation that takes effect at the next natural expiry is not revocation, so
 * this is a delete rather than a flag: the gate resolves a session by looking
 * the row up, and a row that is gone cannot be resolved by anything.
 */
export async function invalidateAllForAccountIn(
  trx: Transaction<Database>,
  accountId: string,
): Promise<void> {
  await trx.deleteFrom('sessions').where('account_id', '=', accountId).execute();
}

/**
 * Delete every session an account holds, in a transaction of its own, for the
 * caller whose whole act this is.
 *
 * The account-wide predicate is written once, above, and this opens the
 * transaction the other form demands. Two spellings of "every session this
 * account holds" would be two chances to scope it wrongly, and the wrong one
 * would be silent in whichever path nobody exercised: a delete that matched too
 * little leaves a live session behind a revocation that reported success.
 */
export async function invalidateAllForAccount(accountId: string): Promise<void> {
  await getDb()
    .transaction()
    .execute((trx) => invalidateAllForAccountIn(trx, accountId));
}
