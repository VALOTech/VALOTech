/**
 * The one spelling of an e-mail address, and the one bound on its length.
 *
 * Every surface that takes an address from outside normalises it here, because
 * `accounts.email` is `citext` — case-insensitive and whitespace-*sensitive*.
 * A column that folds case and keeps a trailing newline means two spellings of
 * one address are one row for the reader and two rows for the writer: an
 * invitation for `" Zz@x.test\n"` misses the unique index that `zz@x.test`
 * already occupies, and the second account is created rather than refused. One
 * function, called at every boundary, is what makes "one address, one account"
 * a property rather than a convention.
 *
 * Lower-casing is redundant against `citext` and is kept because the normalised
 * value is also a rate-limit key (`AUTH-001`), and a key that varies by case is
 * a limit an attacker steps around by shifting a character.
 */

/**
 * RFC 5321's maximum for a forward path, less the angle brackets.
 *
 * Both surfaces that take an address are anonymous, and both do work sized by
 * it: sign-in holds the value as a rate-limit key for a window, and a reset
 * hashes it into an advisory lock and sends it as three query parameters. An
 * unbounded string is an allocation whose size the caller chooses, so the bound
 * is applied before either does anything with the value.
 */
export const MAX_EMAIL_LENGTH = 254;

/** The address as it is compared, keyed and stored: trimmed, lower-cased. */
export function normaliseAddress(email: string): string {
  return email.trim().toLowerCase();
}
