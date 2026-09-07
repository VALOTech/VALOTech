/**
 * Issuing a session (`AUTH-002`). Sign-in is the only thing that calls it.
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

import { getConfig } from '../config/index';
import { getDb } from '../db/index';

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
