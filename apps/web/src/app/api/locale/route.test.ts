/**
 * The language control's route (`INV-001/T4`).
 *
 * Two of its properties are security ones and neither is visible from the
 * screen, which is why they are pinned here rather than left to the hand check
 * that found them working once. A `next` field becomes a `Location`, so a value
 * that is not a path on this application is an open redirect — the way a link
 * that looks like ours arrives somewhere that is not. And a route handler gets
 * no automatic origin check, so a cross-site form can post here with no
 * preflight; changing somebody's language is a nuisance rather than a theft,
 * but an unchecked write is a control any page on the internet can drive.
 */

import { beforeAll, describe, expect, it } from 'vitest';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://valotech:valotech@127.0.0.1:5434/valotech';

const ORIGIN = 'http://localhost:3100';

type Handler = (request: Request) => Promise<Response>;
let POST: Handler;

function post(fields: Record<string, string>, origin: string | null = ORIGIN): Promise<Response> {
  const body = new URLSearchParams(fields);
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (origin !== null) {
    headers.origin = origin;
  }
  return POST(new Request(`${ORIGIN}/api/locale`, { method: 'POST', headers, body }));
}

describe('POST /api/locale', () => {
  beforeAll(async () => {
    ({ POST } = (await import('./route')) as unknown as { POST: Handler });
  });

  it('sets the chosen locale and returns the reader where they were', async () => {
    const answer = await post({ locale: 'vi', next: '/room?type=update' });
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/room?type=update');
    expect(answer.headers.get('set-cookie')).toContain('NEXT_LOCALE=vi');
  });

  it.each([
    ['//evil.example', 'a protocol-relative URL'],
    ['https://evil.example', 'an absolute URL'],
    ['/\\evil.example', 'a backslash a browser reads as a separator'],
    ['javascript:alert(1)', 'a scheme that is not a path'],
    ['room', 'a path that is not rooted'],
  ])('refuses %s as a destination (%s)', async (next) => {
    const answer = await post({ locale: 'vi', next });
    expect(answer.headers.get('location')).toBe('/room');
  });

  it('changes nothing for a locale outside the catalogue', async () => {
    // Storing one would fall back on every render rather than fail once.
    const answer = await post({ locale: 'klingon', next: '/room' });
    expect(answer.status).toBe(303);
    expect(answer.headers.get('set-cookie')).toBeNull();
  });

  it('refuses a cross-site post', async () => {
    expect((await post({ locale: 'vi' }, 'https://evil.example')).status).toBe(403);
  });

  it('serves a client that sends no origin at all', async () => {
    // A non-browser client sends none, and the check is about a page driving
    // somebody's browser rather than about who is allowed to call it.
    expect((await post({ locale: 'vi', next: '/room' }, null)).status).toBe(303);
  });
});
