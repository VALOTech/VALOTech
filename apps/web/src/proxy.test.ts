/**
 * The security baseline on every response (`SEC-001/T1`, `SEC-001/T2`) and
 * `Cache-Control: no-store` on the authenticated ones (`AUTH-004/T4`).
 *
 * Every property here fails silently, which is what the assertions are shaped
 * around. A missing `Content-Security-Policy` renders identically to a present
 * one until somebody injects a script; a missing `Cache-Control` renders
 * identically until somebody presses the back button; and a nonce that is
 * constant across responses looks exactly like a nonce that is not. So each
 * header is asserted by its exact value rather than its presence — a policy
 * with a directive quietly dropped is still a policy — and the two dimensions
 * that could exempt a response, the session cookie and the path, are crossed
 * against every one of them.
 *
 * What this file cannot check is Next's own behaviour: whether the matcher runs
 * the proxy for a given path, and whether the render stamps the nonce onto the
 * tags it emits. The matcher's intent is pinned below as a regular expression,
 * and both are exercised against a running server — `docs/runbooks/auth-004-sign-out.md`
 * records the `no-store` run.
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

/**
 * The policy with its nonce source removed — the contract as written, which the
 * implementation may add exactly one nonce to and nothing else.
 */
const POLICY_WITHOUT_NONCE =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/**
 * The headers whose value never varies. Written out a second time on purpose:
 * a value the implementation and the test both read from one constant is a
 * value neither of them checks.
 */
const CONSTANT_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()'],
];

/** The two request shapes every response-level property is crossed against. */
const SESSION_STATES: ReadonlyArray<readonly [string, string | null]> = [
  ['a request presenting a session', `${sessionCookieName()}=a-token`],
  ['a request presenting none', null],
];

function requestWith(cookie: string | null, path = '/account/sessions'): NextRequest {
  const headers = new Headers();

  if (cookie !== null) {
    headers.set('Cookie', cookie);
  }

  return new NextRequest(`http://localhost:3100${path}`, { headers });
}

function policyOf(cookie: string | null = null, path?: string): string {
  const header = proxy(requestWith(cookie, path)).headers.get('Content-Security-Policy');

  expect(header).not.toBeNull();

  return header ?? '';
}

/** The nonce source the policy carries, or null when it carries none. */
function nonceIn(policy: string): string | null {
  return /'nonce-([^']+)'/.exec(policy)?.[1] ?? null;
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

describe('the security baseline', () => {
  describe.each(CONSTANT_HEADERS)('%s', (name, value) => {
    it.each(SESSION_STATES)(`is ${value} on %s`, (_state, cookie) => {
      expect(proxy(requestWith(cookie)).headers.get(name)).toBe(value);
    });
  });

  it.each(SESSION_STATES)('sets the policy contract on %s', (_state, cookie) => {
    expect(policyOf(cookie).replace(/ 'nonce-[^']+'/, '')).toBe(POLICY_WITHOUT_NONCE);
  });

  it('admits no inline or eval source, whatever else the policy grows', () => {
    // The property SEC-001/T2 is: either keyword makes every other directive
    // decorative, and both are the shape this class of defect always takes —
    // added once to make one page work, and never removed.
    const policy = policyOf();

    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  });

  it.each(SESSION_STATES)('carries a nonce source on %s', (_state, cookie) => {
    expect(nonceIn(policyOf(cookie))).not.toBeNull();
  });

  it('mints a fresh nonce per response, so a read one is worthless', () => {
    const nonces = new Set(Array.from({ length: 8 }, () => nonceIn(policyOf())));

    expect(nonces.size).toBe(8);
    expect(nonces.has(null)).toBe(false);
  });

  it('mints one Next will accept, in the base64 the grammar admits', () => {
    // Next extracts the nonce from the policy with its own pattern and silently
    // renders without one when the value does not match. The page then serves a
    // policy whose nonce nothing in the HTML carries, and every script is
    // refused — no error anywhere but the browser console.
    expect(nonceIn(policyOf())).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/);
  });

  it('mints a request id, on the response and the request it renders (OPS-002/T2)', () => {
    const response = proxy(requestWith(null));
    const id = response.headers.get('x-request-id');

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // The handler opens its request context from the id on the request it is
    // handed, so a line logged in the request and the id returned to the reader
    // are the one the edge minted — the render-side header carries the response's.
    expect(response.headers.get('x-middleware-request-x-request-id')).toBe(id);
  });

  it('mints a fresh request id per response, so two requests never share one', () => {
    const ids = new Set(Array.from({ length: 8 }, () => proxy(requestWith(null)).headers.get('x-request-id')));

    expect(ids.size).toBe(8);
    expect(ids.has(null)).toBe(false);
  });

  it('hands the policy to the render as well as to the browser', () => {
    // Half the mechanism. Next reads the nonce off the request it renders, so a
    // response-only policy would leave its own inline tags unmarked and blocked
    // by the header sent beside them.
    const response = proxy(requestWith(null));
    const overridden = response.headers.get('x-middleware-override-headers') ?? '';

    expect(overridden.split(',').map((name) => name.trim())).toContain(
      'content-security-policy',
    );
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(
      response.headers.get('Content-Security-Policy'),
    );
  });

  it.each(['/', '/room', '/room/2026-q3', '/account/sessions', '/api/auth/sign-out'])(
    'sets every header on %s, so no route is exempt',
    (path) => {
      const response = proxy(requestWith(null, path));

      for (const [name, value] of CONSTANT_HEADERS) {
        expect(response.headers.get(name)).toBe(value);
      }

      expect(policyOf(null, path).replace(/ 'nonce-[^']+'/, '')).toBe(POLICY_WITHOUT_NONCE);
    },
  );
});

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
