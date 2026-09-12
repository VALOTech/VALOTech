import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  expiredCookie,
  serializeCookie,
  sessionCookieName,
  type SessionCookie,
  signToken,
  tokenOfCookie,
} from './session';

// The parts of a session cookie a test can pin without a database: the
// serialisation and the name. Issuing a row is exercised through the sign-in
// route's integration suite; here the concern is the production cookie, whose
// `__Host-` prefix and `Secure` attribute the route suite cannot reach because
// it runs under APP_ENV=development.
const BASE = { value: 'a-token', httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 43200 } as const;

describe('serializeCookie', () => {
  it('emits the production cookie with Secure and every attribute the __Host- prefix requires', () => {
    const header = serializeCookie({ ...BASE, name: '__Host-valotech', secure: true } satisfies SessionCookie);

    // Without Secure and Path=/ a browser silently drops a __Host- cookie, and a
    // dropped session cookie is indistinguishable from a broken sign-in — the
    // failure this test exists to catch.
    expect(header).toContain('__Host-valotech=a-token');
    expect(header).toContain('Path=/');
    expect(header).toContain('Secure');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Max-Age=43200');
  });

  it('omits Secure for the development cookie, which is served over plain HTTP', () => {
    const header = serializeCookie({ ...BASE, name: 'valotech', secure: false } satisfies SessionCookie);

    expect(header).toContain('valotech=a-token');
    expect(header).not.toContain('Secure');
    // HttpOnly is unconditional — it does not depend on the environment.
    expect(header).toContain('HttpOnly');
  });
});

describe('sessionCookieName', () => {
  it('is the __Host- name outside development, where Secure can be set', () => {
    // sessionCookieName reads process.env through getConfig(); this file's first
    // read decides the value, so a production environment is set before it.
    process.env.APP_ENV = 'production';
    process.env.APP_ORIGIN = 'https://valotech.org';
    process.env.DATABASE_URL = 'postgres://valotech:pw@db.internal:5432/valotech';
    process.env.DB_SSLMODE = 'require';
    process.env.SESSION_SECRET = 'x'.repeat(40);

    expect(sessionCookieName()).toBe('__Host-valotech');
  });
});

describe('expiredCookie', () => {
  it('empties the production cookie while keeping __Host-, Secure and every attribute', () => {
    // The singleton is production by now (sessionCookieName above built it). The
    // cookie sent to expire the session must be the same one issue() set, down to
    // Secure: a browser rejects a __Host- cookie sent without it -- including the
    // expiry -- and would then leave the session cookie, and the session, standing.
    process.env.APP_ENV = 'production';
    process.env.APP_ORIGIN = 'https://valotech.org';
    process.env.DATABASE_URL = 'postgres://valotech:pw@db.internal:5432/valotech';
    process.env.DB_SSLMODE = 'require';
    process.env.SESSION_SECRET = 'x'.repeat(40);

    const header = serializeCookie(expiredCookie());

    expect(header.startsWith('__Host-valotech=;')).toBe(true);
    expect(header).toContain('Secure');
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
  });
});

/**
 * The environment this file's configuration singleton is built from. Every
 * test sets it, because the singleton is built by whichever one runs first and
 * the order is not this file's to choose.
 */
function environment(): void {
  process.env.APP_ENV = 'production';
  process.env.APP_ORIGIN = 'https://valotech.org';
  process.env.DATABASE_URL = 'postgres://valotech:pw@db.internal:5432/valotech';
  process.env.DB_SSLMODE = 'require';
  process.env.SESSION_SECRET = 'x'.repeat(40);
}

describe('signing the cookie (AUTH-002/T5)', () => {
  const TOKEN = 'a-token';

  it('signs with SESSION_SECRET itself, which is what makes rotating it a lever', () => {
    environment();

    // Computed here from the environment rather than read back through the
    // verifier: a round trip agrees with itself under any key, so it could not
    // tell SESSION_SECRET from a constant baked into the module — and a constant
    // is a key rotating the secret would not change, so nobody would be signed
    // out by a rotation that was supposed to sign out everybody.
    const expected = createHmac('sha256', process.env.SESSION_SECRET as string)
      .update(TOKEN)
      .digest('base64url');

    expect(signToken(TOKEN)).toBe(`${TOKEN}.${expected}`);
  });

  it('reads back the token it signed, and nothing else', () => {
    environment();

    expect(tokenOfCookie(signToken(TOKEN))).toBe(TOKEN);
  });

  it.each([
    ['a bare token, which is what this cookie used to be', () => TOKEN],
    ['an empty value', () => ''],
    ['a separator with nothing before it', () => `.${signatureIn(signToken(TOKEN))}`],
    ['a signature one character short', () => signToken(TOKEN).slice(0, -1)],
    ['a signature from another secret', () => underAnotherSecret(TOKEN)],
  ])('carries no token for %s', (_case, build) => {
    environment();

    expect(tokenOfCookie(build())).toBeNull();
  });
});

/** The signature half of a cookie value. */
function signatureIn(value: string): string {
  return value.slice(value.lastIndexOf('.') + 1);
}

/**
 * The same token under a key this server never held — which is what every live
 * cookie becomes the moment `SESSION_SECRET` is rotated.
 */
function underAnotherSecret(token: string): string {
  const signature = createHmac('sha256', 'another secret entirely')
    .update(token)
    .digest('base64url');

  return `${token}.${signature}`;
}
