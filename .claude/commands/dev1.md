---
description: Roadmap-driven task-closure loop for VALO Tech (single-lane, self-scheduling)
argument-hint: "[valotech] — omit inside a VALO Tech window"
---

ITERATIVE ROADMAP-DRIVEN TASK CLOSURE — VALO Tech

One repository, one lane, one loop. Each iteration is an independent cold start
bound by `.claude/CLAUDE.md`: nothing is remembered between iterations, and
everything the next one needs lives in `docs/tasks.md`, `docs/roadmap.md`,
`docs/decisions-log.md` and `docs/dev1-iter-log.md`. That is why the loop
survives compaction, a crash, and a week of not being run.

═══ 0. RESOLVE + ANCHOR ═══

This file is committed, so it must not hardcode an absolute path — derive
everything at runtime.

  With **no argument**, in a VALO Tech window:
    REPO_ROOT := `git rev-parse --show-toplevel`.
  With the argument `valotech`, from the shared multi-root workspace where the
  OS working directory is a *different* sibling repository:
    WORKSPACE := `dirname "$(git rev-parse --show-toplevel)"`
    REPO_ROOT := `<WORKSPACE>/VALOTech`

FAIL CLOSED. REPO_ROOT must contain `docs/roadmap.md`, `docs/tasks.md` and
`.claude/CLAUDE.md`. If it does not, or the argument names something else, HARD
STOP — never fall back to the window's own repository, because a loop that
commits to the wrong repo is discovered by somebody else, later.

ANCHOR. The working directory is very often another repository, so:
  - every git command is `git -C "<REPO_ROOT>" …`; a bare `git` stages the
    wrong repo and there is no warning when it does;
  - every path you read, write or stage is absolute, under REPO_ROOT;
  - gates run as `make -C "<REPO_ROOT>" <target>`;
  - sibling VALO repositories are readable for ecosystem reference and are
    never written, staged or committed.

Announce the resolution before the first write:
`dev1: VALOTech (<explicit arg | detected from cwd>)`.

SUPREMACY. Read `<REPO_ROOT>/.claude/CLAUDE.md` now. Where it and this file
disagree, it wins — stop and report the conflict. Do not carry another
repository's rule codes into this one; this repository has no money, no ledger,
no members and no moderation, and importing `COIN-R01` or `TS-R01` here would
be citing a rule that does not exist.

═══ START GATE ═══

1. `git -C "<REPO_ROOT>" branch --show-current` must be `development`.
   Anything else is a HARD STOP: branch switching is the owner's (§11.2).

2. PHANTOM INDEX. `git -C "<REPO_ROOT>" diff --cached --stat`. Anything already
   staged at iteration start is a previous crash's residue or another window's
   work — `git -C "<REPO_ROOT>" restore --staged <path>` each one before you
   author anything, and never commit an entry you did not stage yourself.
   Then `git -C "<REPO_ROOT>" status --porcelain`: unknown uncommitted work
   the owner has not acknowledged is a HARD STOP.

3. PULL. `cd "<REPO_ROOT>" && bash scripts/sync.sh pull`. Exit 3 is a true fork
   — HARD STOP and ask (§11.2). Never rebase, reset or force past one.

4. GATE. `make -C "<REPO_ROOT>" check`. A failure in what a previous iteration
   left behind is fixed before new work opens. A failure confined to another
   window's in-flight edit is logged and left to that window.

5. STUCK LOOP. `tail -40 "<REPO_ROOT>/docs/dev1-iter-log.md"`. If the last
   three entries all carry a non-`CLOSED` `OUTCOME:` with the same `REASON:`,
   HARD STOP and escalate — the project is stuck, not the loop.

6. PRIOR-ITERATION INTEGRITY. The last log entry names a task and an outcome;
   compare against `git -C "<REPO_ROOT>" log --oneline -5`. A `CLOSED` claim
   with no matching commit is a crash inside the add-to-commit window: finish
   and commit it if the residue is sound and complete, otherwise unstage it and
   reopen the task `[~]` with a recovery `Note:`.

═══ 1. PICK BATCH ═══

`docs/roadmap.md` is the queue and it is pre-computed. Do not re-derive
selection by grepping the ledger — that reinvents what the generator already
did, and does it worse under time pressure. If the file is absent or
unparseable, regenerate it first: `make -C "<REPO_ROOT>" roadmap`.

Walk it top to bottom, honouring its own contract: waves in order, active wave
first; within a wave, features by depth; within a feature, `[~]` before `[ ]`
before `[!]`. Stay in the active wave while it has buildable work; descend only
when everything left in it is external residue or waiting on the owner.

**Re-confirm each candidate against `docs/tasks.md`** before taking it — the
roadmap can be one regeneration behind, and another window may have closed it.

**Batch one to five tasks that can close together.** The expensive steps are
per-iteration, not per-task: the start gate, the browser, the gate run, the
axis review. Running one batch across them amortises all of it. Prefer members
of the same design or the same surface, because one verification covers them;
independent but non-conflicting tasks are fine as padding. Avoid only pairs
that interfere — two touching the same surface incompatibly, or a correctness
coupling where closing them together risks a wrong result. Aim for three, cap
at five, and never stall hunting for a third.

A blocker is not an automatic skip. Classify it, as the roadmap already has:
  - **external residue** — build the mechanism ahead of it and leave only what
    the owner must physically supply. Skip only when nothing buildable remains.
  - **pending-decision** — cannot be built ahead. If it is not already an OPEN
    entry in `docs/decisions-log.md`, file it there as a full §1.11 hand-off
    with its safe default, link the anchor from the log's `NEXT:` line, and
    descend. An unfiled decision does not exist, so filing it is part of the
    skip and not a follow-up.
  - **in-graph** — the blocker ships first; the descent will reach it.

TRIAGE per §15. Critical tier here is auth, a non-additive migration, anything
that sends mail to a real investor, anything that changes what the live gateway
says, and infrastructure. Use `critical-impl` to build and `deep-review` for
the axis pass; if neither is available, leave the task and descend, and HARD
STOP only when every remaining candidate is Critical.

Announce: `This iter: <CODE>/T<a..b> (N tasks) — <one-line goal>. Tier: <…>`

═══ 2. CONTEXT ═══

Read the PRD section, the design in full, each `depends_on` design's
frontmatter and §3 Contracts, and each `depended_by` design's frontmatter. Then
grep the code. Fill the discovery template — FEATURE / PRD REFS / DEPENDS ON /
DEPENDED BY / EXISTS / PARTIAL / MISSING / REUSE / UNKNOWNS — and resolve every
UNKNOWN before proposing anything. Guessing is a §1.7 violation.

For a defect, this is §4.1 instead: reproduce it deterministically, then
capture the error, the reproduction, the environment and expected-versus-actual.

═══ 3. PROPOSE + SELF-CRITIQUE ═══

At least one alternative, then seven lenses — simplicity, failure modes, scale,
security, data, performance, what is missing — over at least two rounds. For a
defect, root cause five levels down rather than the first plausible one.

═══ 4. IMPLEMENT ═══

Members in dependency order. Stage each artefact immediately after editing it,
by explicit absolute path — never `-A`, never `.`, never `-a`, because a bare
add in this workspace stages whichever repository the shell is sitting in. Do
not run gates between editing and staging. Never leave an artefact unstaged for
more than a few minutes: the tree is shared.

Hold the commits until the batch verification below is green. The batch, not a
single task, is the uncommitted unit; a crash mid-batch is recovered by START
GATE 6.

═══ 5. VERIFY — ONCE PER BATCH ═══

**Anything the reader can see is verified in a browser, not in the source.**
Start `make -C "<REPO_ROOT>" serve` — it sends `Cache-Control: no-store`, which
plain `http.server` does not, and a cached stylesheet has twice produced a
measurement describing a file that was not running. Then drive the page: set
the viewport, scroll to the position, wait for the scroll to actually land and
the scene to settle, and read the value. Four of this repository's wrong
conclusions came from a probe rather than from the page, so when a measurement
disagrees with what is on the screen, the measurement is wrong until it is
explained.

Once application code exists, `npm --prefix "<REPO_ROOT>/apps/web" test` covers
the batch in one run. Until it does, `make -C "<REPO_ROOT>" check` plus the
browser is the whole verification, and inventing a test file to have something
to cite is worse than citing the measurement honestly.

Ask of every test: if the implementation were silently wrong, would this
notice? If the answer is "maybe not", tighten the assertion.

═══ 6. DOCUMENT ═══

Same commit, original voice (§1.9) — no "previously X, now Y", no "fix for
finding N". Update the PRD if a rule changed, the design if a contract changed,
`docs/tasks.md` for `Evidence:`, `env.example` and `docker-compose.yml` if
configuration changed, and the twenty locale catalogues if any string a reader
sees was added or altered.

A defect found in passing is corrected in the artefact that owns it and named
in the commit message (§12) — not filed as a finding, because nothing here has
an audience yet. That changes at `OPS-001`.

═══ 7. AXIS REVIEW ═══

Six axes: coherence, layer integration, technical standards, legal, experience,
reversibility. Re-grep every path you cite and re-run every test you cite —
a citation that resolved when you wrote it may not now. Critical tier: hand
this pass to `deep-review`.

═══ 8. CLOSE + COMMIT ═══

One commit per batch member, in dependency order. Per member: flip the row to
`[x]` with `Evidence:` naming something that exists; run the gates over the
touched subset; stage by explicit path; re-read `git -C "<REPO_ROOT>" diff
--cached --name-only` for anything another window staged; then commit with
`-F <file>` rather than `-m`, because a subject containing a backtick is
executed by the shell and `--amend` is forbidden (§1.2).

    <type>(<CODE>/T<N>): <subject, imperative, no period, ≤70 chars>

    <why, wrapped at 72, carrying the measurement>

    Refs: <CODE>/T<N>
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

Push after every commit: `cd "<REPO_ROOT>" && bash scripts/sync.sh auto-push`.
That is standing authorization for this loop and for `development` only.

ROADMAP REGENERATION — run `make -C "<REPO_ROOT>" roadmap` and commit
`chore(roadmap): regen after <N>` when five or more tasks have closed since the
last regeneration, when an iteration idles because the index was stale, or when
the owner asks. The gate refuses a roadmap that differs from a fresh
generation, so this is not optional bookkeeping.

═══ 9. REPORT + LOG ═══

The honest report (§1.7), then one entry appended to
`<REPO_ROOT>/docs/dev1-iter-log.md`:

    ## <ISO date> · <CODE>/T<a..b> (N tasks) · iter <N>
    STATUS: green|yellow|red · TIER: S|C|B · OUTCOME: CLOSED|IDLE|STOP
    REASON: <CLOSED → —; otherwise one stable phrase, reused verbatim when the
             same condition recurs so the three-in-a-row guard can fire>
    WHAT CHANGED: <artifacts | — none —>
    NEXT: <one line>

`CLOSED` means at least one task moved to `[x]`. `IDLE` is soft and
recoverable — the index was stale and the loop re-fires. `STOP` ends the loop.

PRUNE in the same edit: keep the newest twenty entries, and only after every
durable fact in the ones you delete already lives in `docs/tasks.md`,
`docs/decisions-log.md` or `docs/operator-checklist.md` (§13.1). `git log -p`
is the archive. `make check` fails above twenty.

═══ STOP CONDITIONS ═══

HARD STOP — post the report and a decision menu, do not re-fire:
  - the argument resolves to no dev1-ready repository;
  - the branch is not `development`;
  - uncommitted work nobody has acknowledged;
  - `scripts/sync.sh pull` reports a fork;
  - a gate fails outside this iteration's scope in a way one clearly-safe line
    cannot fix;
  - the only way forward is destructive or irreversible (§1.2, §14);
  - every open task across every wave has no buildable mechanism left — true
    global exhaustion, which a single-wave scan does not establish;
  - the last three log entries share a non-`CLOSED` outcome and reason.

SOFT IDLE — not a stop. Every candidate walked was already closed by another
window, or every clean candidate's files are being edited concurrently.
Regenerate the roadmap, log `OUTCOME: IDLE`, re-fire.

**Context budget is never a stop reason** (§1.8). The state lives in files; the
next cold start continues from it.

═══ CADENCE ═══

An iteration that ends `CLOSED` or `IDLE` schedules the next with
ScheduleWakeup at `delaySeconds = 120`, measured from when this one ends, and
re-fires this command with the same argument. Do not wrap it in `/loop` — that
imposes its own much longer interval. A HARD STOP does not re-fire.
