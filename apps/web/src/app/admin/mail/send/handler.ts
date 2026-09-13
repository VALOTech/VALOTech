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
 *
 * **The same route retries the ones that failed** (`MAIL-001/T6`), because every
 * guard above is a guard a retry needs too: the same admin gate, the same
 * availability answer, the same re-resolved audience and the same typed count. A
 * request naming `retryOf` is a retry and names `mail_log` rows rather than
 * accounts, which is what lets `retry_of` make a claimed failure unrepeatable
 * ([`MAIL-DEC-02`](../../../../../docs/decisions-log.md)). A second route would
 * have been a second place to forget one of the four.
 */

import { requireAdmin } from '../../../../auth/gate';
import { getConfig } from '../../../../config/index';
import {
  sendingIsPossible,
  type AvailableMail,
  type MailAvailability,
} from '../../../../mail/availability';
import { compose, type ComposedMessage, type Mailer } from '../../../../mail/mailer';
import { resolveRecipients } from '../../../../mail/recipients';
import { resend, resolveRetries, type RetryResult } from '../../../../mail/retry';
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

/**
 * The request as it must arrive; anything else is refused by field.
 *
 * Two shapes, told apart by which list they carry: `recipients` names accounts
 * for a first send, `retryOf` names the `mail_log` rows a retry supersedes. The
 * subject, the body and the typed count are common because the discipline is
 * common — a retry is a send, and the only question it answers differently is
 * who is left to reach.
 */
type SendRequest =
  | { readonly kind: 'send'; readonly recipients: readonly string[]; readonly message: MessageFields }
  | { readonly kind: 'retry'; readonly retryOf: readonly string[]; readonly message: MessageFields };

interface MessageFields {
  readonly subject: string;
  readonly body: string;
  readonly confirmCount: number;
}

/** A `bigserial` id as the wire carries it: decimal digits, and nothing else. */
const ROW_ID = /^[1-9][0-9]{0,18}$/;

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

  const { recipients, retryOf, subject, body: text, confirmCount } = body as {
    recipients?: unknown;
    retryOf?: unknown;
    subject?: unknown;
    body?: unknown;
    confirmCount?: unknown;
  };

  if (typeof subject !== 'string' || subject.trim() === '' || subject.length > MAX_SUBJECT) {
    return invalid('subject');
  }
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_BODY) {
    return invalid('body');
  }
  if (typeof confirmCount !== 'number' || !Number.isInteger(confirmCount) || confirmCount < 0) {
    return invalid('confirmCount');
  }

  const message: MessageFields = { subject: subject.trim(), body: text, confirmCount };

  // A request may name one list or the other and never both: a body carrying
  // each would be a caller that has not decided which act it is asking for, and
  // guessing on its behalf is how a retry becomes a send to everybody.
  if (retryOf !== undefined) {
    if (recipients !== undefined) {
      return invalid('retryOf');
    }
    const ids = readIdList(retryOf, ROW_ID);

    return ids === null ? invalid('retryOf') : { kind: 'retry', retryOf: ids, message };
  }

  const ids = readIdList(recipients, UUID);

  return ids === null ? invalid('recipients') : { kind: 'send', recipients: ids, message };
}

/**
 * A non-empty list of distinct ids of the given shape, or null.
 *
 * A repeated id is not a harmless duplicate on either list. On a send the resolve
 * collapses it, so a selection containing one would reach fewer people than the
 * browser listed and the admin would be typing a count for a list that is not the
 * one they ticked. On a retry it would ask for one failure to be superseded
 * twice, which the database refuses anyway — but refusing it here is what keeps
 * the typed count honest, since the second copy could never have been sent.
 */
function readIdList(value: unknown, shape: RegExp): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  if (!value.every((id): id is string => typeof id === 'string' && shape.test(id))) {
    return null;
  }

  return new Set(value).size === value.length ? value : null;
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

  const message = compose(wanted.message.subject, wanted.message.body);

  // Step one of `MAIL-001` §3: the audience as it stands now, not as it stood
  // when the screen was drawn.
  const plan =
    wanted.kind === 'send'
      ? await planSend(wanted.recipients, actor.id)
      : await planRetry(wanted.retryOf, message.subject, actor.id);

  if (plan instanceof Response) {
    return plan;
  }

  // Step two: the count as re-resolved, reproduced by hand. Compared against what
  // the audience is now, never against the length of the list the browser sent —
  // a request could carry both, and then the check would be the browser agreeing
  // with itself.
  if (wanted.message.confirmCount !== plan.count) {
    return json(409, { error: 'count_mismatch', count: plan.count });
  }

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
    const outcome = await plan.run(message, session.mailer);
    const accepted: string[] = [];
    const failed: { accountId: string; logId: string; error: string }[] = [];

    for (const result of outcome.results) {
      if (result.state === 'accepted') {
        accepted.push(result.accountId);
      } else {
        // The row id travels back with the refusal, because it is what a retry
        // names (`MAIL-001/T6`). An account id would not do: a person can fail
        // twice under two different sends, and a retry has to say which of the
        // two it supersedes.
        failed.push({ accountId: result.accountId, logId: result.logId, error: result.error });
      }
    }

    // `alreadyRetried` is named rather than folded into `failed`: nothing was
    // attempted for these, so calling them failures would say a mail server
    // refused a message that was never handed to one.
    return json(200, { accepted, failed, alreadyRetried: outcome.unclaimed });
  } finally {
    session.close();
  }
}

/**
 * An audience that passed its checks: how many it is, and how to send to it.
 *
 * `run` answers with the retry shape for both acts, because a first send simply
 * has nothing to put in `unclaimed` -- `queueAndRecord` inserts unconditionally,
 * so it always reaches everybody it resolved. One shape means the answer below
 * is assembled once instead of twice.
 */
interface Plan {
  readonly count: number;
  readonly run: (message: ComposedMessage, mailer: Mailer) => Promise<RetryResult>;
}

/**
 * A first send's audience. An id that resolves to neither a recipient nor an
 * exclusion belongs to an account erased since the screen was drawn — the same
 * class of change as a suspension, and refused the same way.
 */
async function planSend(recipients: readonly string[], actorId: string): Promise<Plan | Response> {
  const resolved = await resolveRecipients(recipients);
  const known = new Set([
    ...resolved.recipients.map((recipient) => recipient.id),
    ...resolved.excluded.map((account) => account.id),
  ]);
  const missing = recipients.filter((id) => !known.has(id));

  if (resolved.excluded.length > 0 || missing.length > 0) {
    return json(409, {
      error: 'audience_changed',
      excluded: resolved.excluded.map((account) => ({ id: account.id, reason: account.reason })),
      missing,
    });
  }

  return {
    count: resolved.recipients.length,
    run: async (message, mailer) => ({
      ...(await send(resolved.recipients, message, mailer, actorId)),
      unclaimed: [],
    }),
  };
}

/**
 * A retry's audience: the named failures that are still eligible.
 *
 * Refused rather than trimmed, for the same reason a send is. A spent id means
 * somebody already retried that failure — possibly the admin themselves, on a
 * page they have pressed twice — and a missing one means the id names no failure
 * of this message at all, which a changed subject produces. Sending to what is
 * left would be sending to a list the admin has not seen, and the typed count
 * would be a count of something else.
 */
async function planRetry(
  retryOf: readonly string[],
  subject: string,
  actorId: string,
): Promise<Plan | Response> {
  const resolved = await resolveRetries(retryOf, subject);

  if (resolved.excluded.length > 0 || resolved.spent.length > 0 || resolved.missing.length > 0) {
    return json(409, {
      error: 'audience_changed',
      excluded: resolved.excluded.map((account) => ({ id: account.id, reason: account.reason })),
      spent: resolved.spent,
      missing: resolved.missing,
    });
  }

  return {
    count: resolved.candidates.length,
    run: (message, mailer) => resend(resolved.candidates, message, mailer, actorId),
  };
}
