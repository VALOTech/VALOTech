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

## 2026-09-07 · bootstrap · iter 0
STATUS: green · TIER: S · OUTCOME: CLOSED
REASON: —
WHAT CHANGED: the loop itself — `.claude/commands/dev1.md`, the two Critical-tier agents, `scripts/sync.sh`, the roadmap machinery (`lib_roadmap.py`, `generate-roadmap.py`, `validate-roadmap.py`, `docs/roadmap-policy.yaml`), and six gates that did not exist: brand-kit parity, evidence citation, deferral maturity, identifier allocation, comment hygiene and the cp1252 stream guard.
NEXT: the ledger carries twenty-five feature codes with no design. `validate-roadmap.py` R2 names every one of them, and until they exist the roadmap cannot order the work they describe.
