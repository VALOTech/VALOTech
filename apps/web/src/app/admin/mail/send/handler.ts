/**
 * `POST /admin/mail/send` — the one act in this product that cannot be withdrawn
 * (`MAIL-001/T4`).
 *
 * Everything before the hand-off is friction on purpose. A message in somebody's
 * inbox cannot be recalled, so the request is refused unless the person sending
 * it is looking at the audience they confirmed and has said how many people that
 * is in their own hand.
 *
 * **The audience is re-resolved and any change refuses the send.** The list was
 * confirmed on a screen that may have been open for an hour; in that hour a
 * person can be suspended, can unsubscribe, or can be erased. Re-resolving is not
 * re-deriving — the ids are still the admin's own selection, never a criterion
 * evaluated again (`MAIL-001/T2`) — it asks whether each of those people is still
 * someone this message may reach. A refusal names who and why, so the admin
 * re-confirms a list they have looked at rather than one silently trimmed for
 * them. This lives here rather than in the send loop for three reasons: the loop
 * already states that nothing in it re-derives who should be reached
 * (`MAIL-001/T5`), a refusal is an answer to a request rather than an outcome of
 * a send, and the count below is checked against the re-resolved number, so both
 * guards have to stand on the same side of the boundary.
 *
 * **The count is typed, not clicked.** Typing "17" is a different act from
 * pressing a button (`ADMIN-002`), and the difference is the point: the number
 * has to be read off the screen and reproduced, which is where somebody notices
 * it is not the seventeen they meant. It is compared against the count the
 * re-resolve produced, never against what the browser sent.
 *
 * **Sending is refused outright when the port is unavailable**, with the reason
 * (`MAIL-001/T7`). The screen disables the control on the same answer, so the
 * button and the route cannot disagree, and a request arriving anyway — a stale
 * page, a direct call — is refused rather than half-run.
 *
 * A route handler inherits no segment layout, so it asks `requireAdmin` itself
 * and an investor is answered the `404` the console gives a guess; a cross-site
 * `Origin` is refused before anything else, the `SameSite=Lax` cookie being the
 * first lock (`ADMIN-002`, `AUTH-001`).
 *
 * The answer names accounts and never addresses: the composer already holds the
 * names it rendered, so an id is enough to say which hand-off failed, and an
 * address in a response body is an address in a browser cache (`DATA-R02`). It
 * says **accepted**, because a `250` means the company's own mail server took the
 * message and nothing after that is visible to this system.
 */

import { requireAdmin } from '../../../../auth/gate';
import { getConfig } from '../../../../config/index';
import {
  sendingIsPossible,
  type AvailableMail,
  type MailAvailability,
} from '../../../../mail/availability';
import { compose } from '../../../../mail/mailer';
import { resolveRecipients } from '../../../../mail/recipients';
import { send } from '../../../../mail/send';
import { SmtpUrlError, openSmtpMailer, type MailerSession } from '../../../../mail/smtp';

/** How the connection for one send is opened, so a test drives the path without a server. */
export type SessionOpener = (mail: AvailableMail) => MailerSession;

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  // The answer names who a message was accepted for; no cache has any business
  // holding it.
  'Cache-Control': 'no-store',
};

/**
 * The shape an account id takes. A value that is not one never reaches the uuid
 * column, where PostgreSQL would raise `22P02` — an error whose message repeats
 * the value supplied (`DATA-R02`) and which a caller receives as a `500`
 * describing an invariant rather than an answer about a request.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a subject and a body may be. A subject is one header line — RFC 5322
 * recommends 78 characters and hard-limits a line at 998 — so anything near the
 * bound is already a mistake, and a body long enough to matter is one nobody
 * composed in this box.
 */
const MAX_SUBJECT = 200;
const MAX_BODY = 50_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function invalid(field: string): Response {
  return json(400, { error: 'invalid_request', field });
}

/** The request as it must arrive; anything else is refused by field. */
interface SendRequest {
  readonly recipients: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly confirmCount: number;
}

/**
 * Read the request, or the refusal naming the field that is wrong.
 *
 * The recipient ids are checked for shape and for repetition. A repeated id is
 * not a harmless duplicate: the resolve collapses it, so a selection that
 * contained one would reach fewer people than the browser listed, and the admin
 * would be typing a count for a list that is not the one they ticked.
 */
function readRequest(body: unknown): SendRequest | Response {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json(400, { error: 'invalid_request' });
  }

  const { recipients, subject, body: text, confirmCount } = body as {
    recipients?: unknown;
    subject?: unknown;
    body?: unknown;
    confirmCount?: unknown;
  };

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return invalid('recipients');
  }
  if (!recipients.every((id): id is string => typeof id === 'string' && UUID.test(id))) {
    return invalid('recipients');
  }
  if (new Set(recipients).size !== recipients.length) {
    return invalid('recipients');
  }

  if (typeof subject !== 'string' || subject.trim() === '' || subject.length > MAX_SUBJECT) {
    return invalid('subject');
  }
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_BODY) {
    return invalid('body');
  }
  if (typeof confirmCount !== 'number' || !Number.isInteger(confirmCount) || confirmCount < 0) {
    return invalid('confirmCount');
  }

  return { recipients, subject: subject.trim(), body: text, confirmCount };
}

/**
 * The send.
 *
 * The connection and the availability answer both default to the running
 * application's and are parameters so a test drives every branch without a mail
 * server and without a second environment; nothing in the application passes
 * either.
 */
export async function handleSend(
  request: Request,
  open: SessionOpener = openSmtpMailer,
  availabilityOf: () => Promise<MailAvailability> = sendingIsPossible,
): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, { error: 'cross_origin' });
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  const availability = await availabilityOf();
  if (!availability.available) {
    return json(409, { error: 'mail_unavailable', detail: availability.reason });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }

  const wanted = readRequest(parsed);
  if (wanted instanceof Response) {
    return wanted;
  }

  // Step one of `MAIL-001` §3: the audience as it stands now, not as it stood
  // when the screen was drawn. An id that resolves to neither a recipient nor an
  // exclusion belongs to an account that has been erased since — the same class
  // of change as a suspension, and refused the same way.
  const resolved = await resolveRecipients(wanted.recipients);
  const known = new Set([
    ...resolved.recipients.map((recipient) => recipient.id),
    ...resolved.excluded.map((account) => account.id),
  ]);
  const missing = wanted.recipients.filter((id) => !known.has(id));

  if (resolved.excluded.length > 0 || missing.length > 0) {
    return json(409, {
      error: 'audience_changed',
      excluded: resolved.excluded.map((account) => ({ id: account.id, reason: account.reason })),
      missing,
    });
  }

  // Step two: the count as re-resolved, reproduced by hand. Compared against what
  // the audience is now, never against the length of the list the browser sent —
  // a request could carry both, and then the check would be the browser agreeing
  // with itself.
  if (wanted.confirmCount !== resolved.recipients.length) {
    return json(409, { error: 'count_mismatch', count: resolved.recipients.length });
  }

  const message = compose(wanted.subject, wanted.body);

  // The connection is built before the first row is written and closed however
  // the send ends, so a misconfigured `SMTP_URL` refuses the request instead of
  // leaving a trail of `queued` rows for a send that could never start.
  let session: MailerSession;
  try {
    session = open(availability.mail);
  } catch (error) {
    if (error instanceof SmtpUrlError) {
      return json(409, { error: 'mail_unavailable', detail: error.message });
    }
    throw error;
  }

  try {
    const outcome = await send(resolved.recipients, message, session.mailer, actor.id);
    const accepted: string[] = [];
    const failed: { accountId: string; error: string }[] = [];

    for (const result of outcome.results) {
      if (result.state === 'accepted') {
        accepted.push(result.accountId);
      } else {
        failed.push({ accountId: result.accountId, error: result.error });
      }
    }

    return json(200, { accepted, failed });
  } finally {
    session.close();
  }
}
