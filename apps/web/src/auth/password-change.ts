/**
 * The password a signed-in reader changes for themselves
 * ([`ADMIN-DEC-06`](../../docs/decisions-log.md#ADMIN-DEC-06)).
 *
 * It is here rather than in `password.ts` because that module is the hashing
 * library's one caller and holds no database handle, and rather than in the
 * handler because the check and the write have to be one act. What the handler
 * owns is the request: the origin, the session, the shape of the body, the
 * limit, and the policy the new password must pass.
 *
 * **The current password is required, and it is the whole of the step-up.** A
 * session that can set the password it was opened with is a session that
 * outlives every remedy: ending it changes nothing, because whoever holds it has
 * already made themselves the credential. Demanding the password turns a stolen
 * cookie back into what it should be — access that expires and can be revoked —
 * because the one thing a cookie thief does not have is the password behind it.
 *
 * **The verification and the write are one statement's predicate.** The hash is
 * read, verified, and then named in the `UPDATE`'s `WHERE`, so the row is moved
 * only if it still holds what was verified. A read followed by an unconditional
 * write would let two changes racing each verify the same old password and both
 * commit, leaving the person's account on whichever landed second and the other
 * change silently lost; here the second matches nothing and is answered as a
 * current password that is no longer current, which is what it is. It is the
 * same discipline the account acts take, for the same reason: a check split from
 * the write it authorises is not a check.
 *
 * **Every session the account holds is deleted, including the one that asked.**
 * `AUTH-002` settles this rather than this module choosing it — a password change
 * is a privilege change, and "the change is not complete until they are". The
 * case it is for is the one the whole control is for: somebody who thinks their
 * password is known changes it, and a change that left the other sessions
 * standing would leave the person it was taken from signed in. The caller issues
 * a fresh session afterwards, so the reader who made the change stays signed in
 * on the device they made it from and every other device is turned out.
 *
 * **The trail records the invalidation and not the password.** `AUDIT_ACTIONS`
 * is closed and enforced by the `audit` table's own `CHECK`, so there is no act
 * for a password change and minting one is a migration (`DATA-R07`, §14). What
 * is written is `session.invalidate_all`, which is the act the sign-out-everywhere
 * control writes for the same effect on the same table — a true statement about
 * what happened rather than a near one, and the alternative is a bulk
 * invalidation that leaves no row at all while the button beside it leaves one.
 * The row is written in the transaction that deletes, so neither can happen
 * without the other (`SEC-R04`).
 */

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';

import { hashPassword, verifyPassword } from './password';
import { invalidateAllForAccountIn } from './session';

/**
 * What came of a change. `refused` covers a current password that does not
 * match, an account holding no password at all, and a row that moved between the
 * verification and the write — one answer, because all three mean the same thing
 * to the person typing: what you gave is not the password this account holds
 * now.
 */
export type PasswordChangeOutcome = 'changed' | 'refused';

/**
 * Replace the password of `accountId`, given the one it currently holds.
 *
 * The caller has already established that `accountId` is the reader's own
 * account and that `newPassword` satisfies the policy; neither is re-derived
 * here. What this owns is that the old password is really the old password, that
 * the new one replaces it atomically with the end of every session, and that the
 * trail holds the invalidation.
 */
export async function changeOwnPassword(
  accountId: string,
  currentPassword: string,
  newPassword: string,
): Promise<PasswordChangeOutcome> {
  const held = await getDb()
    .selectFrom('accounts')
    .select('password_hash')
    .where('id', '=', accountId)
    .executeTakeFirst();

  const stored = held?.password_hash ?? null;
  const verified = await verifyPassword(stored, currentPassword);

  // `stored === null` is stated rather than left to the dummy hash, as sign-in
  // states it: an account holding no password has none to confirm, whatever a
  // verification against something else returned.
  if (stored === null || !verified) {
    return 'refused';
  }

  // Hashed before the transaction, never inside it: Argon2 is deliberately slow,
  // and a row held across it would serialise every concurrent change.
  const nextHash = await hashPassword(newPassword);

  return getDb()
    .transaction()
    .execute(async (trx) => {
      const moved = await trx
        .updateTable('accounts')
        .set({ password_hash: nextHash })
        .where('id', '=', accountId)
        .where('password_hash', '=', stored)
        .returning('id')
        .executeTakeFirst();

      if (moved === undefined) {
        return 'refused';
      }

      await invalidateAllForAccountIn(trx, accountId);
      await recordAudit(trx, {
        actorId: accountId,
        action: 'session.invalidate_all',
        subjectType: 'account',
        subjectId: accountId,
      });

      return 'changed';
    });
}
