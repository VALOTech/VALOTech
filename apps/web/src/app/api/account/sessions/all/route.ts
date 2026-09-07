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
 * `POST` only, and no `Origin` check, for the reasons `sign-out/route.ts` gives.
 */

import { accountForToken, presentedToken } from '../../../../../auth/gate';
import { invalidateAllForAccount } from '../../../../../auth/session';
import { signedOut } from '../../../../../auth/sign-out';

export async function POST(request: Request): Promise<Response> {
  const actor = await accountForToken(presentedToken(request.headers));

  if (actor !== null) {
    // Deferred: SEC-002/T3 — record `session.invalidate_all` with this actor as
    // both the actor and the subject, inside the same transaction as the delete
    // (`SEC-R04`). It waits on the one audit insert function, which is itself
    // waiting on decisions-log.md#SEC-DEC-01; writing the row from here first
    // would be a second writer for a table whose whole property is that it has
    // one. Until then the bulk invalidation happens and is not recorded —
    // incomplete, and honest about it rather than a call that logs nowhere.
    await invalidateAllForAccount(actor.id);
  }

  return signedOut();
}
