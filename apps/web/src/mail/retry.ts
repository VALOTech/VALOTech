/**
 * Sending again to the recipients whose last attempt failed, and to nobody else
 * (`MAIL-001/T6`, [`MAIL-DEC-02`](../../../../docs/decisions-log.md)).
 *
 * **The whole difficulty is that a retry must never reach somebody who already
 * received the message.** `mail_log` records each attempt as its own row and
 * never supersedes an earlier one — a failed attempt stays `failed` for ever,
 * because that is what happened — so "who failed" cannot be read from `state`
 * alone, and a second retry keyed on the same rows would send to everybody the
 * first retry already reached.
 *
 * `MAIL-DEC-02` settled the mechanism: a re-send names the failure it supersedes
 * in `retry_of`, and a failed row that has been named is spent. The guarantee
 * lives in the data rather than in this file — a unique index over `retry_of`
 * lets one attempt be superseded exactly once — so two admins pressing retry
 * together cannot both send, and a caller that passed the same ids twice gets
 * nothing the second time whatever it believes.
 *
 * **The claim is taken before the message leaves, never after.** The row naming
 * the failure is inserted first; only then is the port called. The opposite order
 * would leave the window this exists to close: two callers both find the failure
 * unspent, both send, and the loser of the insert race finds out after the
 * message is already in somebody's inbox.
 *
 * **The audience is re-resolved, not trusted.** An account suspended or
 * unsubscribed since the original send is excluded here as it would be from a
 * first send (`MAIL-001/T3`), because a retry is a send and the list is never a
 * criterion re-evaluated from memory. An account erased since is simply gone: its
 * `mail_log` rows went with it (`DATA-R02`), so it cannot be named at all.
 */

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';

import type { ComposedMessage, Mailer } from './mailer';
import { resolveRecipients, type ExcludedRecipient, type Recipient } from './recipients';
import { deliverQueued, type QueuedRecipient, type SendOutcome } from './send';

/**
 * A retry's outcome: what happened to each message, and which named failures
 * somebody else had already claimed.
 *
 * `unclaimed` is empty for a first send and can only be non-empty here, which is
 * why it lives on this type rather than on `SendOutcome`: `queueAndRecord`
 * inserts unconditionally, so a send always reaches everybody it resolved, and
 * the typed-count guard binds. A retry's claim can lose a race after the count
 * was typed, and this is what keeps that from being silent.
 */
export interface RetryResult extends SendOutcome {
  readonly unclaimed: readonly string[];
}

/** One failure that may be tried again: the person, and the row that records it. */
export interface RetryCandidate {
  readonly recipient: Recipient;
  /** The `mail_log` row this retry would supersede. */
  readonly failedId: string;
}

/**
 * What a set of proposed retries resolves to.
 *
 * `spent` and `excluded` are kept apart because they are different answers to the
 * admin: a spent id is one already retried — by them a moment ago, or by another
 * admin — and there is nothing to do about it; an excluded account is somebody
 * whose situation changed since the send, which is a thing they may want to know
 * before pressing anything. `missing` is an id that names no eligible failure at
 * all: never failed, already accepted, or belonging to a different message.
 */
export interface ResolvedRetries {
  readonly candidates: readonly RetryCandidate[];
  readonly excluded: readonly ExcludedRecipient[];
  readonly spent: readonly string[];
  readonly missing: readonly string[];
}

/**
 * Which of the proposed rows may be sent again.
 *
 * The subject is part of the predicate rather than a convenience. `mail_log`
 * keeps a subject and no body (`DATA-R02`: nothing is kept that need not be), so
 * the composer must post the message back for a retry to have anything to send —
 * and a subject that no longer matches the rows means the admin edited the
 * message between the send and the retry. That is a different message to those
 * recipients and the rest of the list never got it, so it is refused rather than
 * sent. The body cannot be checked the same way, and that limit is stated here
 * rather than implied: what this guarantees is that a retry carries the same
 * *subject* as the send it supersedes.
 */
export async function resolveRetries(failedIds: readonly string[], subject: string): Promise<ResolvedRetries> {
  if (failedIds.length === 0) {
    return { candidates: [], excluded: [], spent: [], missing: [] };
  }

  const db = getDb();
  const rows = await db
    .selectFrom('mail_log')
    .select(['id', 'account_id'])
    .where('id', 'in', failedIds)
    .where('state', '=', 'failed')
    .where('subject', '=', subject)
    // Bulk only. A transactional failure -- an invitation or a reset that a mail
    // server refused -- lives in the same table and could otherwise be named in
    // a `retryOf` list whose subject happened to match, which would send that
    // person the investor mail instead and spend their invitation's one retry
    // slot for ever. The two kinds are different messages to different purposes
    // and neither is a retry of the other.
    .where('kind', '=', 'bulk')
    .execute();

  // A separate read of the successors rather than a NOT EXISTS in the query
  // above, because the two answers are told apart on the way out: an id with a
  // successor is `spent` and an id that matched nothing is `missing`, and one
  // query returning neither would collapse them into "not eligible".
  const successors = await db
    .selectFrom('mail_log')
    .select('retry_of')
    .where('retry_of', 'in', failedIds)
    .execute();
  const superseded = new Set(successors.map((row) => row.retry_of));

  const live = rows.filter((row) => !superseded.has(row.id));
  const resolved = await resolveRecipients(live.map((row) => row.account_id));
  const byAccount = new Map(resolved.recipients.map((recipient) => [recipient.id, recipient]));

  const candidates: RetryCandidate[] = [];
  for (const row of live) {
    const recipient = byAccount.get(row.account_id);

    if (recipient !== undefined) {
      candidates.push({ recipient, failedId: row.id });
    }
  }

  const matched = new Set(rows.map((row) => row.id));

  return {
    candidates,
    excluded: resolved.excluded,
    spent: failedIds.filter((id) => superseded.has(id)),
    missing: failedIds.filter((id) => !matched.has(id)),
  };
}

/**
 * Claim each failure and send again to the ones the claim took.
 *
 * `ON CONFLICT DO NOTHING` rather than a caught unique violation: a raised
 * constraint inside a transaction aborts the whole transaction in PostgreSQL, so
 * one already-claimed failure would roll back the claims beside it and the retry
 * would send to nobody. Answering with no row is the ordinary reply to an
 * ordinary request — somebody already retried this one — and the loop simply
 * leaves that recipient out.
 *
 * The audit row carries the subject and **how many messages this retry claimed
 * the right to send** (`SEC-DEC-01`), counted from the claims that succeeded
 * rather than from what the caller proposed. It is written before the port is
 * called, so it is not a count of what arrived and does not pretend to be: what
 * became of each message is the `mail_log` row's, and this is the trail's record
 * that an admin took the act. Counting the proposal instead would attribute a
 * send to people whose claim another retry had already taken. A claim that took
 * nothing records nothing: no message left, so no send happened.
 */
export async function resend(
  candidates: readonly RetryCandidate[],
  message: ComposedMessage,
  mailer: Mailer,
  actorId: string,
): Promise<RetryResult> {
  const unclaimed: string[] = [];

  if (candidates.length === 0) {
    return { results: [], unclaimed };
  }

  // One order for every caller, so two retries with overlapping candidate sets
  // cannot each hold the claim the other is waiting for. The inserts below are
  // sequential inside one transaction and each can block on another
  // transaction's speculative insert, so opposite orders deadlock: PostgreSQL
  // breaks it with a 40P01, the whole transaction aborts and nothing is sent.
  // Fail-closed, and avoidable for the cost of a sort.
  const ordered = [...candidates].sort((a, b) => (a.failedId < b.failedId ? -1 : 1));

  const claimed = await getDb()
    .transaction()
    .execute(async (trx) => {
      const taken: QueuedRecipient[] = [];

      for (const candidate of ordered) {
        const row = await trx
          .insertInto('mail_log')
          .values({
            account_id: candidate.recipient.id,
            subject: message.subject,
            kind: 'bulk',
            state: 'queued',
            retry_of: candidate.failedId,
          })
          .onConflict((oc) => oc.column('retry_of').where('retry_of', 'is not', null).doNothing())
          .returning('id')
          .executeTakeFirst();

        if (row !== undefined) {
          taken.push({ recipient: candidate.recipient, logId: row.id });
        } else {
          // Somebody claimed this failure between the resolve and here. It is
          // reported rather than dropped: the admin typed a count, and a
          // recipient who appears in neither `accepted` nor `failed` is a person
          // unaccounted for on the one surface whose whole discipline is that
          // the admin sees exactly who was reached.
          unclaimed.push(candidate.failedId);
        }
      }

      if (taken.length > 0) {
        await recordAudit(trx, {
          actorId,
          action: 'mail.send',
          subjectType: 'mail',
          subjectId: null,
          after: { subject: message.subject, recipient_count: taken.length },
        });
      }

      return taken;
    });

  return { ...(await deliverQueued(claimed, message, mailer)), unclaimed };
}
