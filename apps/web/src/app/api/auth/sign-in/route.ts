/**
 * `POST /api/auth/sign-in` — the one door into the investor room (`AUTH-001`).
 *
 * Three states fail identically: an address no account holds, a wrong password,
 * and an account that is not active. One status, one body, and one cost in
 * milliseconds, because a difference in any of the three is a membership or
 * state oracle (`SEC-R03`). The cost is equal by construction rather than by
 * care: the account is read, the password is verified against a fixed dummy
 * hash when there is nothing to verify against, and only then is the outcome
 * decided — so there is no branch that can return before paying for the hash.
 *
 * Both rate-limit counters are hit before the account is read, on every
 * attempt, so a refusal costs an attacker what a success costs and a correct
 * password does not reset the count.
 *
 * Deferred: OPS-002/T1 — a failed attempt logs its outcome and, where the
 * account is known, its id, never the address and never the password
 * (`DATA-R02`). It waits on the one JSON logger, because the alternative is a
 * `console.log` that `OPS-002` exists to remove. Until then nothing is written,
 * so no address can reach a log — correct, not a stub.
 */

import { hashPassword, needsRehash, verifyPassword } from '../../../../auth/password';
import { getRateLimiter } from '../../../../auth/rate-limit';
import { issue, serializeCookie } from '../../../../auth/session';
import { getConfig } from '../../../../config/index';
import { getDb } from '../../../../db/index';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

/**
 * The three bodies this route returns.
 *
 * `invalid` is the single failure `AUTH-001` fixes, and it is one constant so
 * the three states that produce it cannot drift apart. The other two describe
 * the request rather than the credentials — a malformed body and an exhausted
 * limit are visible to the sender either way, and telling them apart is what
 * lets the form say something true rather than blaming the password.
 */
const INVALID_REQUEST = JSON.stringify({ error: 'invalid_request' });
const INVALID = JSON.stringify({ error: 'invalid' });
const TOO_MANY_ATTEMPTS = JSON.stringify({ error: 'too_many_attempts' });
const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });

/**
 * RFC 5321's maximum for a forward path, less the angle brackets. The bound is
 * here rather than left open because the address becomes a rate-limit key held
 * in memory for a window, and an unbounded key is an unbounded allocation an
 * anonymous caller chooses the size of.
 *
 * The password carries no matching bound. Argon2 absorbs it into a fixed state
 * before the memory-hard passes, so length costs nothing measurable, and a
 * ceiling here that `AUTH-003` did not also apply would let an invitation set a
 * password that could never be used to sign in.
 */
const MAX_EMAIL_LENGTH = 254;

/**
 * The rate-limit key for a request with no usable forwarded address. Behind
 * the edge (`OPS-001`) every request carries one, so this bucket is
 * essentially unreachable there; when it is reached it holds every
 * header-withholding caller on one counter -- fail-safe against an attacker
 * who drops the header to slip a per-address limit, and a shared lockout for
 * everyone only if the edge ever stops setting it.
 */
const UNKNOWN_ADDRESS = 'unknown';

/**
 * An IPv6 address with a zone index is at most 45 characters. A first hop
 * longer than that is not an address, and it is a rate-limit key held for a
 * window -- the same unbounded allocation the e-mail bound closes, on the one
 * field an anonymous caller writes with no bound of its own (`OPS-DEC-02`).
 */
const MAX_ADDRESS_LENGTH = 45;

interface Credentials {
  /** Trimmed and lower-cased, which is both the lookup value and the key. */
  readonly email: string;
  readonly password: string;
}

/**
 * The credentials a well-formed body carries, or `null` when it carries none.
 *
 * The address is normalised once and used for both the query and the counter.
 * `accounts.email` is `citext`, so the database already ignores case; doing it
 * here as well is what keeps `A@x.test` and `a@x.test` — and the same address
 * with a space in front — counting against one key rather than minting a new
 * one per spelling, which would be a limit an attacker steps around by
 * shifting a character.
 */
async function readCredentials(request: Request): Promise<Credentials | null> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    // The parse error is answered rather than discarded: its only content is
    // where in the caller's own body the syntax broke, which the 400 below
    // stands for and which must not be echoed back into a response.
    return null;
  }

  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const { email, password } = body as Record<string, unknown>;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return null;
  }

  const normalised = email.trim().toLowerCase();

  if (normalised.length === 0 || normalised.length > MAX_EMAIL_LENGTH) {
    return null;
  }

  return { email: normalised, password };
}

/**
 * The address the request came from, as the first hop of `X-Forwarded-For`.
 *
 * The header is only as trustworthy as the proxy that sets it: a client that
 * reaches the application directly can write whatever it likes, and one that
 * rotates the value gets a fresh counter each time. That is why the account
 * counter exists and is not optional — it keeps an attacker from walking the
 * account list whatever they claim about their address — and why the edge
 * limits by the address it observed rather than the one it was told
 * (`OPS-001`).
 */
function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');

  if (forwarded === null) {
    return UNKNOWN_ADDRESS;
  }

  const [first = ''] = forwarded.split(',');
  const address = first.trim();

  if (address === '' || address.length > MAX_ADDRESS_LENGTH) {
    return UNKNOWN_ADDRESS;
  }

  return address;
}

export async function POST(request: Request): Promise<Response> {
  // A route handler, unlike a Server Action, gets no automatic origin check,
  // and `Request.json()` parses the `text/plain` body a cross-site form can
  // post with no CORS preflight. An `Origin` that is present and not ours is a
  // cross-site page driving the door -- refuse it before anything else, so an
  // attacker cannot sign a victim's browser into an account they did not
  // choose (login CSRF). A same-origin form and the application's own fetch
  // both send our origin; a non-browser client sends none and is unaffected.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response(CROSS_ORIGIN, { status: 403, headers: JSON_HEADERS });
  }

  const credentials = await readCredentials(request);

  // A body that is not two strings is answered before the limiter, and says so
  // plainly: it is a statement about the request's shape, and it distinguishes
  // nothing about any account. The costly paths below are the ones an attacker
  // would want, and none of them is reachable from here.
  if (credentials === null) {
    return new Response(INVALID_REQUEST, { status: 400, headers: JSON_HEADERS });
  }

  const limiter = getRateLimiter();
  const perAccount = limiter.hit(`account:${credentials.email}`);
  const perAddress = limiter.hit(`address:${clientAddress(request)}`);

  // Both are counted before either is read, so an attempt refused by one
  // counter still costs the attacker their allowance on the other. The longer
  // of the two waits is the honest one to advertise: the shorter would send a
  // client back before anything had cleared.
  if (perAccount.limited || perAddress.limited) {
    const retryAfter = Math.max(perAccount.retryAfterSeconds, perAddress.retryAfterSeconds);

    return new Response(TOO_MANY_ATTEMPTS, {
      status: 429,
      headers: { ...JSON_HEADERS, 'Retry-After': String(retryAfter) },
    });
  }

  const account = await getDb()
    .selectFrom('accounts')
    .select(['id', 'password_hash', 'state'])
    .where('email', '=', credentials.email)
    .executeTakeFirst();

  const stored = account?.password_hash ?? null;
  const verified = await verifyPassword(stored, credentials.password);

  // `stored === null` is checked rather than left to the dummy hash. An account
  // holding no password cannot be signed into whatever a verification against
  // something else returned, and stating it here means the guarantee does not
  // rest on nobody ever learning the dummy's plaintext.
  if (account === undefined || stored === null || account.state !== 'active' || !verified) {
    return new Response(INVALID, { status: 401, headers: JSON_HEADERS });
  }

  // The one moment the plaintext is in hand and the stored hash is known to be
  // below the current cost. A failure here fails the sign-in rather than being
  // swallowed: the alternative is an account that silently never rehashes.
  if (needsRehash(stored)) {
    await getDb()
      .updateTable('accounts')
      .set({ password_hash: await hashPassword(credentials.password) })
      .where('id', '=', account.id)
      .execute();
  }

  const cookie = await issue(account.id);

  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': serializeCookie(cookie) },
  });
}
