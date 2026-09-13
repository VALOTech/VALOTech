/**
 * `POST /api/unsubscribe` — what the confirmation on `/unsubscribe/<token>`
 * posts (`MAIL-002/T2`, `DATA-R04`).
 *
 * **The write is here and not on the `GET`**, because a link in a message is
 * fetched by things that are not the reader: mail scanners, corporate
 * link-protection rewriters, and clients that prefetch what they render. A
 * `GET` that unsubscribed would unsubscribe those people without a press, and
 * nothing in the row would distinguish it from a real one. The page asks; this
 * answers (`MAIL-DEC-05`).
 *
 * **One answer for every token.** A value that carries no signature this server
 * made, one naming an account that no longer exists, and one naming an account
 * already on the list all get the same `303` to the same page, which reads the
 * state and says what is true. A status that differed would turn the endpoint
 * into an oracle for which links are live, answerable without opening anything.
 *
 * The redirect target is built from the token the caller sent, so it is encoded
 * before it goes into a `Location`: a token shaped like `//elsewhere.example`
 * would otherwise leave this origin. Encoding leaves a real token's bytes alone
 * — a uuid, a dot and base64url are all unreserved — so the page that follows
 * verifies exactly what was posted.
 *
 * An `Origin` present and not ours is refused before anything else, the same
 * first lock every other route handler here takes: a handler gets no automatic
 * origin check, and a cross-site form can post a body with no preflight. The
 * token is the thing that actually gates the act — a foreign page that does not
 * hold one can do nothing with this endpoint — and this is the second lock
 * rather than the only one.
 *
 * There is no rate limit, and that is a measurement rather than an omission. A
 * token that does not verify costs one HMAC and no database round trip, and a
 * token that does verify can only write a row that is idempotent by its primary
 * key. Neither is a lever worth holding a counter open for.
 */

import { getConfig } from '../../../config/index';
import { stopInvestorMail, unsubscribeSubject } from '../../../mail/unsubscribe';
import { UNSUBSCRIBE_PATH } from '../../../mail/unsubscribe-notice';

const TEXT_HEADERS: Readonly<Record<string, string>> = { 'Content-Type': 'text/plain; charset=utf-8' };

/** The page that renders the state, which is the whole of what a caller is told. */
function backToPage(token: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: `${UNSUBSCRIBE_PATH}/${encodeURIComponent(token)}` },
  });
}

export async function handleUnsubscribe(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response('cross_origin', { status: 403, headers: TEXT_HEADERS });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // The parse error's only content is where the caller's own body broke; the
    // 400 stands for it and it is not echoed back.
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  const token = form.get('token');

  // A missing or file-valued field is a malformed request rather than a refused
  // one: there is no link to send anybody back to.
  if (typeof token !== 'string' || token === '') {
    return new Response('invalid_request', { status: 400, headers: TEXT_HEADERS });
  }

  const accountId = await unsubscribeSubject(token);

  if (accountId !== null) {
    await stopInvestorMail({ by: 'person', accountId });
  }

  return backToPage(token);
}
