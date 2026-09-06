---
code: DATA-003
title: Backup and restore
domain: data
prd_refs: [DATA-003, DATA-R03, SEC-R05]
depends_on: [CRED-001, DATA-001]
depended_by: [OPS-001]
layers_touched: [infra, data]
cross_cutting_rules: [SEC-R05, DATA-R02, DATA-R03]
status: design-ready
---

# `DATA-003` — Backup and restore

## 1. Purpose and PRD refs

A restore that has been performed, not merely configured. Realizes `DATA-003`.

The title is the design. Every system has backups; the ones that matter are the
ones somebody has restored from, on a day when nothing was wrong, and timed. A
backup nobody has restored is a file of unknown validity in a location of
unverified permissions, and the moment it is needed is the worst moment to learn
which.

## 2. Layer walkthrough

**Down.** `pg_dump` on a schedule, encrypted, written to a target the
application cannot read back. Nothing clever: the database is small and the
restore path being boring is the feature.

**Up.** `make doctor` reports when the last backup succeeded and when the last
restore was rehearsed. Both, because a green light on the first alone is the
false confidence this design exists to remove.

## 3. Contracts

### Taking one

    pg_dump --format=custom --no-owner --no-privileges

Daily, retained: seven daily, four weekly, twelve monthly. Small enough that the
retention costs nothing and long enough that a corruption discovered a month
later is recoverable.

Encrypted before it leaves the host, with a key that is **not** stored beside the
backups. The target is `BACKUP_TARGET` (`CRED-001`); absent, no backup is taken
and `make doctor` says so rather than the system implying otherwise.

The dump includes `media.bytes`, which is most of the volume. That is the cost of
`DATA-001`'s decision to keep media in the database, and it is the counterpart
benefit: one artefact restores everything.

### Restoring

    make restore-rehearsal

Into a **throwaway database**, never over a live one. It:

1. Fetches the most recent backup and decrypts it.
2. Restores into a fresh database.
3. Asserts the schema matches the current migration head.
4. Asserts row counts within a stated tolerance of live.
5. Prints how long the whole thing took.

Step 5 is the number that matters, because the R-axis asks whether a known-good
state can be restored in fifteen minutes and the only honest answer is a measured
one.

There is no `make restore-production`. Restoring over live data is a deliberate,
manual, documented act with the owner present, and it lives in
`docs/runbooks/data-003-restore.md` rather than behind a command that can be run
by accident.

### The rehearsal is a schedule, not a task

Monthly, and the date of the last successful one is recorded where `make doctor`
reads it. A rehearsal that has not run in two months is reported as a failure of
this feature, not as a missing chore — which is the difference between a control
and an intention.

### What the runbook says

Written to be true rather than plausible: every command in it has been executed
in the rehearsal, in that order, and the timings in it are measured. A runbook
whose commands have never been run is a document that will be read for the first
time by somebody under pressure.

## 4. Integration

**`DATA-001`** is what is backed up, and its migration head is what step 3
asserts against. **`CRED-001`** supplies the target and the key. **`OPS-001`**
decides where this runs, which is why the target is a variable rather than a
choice made here.

## 5. Cross-cutting compliance

- **`SEC-R05`** — the key and the target come from the environment; an absent
  one degrades this feature and says so.
- **`DATA-R02`** — a backup is a copy of personal data and is encrypted at rest,
  and its filename says nothing about its contents.
- **`DATA-R03`** — a backup taken before an erasure still contains the erased
  person. The retention windows above bound that to twelve months, and it is
  stated in `LEGAL-SG-001` rather than left as an unnoticed gap between two
  guarantees.

## 6. Open questions and trade-offs

- **Backups outlive an erasure by up to a year.** Named above because it is the
  honest hole in `DATA-R03` and every system has it. The alternatives are
  re-writing historical backups, which makes them unverifiable, or a short
  retention, which loses the recovery this exists for. What ships is the
  statement and the bound.
- **No point-in-time recovery.** Continuous archiving would cut the worst-case
  loss from a day to minutes. At this size and this write rate, a day of updates
  is a handful of documents whose authors still have them, and PITR is an
  operational surface with its own failure modes.
- **The target is unchosen until `INFRA-DEC-03`.** The mechanism is written
  against a variable, so answering the hosting question configures this rather
  than changing it.

## 7. Task list

- `DATA-003/T1` — A daily dump, encrypted before it leaves the host, to a target from the environment
- `DATA-003/T2` — Seven daily, four weekly, twelve monthly, enforced rather than intended
- `DATA-003/T3` — `make restore-rehearsal` into a throwaway database, asserting schema and row counts, printing the elapsed time
- `DATA-003/T4` — `make doctor` reports the last successful backup and the last successful rehearsal, and fails the second after two months
- `DATA-003/T5` — A restore runbook whose every command was executed in the rehearsal, with measured timings
