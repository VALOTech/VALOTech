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
