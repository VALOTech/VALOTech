/**
 * `POST /api/account/sessions/all` — ending every session this account holds,
 * including the one that asked (`AUTH-004`).
 *
 * It exists because the case it serves is the one that matters: somebody who
 * thinks their password is known ends everything and then changes it. Offering
 * only "sign out here" tells them the problem is solved when it is not.
 *
 * The cookie is resolved to an account rather than deleted by its hash, because
 * the delete is account-wide and an account id is what it needs. It is resolved
 * *without sliding* the session (`accountForToken`, not `resolveSession`): this
 * path is about to delete the session, and a delete that failed after a slide
 * would leave it live with a fresh full lifetime -- the opposite of what the
 * caller asked for. The resolution is also the authorisation: only a live
 * session for an active account yields one, so an expired cookie ends nothing
 * and a suspended account ends nothing — both fail closed, and both still
 * redirect, because a person who cannot prove a session has nothing here to end.
 *
 * Ending everything is a privileged act, so it is audited as
 * `session.invalidate_all` in the same transaction as the delete (`SEC-R04`).
 * An ordinary sign-out records nothing — it is routine, and a trail that logs
 * every routine act is one nobody reads (`AUTH-004` §4).
 *
 * `POST` only, and no `Origin` check, for the reasons `sign-out/route.ts` gives.
 */

import { recordAudit } from '../../../../../audit/record';
import { accountForToken, presentedToken } from '../../../../../auth/gate';
import { invalidateAllForAccountIn } from '../../../../../auth/session';
import { signedOut } from '../../../../../auth/sign-out';
import { getDb } from '../../../../../db/index';

export async function POST(request: Request): Promise<Response> {
  const actor = await accountForToken(presentedToken(request.headers));

  if (actor !== null) {
    // The delete and its audit row are one transaction: a bulk invalidation
    // that ended the sessions and failed to record the act is a privileged
    // write nothing logged, and an audit row beside a delete that rolled back
    // records an act that did not happen. Both functions take the transaction
    // rather than the pool, so the two cannot come apart (`SEC-R04`).
    await getDb()
      .transaction()
      .execute(async (trx) => {
        await invalidateAllForAccountIn(trx, actor.id);
        await recordAudit(trx, {
          actorId: actor.id,
          action: 'session.invalidate_all',
          subjectType: 'account',
          subjectId: actor.id,
        });
      });
  }

  return signedOut();
}
