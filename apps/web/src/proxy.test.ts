/**
 * `Cache-Control: no-store` on every authenticated response (`AUTH-004/T4`).
 *
 * Two things can go wrong and only one of them is visible. The header can be
 * absent from a response that needed it — which is the leak, and which nothing
 * in the application notices, because a cacheable room renders exactly like an
 * uncacheable one until somebody presses the back button. The header can also
 * be present on a response that did not need it, which costs a signed-out
 * reader a cache entry and nothing else. So the assertions below are weighted
 * accordingly: the presence case is checked against every shape of cookie a
 * request can carry, and the absence case is checked once.
 *
 * What this file cannot check is Next's own routing: whether the matcher makes
 * the proxy run at all for a given path. The pattern's intent is pinned here as
 * a regular expression, and the routing itself is exercised against a running
 * server — `docs/runbooks/auth-004-sign-out.md` records that run.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { sessionCookieName } from './auth/session';
import { config, proxy } from './proxy';

// Read through getConfig() on the first call inside a test body, which is after
// these are set: nothing imported here touches the environment at module scope.
process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.DATABASE_URL = 'postgres://valotech:valotech@127.0.0.1:5434/valotech';
process.env.SESSION_SECRET = 's'.repeat(40);

const NO_STORE = 'no-store';

function requestWith(cookie: string | null, path = '/account/sessions'): NextRequest {
  const headers = new Headers();

  if (cookie !== null) {
    headers.set('Cookie', cookie);
  }

  return new NextRequest(`http://localhost:3100${path}`, { headers });
}

/**
 * The matcher as a regular expression over the path.
 *
 * Next compiles the pattern itself, so this is an approximation of its routing
 * and not the routing. It is here for one failure the approximation does catch:
 * a typo in the negative lookahead, which either exempts every path — and no
 * response is ever marked — or exempts none, and a signed-in reader
 * re-downloads the bundle on each navigation. Both are silent.
 */
function matches(path: string): boolean {
  const [pattern] = config.matcher;

  return new RegExp(`^${pattern ?? ''}$`).test(path);
}

describe('the proxy', () => {
  it('marks a response unstorable when the request presented a session', () => {
    const response = proxy(requestWith(`${sessionCookieName()}=a-token`));

    expect(response.headers.get('Cache-Control')).toBe(NO_STORE);
  });

  it('marks it for a cookie among others, whatever order the browser sent them in', () => {
    const before = proxy(requestWith(`theme=dark; ${sessionCookieName()}=a-token`));
    const after = proxy(requestWith(`${sessionCookieName()}=a-token; theme=dark`));

    expect(before.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(after.headers.get('Cache-Control')).toBe(NO_STORE);
  });

  it('marks a response on any path, so a surface added later is covered by nothing', () => {
    // The property this file exists for. A prefix list would have to name
    // `/room` on the day INV-002 mounts it, and would silently omit it on every
    // day somebody forgets; the cookie is what makes the response an
    // authenticated one, and it is the same cookie on every path.
    for (const path of ['/', '/room', '/room/2026-q3', '/account/sessions', '/api/anything']) {
      const response = proxy(requestWith(`${sessionCookieName()}=a-token`, path));

      expect(response.headers.get('Cache-Control')).toBe(NO_STORE);
    }
  });

  it('leaves a response alone when the request presented no session', () => {
    expect(proxy(requestWith(null)).headers.get('Cache-Control')).toBeNull();
  });

  it.each([
    ['a cookie belonging to something else', 'theme=dark'],
    ['a cookie whose name only starts the same way', 'valotech-preview=a-token'],
    ['the session cookie with an empty value', `${sessionCookieName()}=`],
  ])('leaves it alone for %s, which is not a session', (_case, cookie) => {
    expect(proxy(requestWith(cookie)).headers.get('Cache-Control')).toBeNull();
  });

  it('passes the request through rather than answering it', () => {
    // NextResponse.next() is a continuation, not a body. A proxy that answered
    // here would replace every authenticated page with an empty 200.
    const response = proxy(requestWith(`${sessionCookieName()}=a-token`));

    expect(response.status).toBe(200);
  });
});

describe('the matcher', () => {
  it.each(['/', '/room', '/account/sessions', '/api/auth/sign-out'])(
    'runs the proxy on %s',
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );

  it.each(['/_next/static/chunks/main.js', '/_next/image'])(
    'exempts %s, which carries no session and is identical for every reader',
    (path) => {
      expect(matches(path)).toBe(false);
    },
  );
});
