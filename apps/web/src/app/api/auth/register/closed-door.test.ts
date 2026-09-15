/**
 * `POST /api/auth/register` with the door shut, which is how it ships
 * (`AUTH-005/T2`).
 *
 * **This is the posture every deployment has until one says otherwise**, so it is
 * the one worth a file of its own rather than a case inside the open-door suite.
 * The configuration is read once per process, so a single file cannot hold both
 * postures without reaching inside that read — and a suite that reached inside it
 * would be testing the reach rather than the route.
 *
 * Nothing here needs a database, and that is the assertion rather than a
 * convenience: a shut door is answered before the body is parsed, so no address
 * is normalised, no counter is keyed, and no statement is issued. The connection
 * string below names a database this file never opens.
 */

import { describe, expect, it } from 'vitest';

import type { MailAvailability } from '../../../../mail/availability';
import type { Deliver } from '../../../../mail/transactional';

const ORIGIN = 'http://localhost:3100';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = ORIGIN;
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/never-opened';
// Absent, which is the default the application ships with. Stated rather than
// left to whatever the shell exported, so this file asserts the shipped posture
// and not the developer's.
delete process.env.AUTH_REGISTRATION_OPEN;

const { handleRegister } = await import('./handler');

/** Sending is possible, so the flag is the only thing shutting the door. */
const sendable: () => Promise<MailAvailability> = async () =>
  ({
    available: true,
    mail: { available: true, url: { value: 'smtp://localhost:1025' }, from: 'hall@valotech.test' },
  }) as MailAvailability;

/** A delivery that fails the test if the route ever reaches it. */
const refuse: Deliver = async () => {
  throw new Error('a shut door handed a message to the port');
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: ORIGIN,
      'x-forwarded-for': '203.0.113.99',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/auth/register, with registration not opened', () => {
  it('answers that the door is shut, and says nothing about the address', async () => {
    const response = await handleRegister(post({ name: 'A Prospect', email: 'a@example.test' }), refuse, sendable);

    expect(response.status).toBe(503);
    expect(await response.text()).toBe(JSON.stringify({ error: 'registration_closed' }));
  });

  it('answers the same for every address, since the door is a property of the deployment', async () => {
    const one = await handleRegister(post({ name: 'A', email: 'one@example.test' }), refuse, sendable);
    const two = await handleRegister(post({ name: 'B', email: 'two@example.test' }), refuse, sendable);

    expect([one.status, await one.text()]).toEqual([two.status, await two.text()]);
  });

  it('shuts before the body is read, so a malformed one gets the same answer', async () => {
    // The order matters: a 400 here would mean the route parsed, validated and
    // keyed a counter on an address before deciding it was not open for
    // business — work an anonymous caller could make it do at will.
    const response = await handleRegister(post('not json at all'), refuse, sendable);

    expect(response.status).toBe(503);
  });

  it('still refuses a cross-site origin first, so the first lock stays first', async () => {
    const response = await handleRegister(
      post({ name: 'A Prospect', email: 'a@example.test' }, { origin: 'https://not-this-hall.example' }),
      refuse,
      sendable,
    );

    expect(response.status).toBe(403);
  });

  it('counts nothing against the limiter, so a shut door cannot be used to lock anybody out', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await handleRegister(post({ name: 'A Prospect', email: 'target@example.test' }), refuse, sendable);
    }

    const { getRateLimiter } = await import('../../../../auth/rate-limit');
    expect(getRateLimiter().hit('register-account:target@example.test').limited).toBe(false);
    expect(getRateLimiter().hit('account:target@example.test').limited).toBe(false);
  });
});
