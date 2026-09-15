/**
 * `POST /api/account/delete` — the reader deletes their own account
 * ([`ADMIN-DEC-06`](../../../../../../docs/decisions-log.md#ADMIN-DEC-06),
 * `DATA-R03`).
 *
 * **The session is the authorisation, the subject and the identity check.** The
 * account erased is the one the cookie resolves to; `eraseOwnAccount` takes one
 * id for that reason, so there is no pair to get wrong and no id a posted body
 * could supply. The runbook's erasure path asks an admin to establish who they
 * are speaking to before acting, and a presented session answers that better
 * than an address does.
 *
 * **The typed name is checked here against the row, not against the form.** The
 * page shows the name and holds its button off until what is typed matches, and
 * that is a courtesy to the person confirming rather than a control — a posted
 * body is whatever the caller sent. `typedNameMatches` is the function the
 * console's confirmation gates on, so the two surfaces cannot drift into
 * disagreeing about what counts as the name, and it runs against the name read
 * from the database.
 *
 * **One refusal survives from the console and one does not.** An erasure that
 * would leave the hall with no admin who can sign in is refused wherever it
 * comes from, because the hall it strands is recoverable only from the database.
 * The console's other refusal — an admin may not act on their own access — is
 * about privilege passing a second pair of eyes, and this act is a person
 * exercising erasure over their own record, which is the case the control exists
 * for rather than the case to refuse.
 *
 * **A completed erasure signs the reader out rather than returning them to the
 * page.** The row is gone and the cascade took its sessions with it, so the
 * cookie in the browser now resolves to nobody; `signedOut` expires it and lands
 * them on the public gateway, which is the one surface they can still read. The
 * alternative — a redirect to a page that immediately refuses them — would greet
 * an act they asked for with an access refusal.
 *
 * An `Origin` present and not ours is refused before anything else, the
 * `SameSite=Lax` cookie being the first lock rather than the only one.
 */

import { eraseOwnAccount, personIdentity } from '../../../../admin/accounts';
import { requireHallReader } from '../../../../auth/gate';
import { signedOut } from '../../../../auth/sign-out';
import { getConfig } from '../../../../config/index';
import { typedNameMatches } from '../../../admin/destructive-actions';
import { backToAccount } from '../../../hall/account/outcomes';

const TEXT_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/plain; charset=utf-8',
};

export async function handleAccountDelete(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response('cross_origin', { status: 403, headers: TEXT_HEADERS });
  }

  const actor = await requireHallReader(request);
  if (actor instanceof Response) {
    return actor;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  const confirmName = form.get('confirmName');
  if (typeof confirmName !== 'string') {
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  const person = await personIdentity(actor.id);

  // The session resolved a moment ago, so a missing row here means the account
  // was erased by an admin in between. Sending them to the sign-out answer is
  // both true and what the next request would do anyway: the cookie they hold
  // resolves to nobody.
  if (person === null) {
    return signedOut();
  }

  if (!typedNameMatches(confirmName, person.name)) {
    return backToAccount('delete-name-mismatch');
  }

  // The act's only refusal. A row erased between `personIdentity` and here would
  // land in the same branch, which is a race with an admin's delete that ends
  // with the reader signed out on their next request either way.
  return (await eraseOwnAccount(actor.id)) ? signedOut() : backToAccount('delete-last-admin');
}
