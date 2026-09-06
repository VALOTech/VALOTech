---
code: SEC-002
title: Audit log
domain: sec
prd_refs: [SEC-002, SEC-R04, DATA-R02, CMS-R07]
depends_on: [DATA-001]
depended_by: [ADMIN-001, CFG-001, CMS-004, DATA-002, INV-003]
layers_touched: [data, domain, service]
cross_cutting_rules: [SEC-R04, DATA-R02, CMS-R07]
status: design-ready
---

# `SEC-002` — Audit log

## 1. Purpose and PRD refs

An append-only record of every privileged write: who, when, what, and what it
replaced. Realizes `SEC-002` and carries `SEC-R04`.

Its readers are two, and they arrive at different moments. An **admin** asks
*what happened to this account* while somebody is on the phone. A **regulator or
an investor** asks *what were they shown, and when* months later, and by then the
only truthful answer is one that was recorded at the time. Both readers are
poorly served by a log that can be edited, so this design's whole subject is
making that impossible rather than merely against the rules.

## 2. Layer walkthrough

**Down.** One table, one insert function, and a trigger that raises on `UPDATE`
and on `DELETE`. The guarantee lives in the database, not in the discipline of
whoever writes the next repository function — a convention is what the incident
report is written about.

**Up.** An admin screen lists entries newest first, filterable by actor, by
subject and by action. There is no delete control and no edit control, because a
control that does not exist cannot be reached by a bug.

## 3. Contracts

### The row

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | monotonic, so ordering does not depend on a clock |
| `at` | `timestamptz` not null | UTC, database-generated — never supplied by the caller |
| `actor_id` | `uuid` | the account that acted; null only for a system action, which names itself in `action` |
| `action` | `text` not null | a closed vocabulary, below |
| `subject_type`, `subject_id` | `text`, `uuid` | what was acted on |
| `before`, `after` | `jsonb` | the changed fields only, never the whole row |

`before` and `after` carry **the fields that changed**, not the record. A whole
row would put an e-mail address, and later a password hash, into a table that
outlives the account it belongs to — which is how an erasure that succeeds
everywhere else fails here (`DATA-R02`, `DATA-R03`).

### The vocabulary

`account.create`, `account.suspend`, `account.delete`, `account.role_change`,
`grant.add`, `grant.remove`, `content.publish`, `content.withdraw`,
`media.delete`, `config.change`, `mail.send`, `session.invalidate_all`.

Closed, and constrained in the database. An action that is not in the list
cannot be written, so a new privileged write has to declare itself in a
migration — which is the point: the failure this prevents is a feature shipping
a privileged write that audits nothing, and nobody noticing because nothing
complained.

### Append-only, enforced

    CREATE TRIGGER audit_is_append_only
      BEFORE UPDATE OR DELETE ON audit
      FOR EACH ROW EXECUTE FUNCTION raise_append_only();

The application's database role additionally holds no `UPDATE` or `DELETE`
privilege on the table. Two mechanisms rather than one, because the trigger
protects against a mistake and the grant protects against a compromised
application — and they fail independently.

### Writing an entry

The audit insert happens **in the same transaction as the write it records**. Not
after it, not in a queue, not best-effort. A privileged write whose audit row
failed to insert is a privileged write that did not happen, and the transaction
is what makes that true rather than aspirational.

There is no `try`/`catch` around the audit insert anywhere in the codebase, and
that absence is checkable: a discarded error on this path is exactly the shape
`SEC-R04` exists to forbid.

### Retention

Audit rows are kept for **seven years**, which is the longest period any
applicable Singapore record-keeping obligation asks for, and they carry no
personal data by construction, so retention is not in tension with erasure
(`DATA-R03`). An erased account's rows keep the id; the person is no longer
reachable from it.

## 4. Integration

**`DATA-001`** declares the table and the trigger. **`ADMIN-001`** writes
`account.*` and `grant.*`. **`CMS-004`** writes `content.publish` and
`content.withdraw`, which is what makes "what were they shown, and when"
answerable without a database restore (`CMS-R07`). **`CFG-001`** writes
`config.change` and reads its own last entry to offer the undo. **`MAIL-002`**
writes `mail.send` — the mail log is the detail and the audit row is the fact.

## 5. Cross-cutting compliance

- **`SEC-R04`** — every privileged write audited, append-only, in the same
  transaction.
- **`DATA-R02`** — no personal data in the trail: ids, actions, timestamps, and
  the changed field names.
- **`CMS-R07`** — publishing and withdrawing are audited with what they
  replaced.

## 6. Open questions and trade-offs

- **Changed fields rather than whole rows.** A whole-row snapshot answers more
  questions and is what most audit implementations do. It is rejected because
  it makes the audit table a second store of personal data with a seven-year
  retention, which defeats erasure. The questions it would have answered are
  answered instead by `content_revisions`, which is a real archive of the thing
  people actually ask about.
- **No signing or hash chain.** A tamper-evident chain would prove the trail
  has not been rewritten. With the database owner able to disable a trigger, the
  chain would only move the trust boundary rather than remove it, and the
  operator and the owner are the same person. File it if that stops being true.

## 7. Task list

- `SEC-002/T1` — The table, the closed action vocabulary, and the append-only trigger
- `SEC-002/T2` — The application role holds no UPDATE or DELETE on it
- `SEC-002/T3` — One insert function, called inside the caller's transaction, with no error discarded
- `SEC-002/T4` — Only changed fields are recorded, and no personal data reaches the trail
- `SEC-002/T5` — The admin view: newest first, filterable by actor, subject and action, with no edit or delete control
