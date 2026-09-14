/**
 * `POST /api/auth/forgot` — asking for a reset link (`AUTH-003`, `SEC-001/T4`).
 *
 * **One answer, always.** An address an account holds and one it does not get the
 * same status, the same empty body and the same time to produce it. The reset
 * form is where an address list gets confirmed — the sign-in form gets the
 * attention — so there is no branch here that the database's answer decides, and
 * the identical answer is a property of the shape rather than of two paths kept
 * in step (`SEC-R03`).
 *
 * **The message is started and not awaited, and that is a security property
 * rather than a performance one.** Handing a message to a mail server is a
 * network round trip: hundreds of milliseconds against the low milliseconds the
 * statements above cost. A request that waited for it would answer slowly for an
 * address an account holds and quickly for one it does not, which is the whole
 * enumeration oracle handed over in a form nobody needs statistics to read. So
 * `requestReset` hands back the message to send, and this starts it after the
 * answer has been decided (`ResetDelivery`).
 *
 * **Its own rate-limit keys, not sign-in's.** Both surfaces limit per account and
 * per address, but on separate counters: sharing them would let an anonymous
 * caller spend a named person's sign-in allowance by posting their address here,
 * which is a lockout of the one door into the hall, reachable without a password.
 * The limiter's own note explains why a refused attempt records nothing — the
 * same lockout, arrived at from the other side.
 */

import { MAX_EMAIL_LENGTH, normaliseAddress } from '../../../../auth/address';
import { clientAddress } from '../../../../auth/client-address';
import { requestReset, type ResetDelivery } from '../../../../auth/invitation';
import { getRateLimiter } from '../../../../auth/rate-limit';
import { getConfig } from '../../../../config/index';
import { deliverByPort, type Deliver } from '../../../../mail/transactional';
import { log } from '../../../../ops/logger';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const TOO_MANY_ATTEMPTS = JSON.stringify({ error: 'too_many_attempts' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });

/**
 * Send the message the request left behind, after the answer has gone.
 *
 * Nothing is awaited by the caller, so **nothing here may go unremarked**. Two
 * different silences are possible and both are answered.
 *
 * A rejection would be an unhandled rejection, which takes a Node process down:
 * crashing the server because one mailbox was full would turn a refused message
 * into an outage. That is the `catch`.
 *
 * An `unavailable` outcome is worse, because it *resolves*. No credential means
 * `deliverTransactional` answers before it writes anything, so there is no
 * `mail_log` row, no audit row (a self-service reset is deliberately unaudited,
 * `ADMIN-DEC-03`) and no message — and the person was told a link is on its way.
 * A public surface that silently does nothing is the failure this branch exists
 * to make visible, and it is its own event because an operator alerting on a
 * refused message and one alerting on an inert surface are answering different
 * questions. Neither line carries an address (`DATA-R02`).
 */
function deliverAfterAnswer(delivery: ResetDelivery, deliver: Deliver): void {
  void delivery
    .send(deliver)
    .then((outcome) => {
      if (outcome?.state === 'unavailable') {
        log.error('mail.unavailable', 'a reset was asked for and no message could be sent', {});
      }
    })
    .catch(() => {
      log.error('mail.transactional_failed', 'a reset message could not be attempted', {});
    });
}

/**
 * The handler, with delivery as a parameter so a test can hold a send open and
 * watch the answer go out without it — which is the property this surface is
 * built around and the one nothing else can observe. Nothing in the
 * application passes it.
 */
export async function handleForgot(
  request: Request,
  deliver: Deliver = deliverByPort,
): Promise<Response> {
  // The same first lock the sign-in door takes: a route handler gets no
  // automatic origin check, and `Request.json()` parses the `text/plain` body a
  // cross-site form can post with no preflight. Refusing a foreign `Origin`
  // keeps another page from spending somebody's reset allowance for them.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response(CROSS_ORIGIN, { status: 403, headers: JSON_HEADERS });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(INVALID_REQUEST, { status: 400, headers: JSON_HEADERS });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return new Response(INVALID_REQUEST, { status: 400, headers: JSON_HEADERS });
  }

  const { email } = body as { email?: unknown };

  if (typeof email !== 'string') {
    return new Response(INVALID_REQUEST, { status: 400, headers: JSON_HEADERS });
  }

  // Normalised by the one function every surface that takes an address calls, so
  // a case or whitespace difference cannot mint a second counter over one
  // account. An over-long value is refused for its length alone — which the
  // sender already knows and which distinguishes no account — before it becomes
  // a key held for a window.
  const address = normaliseAddress(email);

  if (address.length === 0 || address.length > MAX_EMAIL_LENGTH) {
    return new Response(INVALID_REQUEST, { status: 400, headers: JSON_HEADERS });
  }

  const limiter = getRateLimiter();
  const perAccount = limiter.hit(`reset-account:${address}`);
  const perAddress = limiter.hit(`reset-address:${clientAddress(request)}`);

  // Both counted before either is read, so an attempt refused by one still costs
  // the sender their allowance on the other, and the longer of the two waits is
  // the honest one to advertise. The refusal describes the request rather than
  // any account: it is the same answer for an address nothing holds.
  if (perAccount.limited || perAddress.limited) {
    const retryAfter = Math.max(perAccount.retryAfterSeconds, perAddress.retryAfterSeconds);

    return new Response(TOO_MANY_ATTEMPTS, {
      status: 429,
      headers: { ...JSON_HEADERS, 'Retry-After': String(retryAfter) },
    });
  }

  const delivery = await requestReset(address);

  // Started, never awaited — see the header. Moving this below the `return`
  // would not work and awaiting it would defeat the whole surface, so the two
  // lines stay adjacent and in this order.
  deliverAfterAnswer(delivery, deliver);

  return new Response(null, { status: 204 });
}
