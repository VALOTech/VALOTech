# dev1 iteration log

> **Not for `main`.** This file lives on `development` only (`.claude/CLAUDE.md` §1.1).

Working state, not an archive. Each iteration of `/dev1` appends one entry and
prunes the oldest until **twenty** remain — the bound is held by
`scripts/check-log-retention.py` and the reason it is safe is §13.1: an entry
is deleted only once every durable fact in it already lives in its permanent
home, which is `docs/tasks.md` for task state, `docs/decisions-log.md` for a
choice, and `docs/operator-checklist.md` for something waiting on a person.
`git log -p docs/dev1-iter-log.md` is the archive, so a pruned entry is
recoverable verbatim and no second copy is kept here.

A cold start reads the tail of this file to find out where the last one
stopped. `OUTCOME:` is fixed vocabulary so that reading can be mechanical:
`CLOSED` when at least one task moved to `[x]`, `IDLE` when the queue was
stale and the loop re-fires, `STOP` when it ended and the owner is needed.
`REASON:` on a non-`CLOSED` entry is one stable phrase, reused verbatim when
the same condition recurs, so three of them in a row can be detected rather
than noticed.

---

## 2026-09-07 · DATA-001/T1-T2 + INFRA-001/T3-T4 (4 tasks) · iter 4
STATUS: green · TIER: C · OUTCOME: CLOSED
REASON: —
WHAT CHANGED: the greenfield application scaffold. apps/web is a Next.js 16 + node-pg-migrate + Kysely + Vitest project (INFRA-DEC-06); the accounts table migration matches DATA-001 and carries an `updated_at` trigger; a drift guard holds the hand-written Kysely types to the migration column by column (mutation-proved). `make migrate`/`migrate-down`/`migrate-roundtrip` wired, the round-trip on a throwaway scratch database. critical-impl authored the scaffold, deep-review returned it red, and its findings were fixed: the round-trip no longer drops the developer's data (F1), the premature unscoped Kysely connection was dropped to land with the first query (F2/F5/F12), the drift guard now catches type/nullability/default/uniqueness drift and no longer trips on a legitimate constraint (F3/F13), a CI job runs it (F4), the register names the real guard (F11), gitleaks stops blanket-allowing env.example (F10), and the citext privilege is on the operator checklist (F15). Verified by running: npm install/typecheck/test on Node 24, and the migration round-trip against PostgreSQL 17.11.
NEXT: DATA-001/T3-T12 (sessions, content, grants, audit, ...) and INFRA-001/T5 are unblocked — the tool is wired, each is a migration in the established form. The next iteration writes the next tables.

## 2026-09-07 · INFRA-001/T1 (1 task) · iter 3
STATUS: green · TIER: S · OUTCOME: CLOSED
REASON: —
WHAT CHANGED: INFRA-001/T1 closed — brought the compose stack up (PostgreSQL 17.11, health `healthy` at t+16s, host 5434, named volume), verified by running rather than asserting, then `make infra-reset` with no residue. The application build past this is gated on a first-of-class stack choice — migration tool + query layer + test runner — so filed `INFRA-DEC-06` OPEN and blocked `DATA-001/T1-12` and `INFRA-001/T3-5` on it. Fixed `check-evidence-citation` reading a task code (`INFRA-001/T3`) as a file path (mutation-proved it still catches a real broken path).
NEXT: `INFRA-DEC-06` answered — **A** (node-pg-migrate + Kysely + Vitest/Playwright). Frontier reopened: `DATA-001/T1` is buildable. Next iteration scaffolds the Next.js app on that stack and wires the migration tool — Critical-tier (infra + schema), via `critical-impl` + `deep-review`.

## 2026-09-07 · go-live prep · iter 2
STATUS: green · TIER: S · OUTCOME: CLOSED
REASON: —
WHAT CHANGED: the three owner decisions answered — AWS (`INFRA-DEC-03`/`INFRA-DEC-05` loop-settled to ECS Fargate + RDS), SMTP against the company mailbox (`MAIL-DEC-01`), the ecosystem's own consent posture (`OPS-DEC-01`). `OPS-001`, both `MAIL` designs and `LEGAL-GLOBAL-002` rewritten around the answers, no longer pending-decision. `SITE-006` added (legal pages + banner). Six `[!]` rows unblocked. Two new gates — `check-doc-paths` (5 dangling citations found) and `check-env-catalogue` (found the 3000/3100 port collision with VALO Ads and 4 vars missing from env.example). CI now runs `make check` split by ref. README rewritten to be true on both branches.
NEXT: framework and go-live prep complete; the register is empty and every gate is green. The 248 open tasks are application code for `/dev1 valotech` to work from W0, which is a cold-start loop and does not depend on this window. Six items wait on the owner in `docs/operator-checklist.md`, none blocking.

## 2026-09-07 · design wave · iter 1
STATUS: green · TIER: S · OUTCOME: CLOSED
REASON: —
WHAT CHANGED: thirty-six designs written in dependency order, so every one of the fifty PRD codes now has one. `DATA-001` rewritten around a single content model. The ledger grew from 112 to 283 rows, every one of them derived from a design's own §7 by `scripts/sync-tasks-from-designs.py` rather than copied by hand. `docs/roadmap.md` is now generated from the graph, in five waves.
NEXT: W0 is active and has twenty-two buildable tasks. `INFRA-001/T3` is the top of the queue: the make targets for the stack and the three migration commands. Three decisions wait on the owner and none of them blocks W0.

## 2026-09-07 · bootstrap · iter 0
STATUS: green · TIER: S · OUTCOME: CLOSED
REASON: —
WHAT CHANGED: the loop itself — `.claude/commands/dev1.md`, the two Critical-tier agents, `scripts/sync.sh`, the roadmap machinery (`lib_roadmap.py`, `generate-roadmap.py`, `validate-roadmap.py`, `docs/roadmap-policy.yaml`), and six gates that did not exist: brand-kit parity, evidence citation, deferral maturity, identifier allocation, comment hygiene and the cp1252 stream guard.
NEXT: the ledger carries twenty-five feature codes with no design. `validate-roadmap.py` R2 names every one of them, and until they exist the roadmap cannot order the work they describe.
