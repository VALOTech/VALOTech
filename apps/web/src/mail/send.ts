/**
 * Handing a composed message to the port, one recipient at a time
 * (`MAIL-001/T5`).
 *
 * A send is the one act in this product that cannot be withdrawn, so the record
 * of it is written before anything leaves: one `mail_log` row per recipient,
 * `queued`, together with the audit row, in a single transaction — and only then
 * is the port called. A crash in between leaves a record of an attempt whose
 * outcome is unknown, which is the truthful thing to find afterwards; the
 * opposite order leaves messages in inboxes and nothing in the trail
 * (`MAIL-002/T1`, `SEC-R04`).
 *
 * The sending loop is deliberately **not** one transaction. Each row is moved to
 * `accepted` or `failed` by its own statement, so a stop halfway — a refused
 * connection, a killed process, an admin closing the page — leaves a truthful
 * per-recipient record of what actually happened. A single transaction would roll
 * back the record of the messages already accepted, and a row that read `queued`
 * or `failed` for a message that had in fact gone is how anything that later
 * re-sends by state would deliver it a second time.
 *
 * One at a time and in the foreground for the same reason: the admin watches the
 * count and can stop it halfway, and halfway is where somebody realises the
 * subject line is wrong. A batch would also take away the only place a refusal
 * can be recorded against the one recipient it belongs to.
 *
 * A refusal from the port is caught, written to that recipient's row and
 * returned — neither swallowed nor allowed to end the send, because one full
 * mailbox is not a reason the other nineteen go unsent. Only the port call sits
 * inside the `try`: a database failure after an acceptance propagates instead,
 * leaving the row `queued`, because recording an accepted message as `failed`
 * would let a later re-send deliver it a second time.
 *
 * The audit row carries who sent and that a send happened, and nothing else. The
 * subject and the count an admin sees belong in `before`/`after`, which
 * `SEC-DEC-01` has not settled; an address belongs in neither, so the recipients
 * reach the trail only as the `mail_log` rows' `account_id` (`DATA-R02`).
 *
 * Recipients arrive already resolved and confirmed (`MAIL-001/T2`), and the route
 * re-resolves them immediately before calling this and refuses the send if the
 * audience changed (`MAIL-001/T4`). Nothing here re-derives who should be
 * reached: the suppression list is checked where recipients are resolved
 * (`MAIL-001/T3`), never again at send time, so a list derived twice cannot
 * become two lists.
 *
 * Retrying only the recipients that failed is `MAIL-001/T6`, deferred until
 * `MAIL-DEC-02` settles how a re-send stays idempotent — a retry that can reach
 * an already-accepted recipient is how a person receives a message twice. The
 * per-recipient states this loop writes are what that retry will read.
 */

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';
import { scrub } from '../ops/scrub';

import type { ComposedMessage, Mailer } from './mailer';
import type { Recipient } from './recipients';

/**
 * What came of one recipient's message: the queue id the server returned, or the
 * reply text that refused it. `accepted` and never `delivered`, because SMTP
 * answers once at hand-off and says nothing afterwards.
 */
export type SendResult = {
  readonly accountId: string;
  /** The `mail_log` row this attempt wrote, so the outcome can name each recipient's row. */
  readonly logId: string;
} & ({ readonly state: 'accepted'; readonly queueId: string } | { readonly state: 'failed'; readonly error: string });

/** A send's outcome: one result per recipient, in the order they were attempted. */
export interface SendOutcome {
  readonly results: readonly SendResult[];
}

/** A recipient and the row written for them before their message was attempted. */
interface QueuedRecipient {
  readonly recipient: Recipient;
  readonly logId: string;
}

/**
 * The longest a stored refusal may be — enough for an SMTP reply, capped so a
 * verbose adapter cannot fill a column kept for two years.
 */
const MAX_FAILURE_TEXT = 500;

/**
 * The text a refusal leaves in the row, made safe to keep. An `Error` carries the
 * server's reply as its message; a real SMTP rejection echoes the recipient's
 * address, and a TLS or auth failure can echo the `SMTP_URL` credential. Both are
 * a personal datum or a secret, and `mail_log.error` is kept two years and shown
 * on the admin log, so the reply is run through the shared scrubber — which masks
 * an address and a long credential token by shape, the credential being one an
 * `@`-alone reading would miss — before it is stored (`DATA-R02`: a personal
 * datum never lives in an error message). The
 * result is capped, and an empty reply is named rather than left blank so a row
 * never reads `failed` with nothing on it.
 */
function failureText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const masked = scrub(raw);
  const capped = masked.length > MAX_FAILURE_TEXT ? `${masked.slice(0, MAX_FAILURE_TEXT)}...` : masked;
  return capped.trim() === '' ? 'the port refused without a reason' : capped;
}

/**
 * Write the `queued` row for every recipient and record the send, in one
 * transaction, before any message is attempted. The rows are inserted one at a
 * time so each returned id is unambiguously the row for the recipient beside it —
 * the pairing is what lets a failure be written against the one recipient it
 * belongs to, and a multi-row insert would rest that pairing on the order the
 * server happens to return.
 */
async function queueAndRecord(
  recipients: readonly Recipient[],
  message: ComposedMessage,
  actorId: string,
): Promise<QueuedRecipient[]> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const queued: QueuedRecipient[] = [];

      for (const recipient of recipients) {
        const row = await trx
          .insertInto('mail_log')
          .values({ account_id: recipient.id, subject: message.subject, kind: 'bulk', state: 'queued' })
          .returning('id')
          .executeTakeFirstOrThrow();
        queued.push({ recipient, logId: row.id });
      }

      await recordAudit(trx, { actorId, action: 'mail.send', subjectType: 'mail', subjectId: null });

      return queued;
    });
}

/** Hand one message to the port and say what came back, without deciding anything else. */
async function attempt(
  mailer: Mailer,
  message: ComposedMessage,
  { recipient, logId }: QueuedRecipient,
): Promise<SendResult> {
  try {
    const receipt = await mailer.send(recipient.email, message.subject, message.text, message.html);
    return { accountId: recipient.id, logId, state: 'accepted', queueId: receipt.queueId };
  } catch (error) {
    return { accountId: recipient.id, logId, state: 'failed', error: failureText(error) };
  }
}

/**
 * Send `message` to each recipient in turn, recording the outcome of each.
 *
 * A send to nobody writes nothing and records nothing: an empty list is a send
 * that did not happen, and a trail row for it would say one did. `kind` is
 * `bulk` — this is investor mail, which an unsubscribe suppresses, and not a
 * transactional message, which one never may (`MAIL-002/T3`).
 */
export async function send(
  recipients: readonly Recipient[],
  message: ComposedMessage,
  mailer: Mailer,
  actorId: string,
): Promise<SendOutcome> {
  if (recipients.length === 0) {
    return { results: [] };
  }

  const queued = await queueAndRecord(recipients, message, actorId);
  const db = getDb();
  const results: SendResult[] = [];

  for (const entry of queued) {
    const result = await attempt(mailer, message, entry);

    if (result.state === 'accepted') {
      await db
        .updateTable('mail_log')
        .set({ state: 'accepted', queue_id: result.queueId })
        .where('id', '=', entry.logId)
        .execute();
    } else {
      await db
        .updateTable('mail_log')
        .set({ state: 'failed', error: result.error })
        .where('id', '=', entry.logId)
        .execute();
    }

    results.push(result);
  }

  return { results };
}
