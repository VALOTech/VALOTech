/**
 * `POST /api/auth/register` — the second door into the hall (`AUTH-005/T2`).
 *
 * **One answer, always.** An address an account already holds and one it does
 * not get the same status, the same empty body, and the same statements behind
 * them. A form that answered differently would be a test for whether a named
 * person is an investor in this company, which is precisely the fact this
 * system holds about people, offered to anybody who can type an address
 * (`SEC-R03`). What differs is the message, and a message is readable only by
 * whoever holds the mailbox.
 *
 * **The message is started and not awaited, and that is a security property.**
 * Handing a message to a mail server is a network round trip — hundreds of
 * milliseconds against the low milliseconds the statements cost — so a request
 * that waited for it would answer slowly for one address and quickly for the
 * other, and the form would become the account list with no code in it changed.
 * `registerAccount` hands back the message to send and this starts it after the
 * answer has been decided (`RegistrationDelivery`).
 *
 * **Its own rate-limit keys, not sign-in's and not the reset form's.** Sharing
 * them would let an anonymous caller spend a named person's sign-in allowance by
 * posting their address here, which is a lockout of the one door into the hall
 * reachable without a password.
 *
 * **Two conditions close the door, and both answer the same way.** The
 * deployment has not opened registration, or no message can be sent at all. The
 * second matters more than it looks: a registration whose link never leaves
 * would write a name and an address for an account nobody can ever reach, which
 * is personal data collected for a purpose that did not happen (`DATA-R01`). Both
 * are properties of the deployment rather than of the address in the box, so the
 * same answer reaches everybody, including people no account exists for.
 */

import { MAX_EMAIL_LENGTH, normaliseAddress } from '../../../../auth/address';
import { clientAddress } from '../../../../auth/client-address';
import { registerAccount, type RegistrationDelivery } from '../../../../auth/invitation';
import { getRateLimiter } from '../../../../auth/rate-limit';
import { getConfig } from '../../../../config/index';
import { resolveLocale, LOCALE_COOKIE, type Locale } from '../../../../i18n/locales';
import { sendingIsPossible, type MailAvailability } from '../../../../mail/availability';
import { deliverByPort, type Deliver } from '../../../../mail/transactional';
import { log } from '../../../../ops/logger';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const TOO_MANY_ATTEMPTS = JSON.stringify({ error: 'too_many_attempts' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const REGISTRATION_CLOSED = JSON.stringify({ error: 'registration_closed' });

/**
 * The longest name this writes into a row.
 *
 * `accounts.name` is unbounded `text`, which is right for a value an admin types
 * for somebody they are about to mail and wrong for the one field an anonymous
 * caller writes: an unbounded string is an allocation whose size the sender
 * chooses, and it is then carried into a composed message and into `mail_log`.
 * The bound is generous against real names in every script the hall serves and
 * refuses only a value that is not one.
 */
const MAX_NAME_LENGTH = 200;

/**
 * Send the message the request left behind, after the answer has gone.
 *
 * Nothing is awaited by the caller, so nothing here may go unremarked. A
 * rejection would be an unhandled rejection, which takes the process down —
 * crashing the server because one mailbox was full would turn a refused message
 * into an outage. An `unavailable` outcome is the worse case because it
 * resolves: the person was told to look in their inbox and nothing was handed to
 * a mail server. The door is shut when sending is impossible, so reaching this
 * branch means the credential went away between the two, which is its own event.
 * Neither line carries an address or a name (`DATA-R02`).
 */
function deliverAfterAnswer(delivery: RegistrationDelivery, deliver: Deliver): void {
  void delivery
    .send(deliver)
    .then((outcome) => {
      if (outcome?.state === 'unavailable') {
        log.error('mail.unavailable', 'a registration was made and no message could be sent', {});
      }
    })
    .catch(() => {
      log.error('mail.transactional_failed', 'a registration message could not be attempted', {});
    });
}

/**
 * The language the page they registered on was being served in, resolved the way
 * every rendered page resolves it. It is not asked for on the form — the form
 * asks a name and an address and nothing else — and it decides only which
 * catalogue the message is composed from.
 */
function localeOfRequest(request: Request): Locale {
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);

  return resolveLocale(cookie, request.headers.get('accept-language'));
}

/**
 * The handler, with delivery and the availability answer as parameters so a test
 * can hold a send open and watch the answer go out without it, and drive the
 * shut door without a deployment. Nothing in the application passes either.
 */
export async function handleRegister(
  request: Request,
  deliver: Deliver = deliverByPort,
  availabilityOf: () => Promise<MailAvailability> = sendingIsPossible,
): Promise<Response> {
  // The same first lock the other anonymous doors take: a route handler gets no
  // automatic origin check, and `Request.json()` parses the `text/plain` body a
  // cross-site form can post with no preflight.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response(CROSS_ORIGIN, { status: 403, headers: JSON_HEADERS });
  }

  // Before the body is read, so a shut door costs nothing and touches no
  // address. Both conditions answer identically and neither depends on what was
  // typed.
  if (!getConfig().auth.registrationOpen || !(await availabilityOf()).available) {
    return new Response(REGISTRATION_CLOSED, { status: 503, headers: JSON_HEADERS });
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

  const { name, email } = body as { name?: unknown; email?: unknown };

  if (typeof name !== 'string' || typeof email !== 'string') {
    return new Response(INVALID_REQUEST, { status: 400, headers: JSON_HEADERS });
  }

  const trimmed = name.trim();
  const address = normaliseAddress(email);

  // Every refusal here describes the request rather than any account: a name
  // that is empty or longer than a name, and an address that is empty or longer
  // than any mail system accepts. The sender already knows all four, and none of
  // them distinguishes an address an account holds from one it does not.
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_NAME_LENGTH ||
    address.length === 0 ||
    address.length > MAX_EMAIL_LENGTH
  ) {
    return new Response(INVALID_REQUEST, { status: 400, headers: JSON_HEADERS });
  }

  const limiter = getRateLimiter();
  const perAccount = limiter.hit(`register-account:${address}`);
  const perAddress = limiter.hit(`register-address:${clientAddress(request)}`);

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

  const delivery = await registerAccount({
    name: trimmed,
    email: address,
    locale: localeOfRequest(request),
  });

  // Started, never awaited — see the header. Awaiting it would defeat the whole
  // surface, so the two lines stay adjacent and in this order.
  deliverAfterAnswer(delivery, deliver);

  return new Response(null, { status: 204 });
}
