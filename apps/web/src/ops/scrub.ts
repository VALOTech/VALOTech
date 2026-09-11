/**
 * Masking an address or a long opaque token out of a string before it is kept or
 * shown (`DATA-R02`).
 *
 * Two sinks share it. The logger runs every line through it on the way to stdout,
 * where the structural guard — `fields` being primitives — keeps a whole object
 * out and this catches the address a caller built into a message string by hand.
 * The mail send runs a port's refusal through it before that reply reaches
 * `mail_log.error`, a column kept two years and shown on the admin log: a real
 * SMTP rejection echoes the recipient's address, and a TLS or auth failure can
 * echo the `SMTP_URL` credential, and neither may become a stored personal datum.
 *
 * An address is masked by its shape. So is a run of forty or more base64url
 * characters — a 32-byte token is forty-three of them and a SHA-256 hash is
 * sixty-four, while a UUID id is thirty-six and stays readable, because an id is
 * what ties a record to an act and is not the secret a token is.
 */
const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_SECRET = /[A-Za-z0-9_-]{40,}/g;
const REDACTED = '[redacted]';

export function scrub(value: string): string {
  return value.replace(ADDRESS, REDACTED).replace(LONG_SECRET, REDACTED);
}
