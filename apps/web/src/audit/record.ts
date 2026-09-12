/**
 * Recording one privileged write, in the same transaction that made it
 * (`SEC-002`, `SEC-R04`).
 *
 * The parameter is a `Transaction`, never the pool, and that is the whole
 * safety property expressed as a type. `SEC-R04` requires the audit row and the
 * write it records to commit or roll back together: a privileged write whose
 * audit row failed to insert is a privileged write that did not happen. A
 * function that accepted the bare handle would let a caller write the audit
 * outside the transaction — best-effort, after the fact — which is exactly the
 * failure the rule forbids. `Transaction<Database>` is not assignable from
 * `Kysely<Database>`, so the only way to call this is from inside
 * `db.transaction().execute(...)`, and the discipline is checked by the
 * compiler rather than remembered by whoever writes the next call site.
 *
 * There is no `try`/`catch`. An insert that fails — an `action` outside the
 * closed vocabulary the database enforces, a field the action may not record,
 * or the database refusing — rejects, and the rejection rolls the caller's
 * write back with it. A discarded error on this path is the shape `SEC-R04`
 * exists to forbid, and there is none here for a later edit to add without the
 * reviewer seeing it.
 *
 * `before` and `after` hold the **values** a write moved, and which fields each
 * action may record is the fixed table below rather than the judgement of
 * whoever writes the next call (`SEC-DEC-01`). No action's list names `name` or
 * `email`, and the list is checked here, at the one site that inserts into the
 * table — so a personal value cannot reach a trail kept seven years past an
 * erasure, and it cannot reach it by a call site's oversight either
 * (`DATA-R02`). A field the list does not name is refused rather than dropped:
 * a silent drop would leave a caller believing the trail holds something it
 * does not.
 */

import { sql, type RawBuilder, type Transaction } from 'kysely';

import type { AuditAction, Database, Json } from '../db/types';

/** One side of a change: the fields it moved, by name, each a scalar or nothing. */
export type AuditFields = Readonly<Record<string, string | number | null>>;

/**
 * The fields each action may record, and nothing else (`SEC-DEC-01`).
 *
 * Exhaustive over the vocabulary by type, so folding a new action into the
 * `audit` check without saying what it may record does not compile. That is the
 * point of the shape: the question of what a new action exposes is answered
 * where the action is minted, not where somebody first writes a row with it.
 *
 * An empty list is the common case and is not an omission. For most acts the
 * action and its subject are the whole fact, and any field would be a second
 * copy of what the row already says. A non-empty list exists only where a reader
 * of the trail has a question the act's name cannot answer.
 */
export const RECORDABLE_FIELDS: Readonly<Record<AuditAction, readonly string[]>> = {
  // A creation's own fields are the name and the address, which no action's
  // list may name, so the act and its subject are all this records.
  'account.create': [],
  'account.suspend': [],
  'account.delete': [],
  // The role is what a role change moves, and it is what the row records.
  // `state` stands beside it because the decision names both: the list is what
  // an action may record, and a row carries only the fields the act moved.
  'account.role_change': ['role', 'state'],
  'account.reinstate': [],
  'account.object_read_tracking': [],
  'account.invitation_resend': [],
  'account.password_reset_request': [],
  'grant.add': [],
  'grant.remove': [],
  // `CMS-R07` — a publication is audited with what it replaced, which is the
  // revision the item pointed at before beside the one it points at now.
  'content.publish': ['revision_id'],
  'content.withdraw': ['revision_id'],
  // Both audiences, because one alone cannot tell a narrowing from a widening,
  // and which of the two it was is the question this act is read for.
  'content.audience_change': ['audience'],
  // A filename can carry a personal datum, so the subject id is the record.
  'media.delete': [],
  // The key as well as the value: `subject_id` is a `uuid` and cannot hold it,
  // so without the key the row cannot say which setting moved.
  'config.change': ['key', 'value'],
  'mail.send': ['subject', 'recipient_count'],
  'mail.unsubscribe': [],
  'session.invalidate_all': [],
  // `INV-003` reads the trail as the portfolio's own history, which is why the
  // schema keeps no history table: these two values are that history.
  'portfolio.change': ['stage', 'headline'],
};

/**
 * A field an action's list does not name, refused before anything is written.
 *
 * The message carries the action and the field's *name*, never its value. A
 * refusal is reported, and what is reported is logged — so a value here would
 * put in a log precisely the datum the allow-list exists to keep out of the
 * table (`DATA-R02`). The action and the field are enough to fix the call site,
 * which is all a refusal has to be good for.
 */
export class UnrecordableFieldError extends Error {
  readonly action: AuditAction;
  readonly field: string;

  constructor(action: AuditAction, field: string) {
    super(`the audit for ${action} may not record ${field}`);
    this.name = 'UnrecordableFieldError';
    this.action = action;
    this.field = field;
  }
}

/** One privileged write to record: who did what, to what, and what it moved. */
export interface AuditEntry {
  /** The account that acted; `null` only for a system action, which names itself in `action`. */
  actorId: string | null;
  /** What happened — one value from the closed vocabulary the `audit` table constrains. */
  action: AuditAction;
  /** What was acted on: its kind, and its id — either may be `null` for an action that has no single subject. */
  subjectType: string | null;
  subjectId: string | null;
  /** The recordable fields as they stood before the write; absent when the act replaced nothing. */
  before?: AuditFields;
  /** The recordable fields as the write left them; absent when the act set nothing. */
  after?: AuditFields;
}

/** Refuse every field the action's list does not name, fail-closed and before the insert. */
function refuseUnrecordable(action: AuditAction, fields: AuditFields | undefined): void {
  if (fields === undefined) {
    return;
  }

  const recordable = RECORDABLE_FIELDS[action];

  for (const field of Object.keys(fields)) {
    if (!recordable.includes(field)) {
      throw new UnrecordableFieldError(action, field);
    }
  }
}

/**
 * The fields as a `jsonb` document, or `null` for a side the act has none for.
 * The cast is from a bound parameter, so the value reaches the column parsed
 * rather than stored as a JSON string, and no field name or value is ever
 * concatenated into SQL.
 */
function asJsonb(fields: AuditFields | undefined): RawBuilder<Json> | null {
  return fields === undefined ? null : sql<Json>`${JSON.stringify(fields)}::jsonb`;
}

/**
 * Write one audit row inside the caller's transaction.
 *
 * `at` and `id` are the database's: `at` is forced to `now()` by a trigger so a
 * caller holding `INSERT` cannot backdate a row, and `id` is `GENERATED ALWAYS`
 * so it cannot be forged. Neither is passed, and the trail is truthful about
 * when and in what order things happened without trusting the caller for either.
 *
 * The allow-list is checked before the insert and its refusal is thrown, not
 * returned, so the caller's write rolls back with a field that should never have
 * been offered — the same way it rolls back when the database refuses the row.
 */
export async function recordAudit(trx: Transaction<Database>, entry: AuditEntry): Promise<void> {
  refuseUnrecordable(entry.action, entry.before);
  refuseUnrecordable(entry.action, entry.after);

  await trx
    .insertInto('audit')
    .values({
      actor_id: entry.actorId,
      action: entry.action,
      subject_type: entry.subjectType,
      subject_id: entry.subjectId,
      before: asJsonb(entry.before),
      after: asJsonb(entry.after),
    })
    .execute();
}
