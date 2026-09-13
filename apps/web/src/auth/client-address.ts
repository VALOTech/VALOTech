/**
 * The address a request came from, as a rate-limit key (`AUTH-001`, `SEC-001`).
 *
 * The header is only as trustworthy as the proxy that sets it: a client that
 * reaches the application directly can write whatever it likes, and one that
 * rotates the value gets a fresh counter each time. That is why every surface
 * that limits by address also limits by account — an attacker walking the
 * account list is stopped by the second counter whatever they claim about the
 * first — and why the edge limits by the address it observed rather than the one
 * it was told (`OPS-001`).
 *
 * One module rather than a copy per route, because both numbers here are
 * security bounds rather than conveniences: the fallback bucket decides what an
 * attacker gains by dropping the header, and the length cap decides how much an
 * anonymous caller can make this process allocate. Two copies would be two
 * chances for one of them to be widened alone.
 */

/**
 * The key for a request with no usable forwarded address. Behind the edge
 * (`OPS-001`) every request carries one, so this bucket is essentially
 * unreachable there; when it is reached it holds every header-withholding caller
 * on one counter — fail-safe against an attacker who drops the header to slip a
 * per-address limit, and a shared lockout for everyone only if the edge ever
 * stops setting it.
 */
const UNKNOWN_ADDRESS = 'unknown';

/**
 * An IPv6 address with a zone index is at most 45 characters. A first hop longer
 * than that is not an address, and it is a rate-limit key held for a window — the
 * same unbounded allocation the e-mail bound closes, on the one field an
 * anonymous caller writes with no bound of its own (`OPS-DEC-02`).
 */
const MAX_ADDRESS_LENGTH = 45;

/** The first hop of `X-Forwarded-For`, or the shared bucket when there is none. */
export function clientAddress(request: Request): string {
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
