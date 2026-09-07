import { performance } from 'node:perf_hooks';

import { beforeAll, describe, expect, it } from 'vitest';

import { ARGON2_PARAMETERS, DUMMY_HASH, hashPassword, needsRehash, verifyPassword } from './password';

// Argon2id costs tens of milliseconds by design — that is the property being
// bought — so this file hashes twice and reads every other case off a stored
// encoding the same library produced.
const PASSWORD = 'a passphrase an investor would actually use';
const WRONG = 'a passphrase an investor would actually usf';

/** The head every hash written at the current configuration carries. */
const CURRENT_HEAD = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/;

/**
 * Real `@node-rs/argon2` encodings of the password `pw`. They are test vectors
 * rather than credentials: no account holds them and nothing reads them but this
 * file.
 *
 * Each entry below differs from the current configuration in one parameter and
 * one only, so every comparison in `needsRehash` has a case that fails when that
 * comparison alone is removed.
 */
const AT_THE_OLD_COST = '$argon2id$v=19$m=4096,t=1,p=1$sHDB+ifshnWpqmn00pu+tA$lvLBPUlBwJeUI5V5nEPQC3cGDr4FXtxj0UAPsFpwywM';
const VECTOR_PASSWORD = 'pw';
const BELOW_THE_CURRENT_COST: Readonly<Record<string, string>> = {
  'less memory': '$argon2id$v=19$m=4096,t=2,p=1$DfKX+OVI7IVjlGyEbzayVA$ekkQxHbNd86raIw03WtMdODYiN0qNkqk/JRfpss6Od0',
  'fewer passes': '$argon2id$v=19$m=19456,t=1,p=1$Cr36bpUK0CqHKHuUqtB2vQ$mM6fuA23d3bTUgP+gxpLIchaHF0zqxVrzBpRbgKP7Aw',
  'another lane count': '$argon2id$v=19$m=19456,t=2,p=2$RIS8yBt7wBSFr/ER7ag1RA$wnmBwisMydycQ4KqCtrkPRgFRpdAtpiA9g1pQnwKNKI',
  'an older Argon2 version': '$argon2id$v=16$m=19456,t=2,p=1$Q+bN4mcE77Ii5bKP62cu2A$LcFqAegcBlKy872CH/sL/CUalDE0mWraPMVEziCtif4',
  'another variant': '$argon2i$v=19$m=19456,t=2,p=1$CffTUrPFczPaGgkqgg2XIg$0soSYzMplvMV85YJPn/omv6rdS+JFVO3I07+aiSVB/4',
};
const ABOVE_THE_CURRENT_COST =
  '$argon2id$v=19$m=65536,t=3,p=1$WBEtadgO/EusiqKzIst0mw$t7A9ZhRROLEMzXJ2Fumzn3ovmxh0bhCdwqYPMzf2pQs';

/**
 * What a `password_hash` column holds when something went wrong upstream: no
 * parameters to read, so neither function can say anything about it.
 */
const UNREADABLE = ['', ' ', 'not-a-hash', '$argon2id$', '$argon2id$v=19$m=19456,t=2$no-lane-count'];

/** A hash whose head is intact and whose body was cut short. */
const TRUNCATED = DUMMY_HASH.slice(0, 40);

let encoded = '';
let hashedAgain = '';

beforeAll(async () => {
  encoded = await hashPassword(PASSWORD);
  hashedAgain = await hashPassword(PASSWORD);
});

describe('hashPassword', () => {
  it('writes the configured cost into the encoding, where a verifier can read it back', () => {
    expect(encoded).toMatch(CURRENT_HEAD);

    // The literals are the configuration `AUTH-001` fixes — 19 MiB, two
    // iterations, one lane. Deriving them from the constant would let the
    // constant move without anything noticing, which is the whole failure this
    // known answer exists to catch.
    expect(ARGON2_PARAMETERS.memoryCost).toBe(19456);
    expect(ARGON2_PARAMETERS.timeCost).toBe(2);
    expect(ARGON2_PARAMETERS.parallelism).toBe(1);
  });

  it('salts each hash, so one password does not have one hash', () => {
    expect(hashedAgain).not.toBe(encoded);
    expect(hashedAgain).toMatch(CURRENT_HEAD);
  });
});

describe('verifyPassword', () => {
  it('accepts the password it hashed and refuses one character off it', async () => {
    expect(await verifyPassword(encoded, PASSWORD)).toBe(true);
    expect(await verifyPassword(encoded, WRONG)).toBe(false);
  });

  it('reads the cost the stored hash records, not the cost configured today', async () => {
    // This is what makes raising the cost safe: an account hashed at the older
    // parameters still signs in, and is rehashed on the way through.
    expect(await verifyPassword(AT_THE_OLD_COST, VECTOR_PASSWORD)).toBe(true);
    expect(needsRehash(AT_THE_OLD_COST)).toBe(true);
  });

  it.each(UNREADABLE)('answers false rather than throwing for the stored hash %j', async (stored) => {
    expect(await verifyPassword(stored, PASSWORD)).toBe(false);
  });

  it('answers false for a stored hash whose body was cut short', async () => {
    expect(await verifyPassword(TRUNCATED, PASSWORD)).toBe(false);
  });
});

describe('needsRehash', () => {
  it('leaves a hash at the current configuration alone', () => {
    expect(needsRehash(encoded)).toBe(false);
  });

  it('leaves a hash that is stronger on every axis alone', () => {
    expect(needsRehash(ABOVE_THE_CURRENT_COST)).toBe(false);
  });

  for (const [difference, stored] of Object.entries(BELOW_THE_CURRENT_COST)) {
    it(`asks for a rehash of a stored hash written with ${difference}`, () => {
      expect(needsRehash(stored)).toBe(true);
    });
  }

  it.each(UNREADABLE)('asks for a rehash of the unreadable stored hash %j', (stored) => {
    expect(needsRehash(stored)).toBe(true);
  });
});

describe('DUMMY_HASH', () => {
  it('is a real hash at the current configuration, so verifying against it costs what a real one costs', () => {
    expect(DUMMY_HASH).toMatch(CURRENT_HEAD);
    expect(needsRehash(DUMMY_HASH)).toBe(false);
  });

  it.each(['password', PASSWORD])('refuses %j, as it refuses everything', async (attempt) => {
    expect(await verifyPassword(DUMMY_HASH, attempt)).toBe(false);
  });
});

describe('verifyPassword against a missing or unreadable stored hash', () => {
  it('returns false for a null hash — an invited account carries none until AUTH-003 writes one', async () => {
    expect(await verifyPassword(null, PASSWORD)).toBe(false);
  });

  it.each(['', 'not-a-hash', '$argon2id$broken'])(
    'returns false for the unreadable stored string %j rather than crashing',
    async (stored) => {
      expect(await verifyPassword(stored, PASSWORD)).toBe(false);
    },
  );

  it('pays the argon2 cost on the null path, so an unknown or un-onboarded account is not a timing oracle (SEC-R03)', async () => {
    // The verify must do a real hash's work even when there is nothing to verify
    // against, or the response time tells an attacker the account does not
    // exist. Argon2id at these parameters takes tens of milliseconds; the
    // short-circuit this replaces returned in under one. A generous floor
    // separates the two without depending on the exact machine, and argon2
    // cannot beat it -- load only makes it slower.
    const start = performance.now();
    await verifyPassword(null, PASSWORD);
    expect(performance.now() - start).toBeGreaterThan(3);
  });
});
