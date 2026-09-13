/**
 * The one spelling of an e-mail address, the one bound on its length, the one
 * test of whether it could be an address at all, and the one lock that orders
 * everything writing it.
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

import { sql, type Transaction } from 'kysely';

import type { Database } from '../db/types';

/**
 * RFC 5321's maximum for a forward path, less the angle brackets.
 *
 * Both anonymous surfaces that take an address do work sized by it: sign-in
 * holds the value as a rate-limit key for a window, and a reset hashes it into
 * an advisory lock and sends it as three query parameters. An unbounded string
 * is an allocation whose size the caller chooses, so the bound is applied before
 * either does anything with the value. The admin surfaces apply it for a
 * different reason and to the same effect: an address longer than this is one no
 * account could ever sign in with, so writing it would create access nobody can
 * use.
 */
export const MAX_EMAIL_LENGTH = 254;

/** The address as it is compared, keyed and stored: trimmed, lower-cased. */
export function normaliseAddress(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether a normalised address could be one at all: present, within the bound,
 * and carrying the separator.
 *
 * Deliberately shallow. The addresses this system writes are typed by an admin
 * for a person they are about to mail, and the only thing worth refusing at the
 * boundary is a value that cannot be an address in any reading — an empty
 * string, one longer than any mail system accepts, or one with no `@` in it.
 * A stricter pattern would refuse real addresses (RFC 5321 admits quoted local
 * parts and address literals) in exchange for catching typos it cannot see
 * anyway, and the typo is what the correction surface exists for.
 *
 * It takes the address already normalised, because the bound and the emptiness
 * test are about what will be stored rather than what was typed: `"  "` is
 * empty and `" a@b "` is not.
 */
export function isAddressShaped(address: string): boolean {
  return address.length > 0 && address.length <= MAX_EMAIL_LENGTH && address.includes('@');
}

/**
 * Serialise everything that writes or issues against one address, on a lock the
 * address alone decides.
 *
 * A row lock cannot do this job. `SELECT … FOR UPDATE` on the account takes a
 * lock when a row is there and takes none when it is not, so concurrent
 * requests for an address an account holds queue behind each other while
 * requests for an address it does not hold run straight through — and the gap
 * widens with every extra client, which is a membership oracle that grows
 * louder the harder it is asked. An advisory lock is taken on the address
 * itself, so both answers cost the same wait under any amount of concurrency.
 *
 * It is also what lets a writer decide from a read. Creating an account and
 * correcting one both have to answer *does another account already hold this
 * address*, and a lookup outside the lock is a decision two transactions can
 * both take before either commits — one of them then meeting the unique index
 * and raising, where the honest answer was that the address is taken. Every
 * statement that writes `accounts.email` holds this lock on the address it is
 * writing, so a read taken under it is the answer.
 *
 * `hashtext` folds the address into the lock's integer key. Two addresses can
 * collide there and serialise together, which costs a little contention and
 * nothing else — the lock orders writers, it does not decide anything. It is
 * held to the end of the transaction and released with it, so no path can
 * forget to give it back.
 */
export async function lockAddress(trx: Transaction<Database>, address: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${address}))`.execute(trx);
}
