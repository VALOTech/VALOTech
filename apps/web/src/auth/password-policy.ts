/**
 * The password policy `AUTH-003` states, and no more: a length floor, a length
 * ceiling, and a refusal of the passwords everyone chooses.
 *
 * No composition rules. "One upper, one digit, one symbol" produces `Password1!`
 * and a sticky note — it trades real entropy for the appearance of it, and the
 * design rejects it deliberately. The floor does most of the work: twelve
 * characters turns away the famous weak passwords on length alone. The common
 * list (`common-passwords.ts`) is the backstop for the ones that clear the
 * floor, which a length rule cannot see are still guessed first.
 *
 * The ceiling is not a security limit — Argon2 absorbs any length into a fixed
 * state before the memory-hard passes, so a long password costs nothing
 * measurable — but a bound on what one request carries, set at the same value as
 * `AUTH-001`'s own input bound so one path cannot accept a password the other
 * could never be used to sign in with.
 */

import { COMMON_PASSWORDS } from './common-passwords';

/** Twelve characters, the floor that does most of the work. */
export const MIN_PASSWORD_LENGTH = 12;

/** Not a security ceiling; a bound on request size, matching `AUTH-001`'s input bound. */
export const MAX_PASSWORD_LENGTH = 200;

/** Which rule a password failed, or `null` when it meets the policy. */
export type PasswordProblem = 'too-short' | 'too-long' | 'too-common';

/**
 * The one rule a password breaks, in the order a person would want to hear them:
 * fix the length before being told the result is also common. `null` is the
 * password the policy accepts.
 */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'too-short';
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return 'too-long';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'too-common';
  }
  return null;
}
