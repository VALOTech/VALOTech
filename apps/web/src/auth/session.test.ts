import { describe, expect, it } from 'vitest';

import { serializeCookie, sessionCookieName, type SessionCookie } from './session';

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
