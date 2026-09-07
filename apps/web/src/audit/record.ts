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
 * closed vocabulary the database enforces, or the database refusing — rejects,
 * and the rejection rolls the caller's write back with it. A discarded error on
 * this path is the shape `SEC-R04` exists to forbid, and there is none here for
 * a later edit to add without the reviewer seeing it.
 *
 * `before`/`after` are not written yet. Which fields each action may record
 * without putting a name or an e-mail into a table kept for seven years is
 * `SEC-DEC-01`, still the owner's to settle; until it does, the trail holds the
 * fact of the action — who, what, and to what — and no field values, so no
 * personal value can reach it because there is no code here to write one
 * (`DATA-R02`, `SEC-002/T4`).
 */

import type { Transaction } from 'kysely';

import type { AuditAction, Database } from '../db/types';

/** One privileged write to record: who did what, and to what. */
export interface AuditEntry {
  /** The account that acted; `null` only for a system action, which names itself in `action`. */
  actorId: string | null;
  /** What happened — one value from the closed vocabulary the `audit` table constrains. */
  action: AuditAction;
  /** What was acted on: its kind, and its id — either may be `null` for an action that has no single subject. */
  subjectType: string | null;
  subjectId: string | null;
}

/**
 * Write one audit row inside the caller's transaction.
 *
 * `at` and `id` are the database's: `at` is forced to `now()` by a trigger so a
 * caller holding `INSERT` cannot backdate a row, and `id` is `GENERATED ALWAYS`
 * so it cannot be forged. Neither is passed, and the trail is truthful about
 * when and in what order things happened without trusting the caller for either.
 */
export async function recordAudit(trx: Transaction<Database>, entry: AuditEntry): Promise<void> {
  await trx
    .insertInto('audit')
    .values({
      actor_id: entry.actorId,
      action: entry.action,
      subject_type: entry.subjectType,
      subject_id: entry.subjectId,
      before: null,
      after: null,
    })
    .execute();
}
