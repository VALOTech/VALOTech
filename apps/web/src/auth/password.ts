/**
 * Password hashing — the one implementation sign-in (`AUTH-001`) and invitation
 * (`AUTH-003`) both call, so a change to the cost reaches both paths or neither.
 *
 * Argon2id at the OWASP Password Storage Cheat Sheet's first recommended
 * configuration: 19 MiB of memory, two iterations, one lane. The parameters
 * travel inside the encoded hash — `$argon2id$v=19$m=19456,t=2,p=1$…` — which is
 * what lets the cost be raised without locking anyone out. A stored hash is
 * verified against the parameters it records rather than against the current
 * ones, and `needsRehash` is how a sign-in learns to write it back at the new
 * cost while it holds the plaintext.
 *
 * Nothing else in the application calls the hashing library, which is what makes
 * "one implementation" a property of the tree rather than a convention.
 */

import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * `Algorithm.Argon2id`. The library declares `Algorithm` as an ambient const
 * enum, which `isolatedModules` refuses to read, so the member's value is
 * written out and the annotation holds it to the enum. What holds it to the
 * right member is the known-answer test: any other value produces an encoding
 * that does not begin `$argon2id$`.
 */
const ARGON2ID_ALGORITHM: NonNullable<Options['algorithm']> = 2;

/**
 * `Version.V0x13`, written out as its value like the algorithm above. It is
 * pinned rather than left to the library's default so a dependency major that
 * moved that default could not make every freshly written hash report
 * `needsRehash` forever; the value 1 is what the encoding carries as `v=19`.
 */
const ARGON2ID_VERSION: NonNullable<Options['version']> = 1;

/**
 * The cost, in one place. `memoryCost` is in KiB, which is the unit the library
 * takes and the unit the `m=` field of the encoding carries.
 */
export const ARGON2_PARAMETERS = {
  algorithm: ARGON2ID_ALGORITHM,
  version: ARGON2ID_VERSION,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const satisfies Options;

/** The variant and version every hash this module writes must carry. */
const ARGON2ID = 'argon2id';
const ARGON2_VERSION = 19;

/**
 * The head of a PHC-encoded Argon2 hash: the variant, the version, and the three
 * cost parameters in the order the encoding fixes. A string that does not match
 * carries no parameters to compare and is answered as though it were below the
 * current cost, which is the safe direction.
 */
const ENCODED_HEAD = /^\$(argon2(?:id|i|d))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$/;

/**
 * A hash of a random string that was generated once and discarded. Sign-in
 * verifies against it when no account holds the submitted address, so an
 * unknown address costs the same milliseconds as a wrong password and the
 * response time is not a membership oracle (`SEC-R03`).
 *
 * It is not a credential and does not fall under `SEC-R05`: no account holds
 * it, and nothing in this repository knows a password that verifies against it.
 */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Bjwjg1RBWi4gXyVcpOSKOw$+fZTPFBa38Ov6BeULXInQiXIP0QiZJ8aHA6cnqvJWKI';

/** Hash a password for storage. Each call salts independently. */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_PARAMETERS);
}

/**
 * Whether `plain` is the password behind `encoded`.
 *
 * `encoded` is nullable because an `invited` account carries no `password_hash`
 * until `AUTH-003` writes one, and a stored string can be one the library
 * cannot read. Both are verified against `DUMMY_HASH` instead — the same
 * argon2 cost as a real hash that does not match — so an unknown address, an
 * account not yet onboarded, and a wrong password are one answer and one
 * duration, never three. Measured, the fast path this replaces was three
 * orders of magnitude cheaper, which is a membership-and-state oracle
 * (`SEC-R03`) by the clock alone. The normalisation is here, not at the call
 * site, so the caller passes the nullable hash straight through and has no
 * place left to reintroduce the oracle.
 */
export async function verifyPassword(encoded: string | null, plain: string): Promise<boolean> {
  const toVerify = encoded !== null && ENCODED_HEAD.test(encoded) ? encoded : DUMMY_HASH;
  try {
    return await verify(toVerify, plain);
  } catch {
    return false;
  }
}

/**
 * Whether a stored hash was written below the current configuration, and should
 * be replaced while the sign-in that read it still holds the plaintext.
 *
 * Memory and iterations compare as "at least", so raising the cost rehashes
 * every account on its next sign-in while lowering it leaves the stronger hashes
 * alone. The variant, the version and the lane count compare as equality: the
 * three are chosen as one configuration and a lone deviation is not a point on
 * the same scale. An encoding whose parameters cannot be read is not at the
 * current configuration either.
 *
 * It reads the parameters and nothing else. Sign-in asks it only of a hash that
 * has just verified, so whether the rest of the encoding is intact is
 * `verifyPassword`'s question and has been answered by the time this is called.
 */
export function needsRehash(encoded: string): boolean {
  const head = ENCODED_HEAD.exec(encoded);

  if (head === null) {
    return true;
  }

  // The defaults are unreachable — the pattern matched, so all five groups are
  // present — and are how `noUncheckedIndexedAccess` is satisfied here without
  // an assertion that would outlive the guarantee it stands on.
  const [, variant = '', version = '', memoryCost = '', timeCost = '', parallelism = ''] = head;

  return (
    variant !== ARGON2ID ||
    Number(version) !== ARGON2_VERSION ||
    Number(memoryCost) < ARGON2_PARAMETERS.memoryCost ||
    Number(timeCost) < ARGON2_PARAMETERS.timeCost ||
    Number(parallelism) !== ARGON2_PARAMETERS.parallelism
  );
}
