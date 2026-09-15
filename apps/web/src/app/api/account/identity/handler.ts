/**
 * `POST /api/account/identity` — the reader corrects their own name and the
 * address they sign in with
 * ([`ADMIN-DEC-06`](../../../../../../docs/decisions-log.md#ADMIN-DEC-06),
 * `LEGAL-SG-001` §3).
 *
 * **The act is `correctIdentity`, unchanged.** What a correction may write, what
 * counts as having changed nothing, whether the address belongs to somebody
 * else, and that an unconsumed invitation goes with an address that moves are
 * all decided inside the one transaction that writes (`SEC-R04`). A second
 * function reaching `accounts.email` would be a second answer to every one of
 * those questions, and the refusals are the whole content of the act.
 *
 * **The session is the authorisation, the subject, and the identity check.** The
 * account corrected is the one the cookie resolves to and is never taken from
 * the body. The runbook asks an admin to establish who they are speaking to
 * before correcting a record, and a signed-in reader has already presented a
 * session this system issued, which is a stronger answer than an address in a
 * message — that is `ADMIN-DEC-06`'s reasoning and it is why this surface needs
 * no second proof.
 *
 * **A taken address is refused without saying it is taken, and that is the one
 * place this path deliberately differs from the console's.** The person page
 * answers `409 email_taken`, and reveals nothing an admin could not read off the
 * account list they came from. An investor has no such list: an answer naming
 * the condition would turn this form into an oracle for *does this person hold
 * an account here*, and who is reading a fundraise is exactly the personal datum
 * this repository is built to keep. So the refusal says the address cannot be
 * used and what to do about it, and the attempt is counted against a limit.
 *
 * **A status describes the request; the query string describes the act** — the
 * rule the password control states, and for its reason: the page carries no
 * client script, so an outcome answered with a bare status leaves the reader on
 * a dead end.
 *
 * An `Origin` present and not ours is refused before anything else, the
 * `SameSite=Lax` cookie being the first lock rather than the only one.
 */

import { correctIdentity } from '../../../../admin/accounts';
import { requireHallReader } from '../../../../auth/gate';
import { getRateLimiter } from '../../../../auth/rate-limit';
import { getConfig } from '../../../../config/index';
import { backToAccount } from '../../../hall/account/outcomes';

const TEXT_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/plain; charset=utf-8',
};

export async function handleAccountIdentity(request: Request): Promise<Response> {
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

  const name = form.get('name');
  const email = form.get('email');
  if (typeof name !== 'string' || typeof email !== 'string') {
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  // Counted on every attempt rather than only on one that moves the address,
  // because what the limit bounds is how fast addresses can be tried and the
  // attempt that tries one is indistinguishable from the attempt that does not
  // until the act has already looked. A person correcting their own record does
  // it once.
  if (getRateLimiter().hit(`account-identity:${actor.id}`).limited) {
    return backToAccount('identity-too-many');
  }

  const result = await correctIdentity(actor.id, { name, email }, actor.id);

  switch (result.outcome) {
    case 'address-taken':
      return backToAccount('identity-email-unavailable');
    case 'invalid':
      return backToAccount(
        result.field === 'name' ? 'identity-name-needed' : 'identity-email-invalid',
      );
    case 'unchanged':
      return backToAccount('identity-unchanged');
    // Named rather than left to a `default`, so a fifth outcome arrives as a
    // function that no longer returns on every path instead of as a sentence
    // nobody decided to show.
    case 'changed':
      return backToAccount(
        result.invitationDestroyed ? 'identity-changed-invitation-ended' : 'identity-changed',
      );
  }
}
