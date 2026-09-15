/**
 * `POST /api/account/mail` — the reader's own investor-mail preference, changed
 * from inside the hall (`MAIL-002/T2`, `DATA-R04`).
 *
 * The same row the link in a message writes, reached by somebody who is signed
 * in. Which door was used is the row's `source`; that both doors write one row
 * is what keeps "does this person want investor mail" from having two answers.
 *
 * **The session is the authorisation and the subject at once.** The account
 * acted on is the one the cookie resolves to and is never taken from the body:
 * an id in a posted form would be an unsubscribe anybody could aim at anybody.
 *
 * Stopping is audited inside the write (`SEC-R04`). Starting again is not, and
 * that is the trail's vocabulary rather than a choice made here — `AUDIT_ACTIONS`
 * is closed and enforced by the database, and the one mail-preference act in it
 * is the stop (`MAIL-DEC-06`). A person setting their own preference over their
 * own inbox is not a privileged write, so nothing about this is a record the
 * trail is missing; an *admin* starting somebody else's mail again would be, and
 * is not offered.
 *
 * An `Origin` present and not ours is refused before anything else: a route
 * handler gets no automatic origin check, and while the session cookie is
 * `SameSite=Lax` and so is not sent on a cross-site `POST` at all, this is the
 * second lock rather than the only one.
 */

import { requireInvestor } from '../../../../auth/gate';
import { getConfig } from '../../../../config/index';
import { resumeInvestorMail, stopInvestorMail } from '../../../../mail/unsubscribe';

const TEXT_HEADERS: Readonly<Record<string, string>> = { 'Content-Type': 'text/plain; charset=utf-8' };

/** The page that renders the setting, which is where a press returns. */
const ACCOUNT_MAIL = '/hall/account';

/** The two things the form can ask for; anything else is a malformed request. */
function isIntent(value: unknown): value is 'stop' | 'resume' {
  return value === 'stop' || value === 'resume';
}

export async function handleAccountMail(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response('cross_origin', { status: 403, headers: TEXT_HEADERS });
  }

  const actor = await requireInvestor(request);
  if (actor instanceof Response) {
    return actor;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  const intent = form.get('intent');
  if (!isIntent(intent)) {
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  if (intent === 'stop') {
    await stopInvestorMail({ by: 'person', accountId: actor.id });
  } else {
    await resumeInvestorMail(actor.id);
  }

  // Post, redirect, get: the page reads the row and says what is now true, so a
  // refresh re-reads rather than re-posting, and neither answer has to be
  // carried in a query string where it could disagree with the row.
  return new Response(null, { status: 303, headers: { Location: ACCOUNT_MAIL } });
}
