#!/usr/bin/env python
"""Hold the roadmap, the ledger and the design graph to one another.

`docs/roadmap.md` is generated, so the thing worth checking is never its
formatting -- it is whether the three inputs still describe one project. Each
invariant below is a way they have been observed to come apart, and each fails
loudly rather than producing a queue that reads fine and sends a session at the
wrong work.

  R1  Every design that is part of the plan has at least one task.
      This is the feasibility test the project is run on: a design that cannot
      be turned into tasks has not been finished, it has been described.
  R2  Every task section resolves to a design.
  R3  Every depth the graph produces falls inside some wave's band.
  R4  No feature depends on a feature in a later wave.
  R5  No dependency cycle outside a declared bootstrap cluster.
  R6  No `Blocked by:` names a task that is closed, or that does not exist.
  R7  The committed roadmap is byte-identical to a fresh generation.
  R8  The active wave is not ahead of a wave that still has buildable work.
  R9  Every wave the policy declares is reachable, and every override names a
      design that exists.

Run: python scripts/validate-roadmap.py
"""

from __future__ import annotations

import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from pathlib import Path  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import lib_roadmap as lr  # noqa: E402

# The generator's filename carries a hyphen, so it cannot be imported by name.
# Loading it by path keeps one implementation of the parse and the emit rather
# than a second copy here that drifts from it -- two parsers of one file is two
# answers waiting to disagree.
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "generate_roadmap", ROOT / "scripts" / "generate-roadmap.py"
)
gen = importlib.util.module_from_spec(_spec)
# Registering before executing is not optional: @dataclass resolves its own
# module out of sys.modules, and a module that is not there yet raises an
# AttributeError from inside dataclasses with nothing to say about the cause.
sys.modules["generate_roadmap"] = gen
_spec.loader.exec_module(gen)

TASKS_FILE = ROOT / "docs" / "tasks.md"
ROADMAP_FILE = ROOT / "docs" / "roadmap.md"

TASK_CODE_RE = re.compile(r"\b([A-Z][A-Z0-9-]*(?:-\d{3})?/T\d+[a-z]?\d*)\b")


def main():
    problems = []
    notes = []

    designs = lr.load_designs()
    policy = lr.load_policy()
    depths = lr.compute_depth_map(designs)
    features = gen.parse_tasks()
    by_code = {f.code: f for f in features}

    planned = {c: fm for c, fm in designs.items() if fm.status in lr.ROADMAP_STATUSES}

    # R1 -- a design that is part of the plan carries tasks.
    for code, fm in sorted(planned.items()):
        f = by_code.get(code)
        if f is None or f.total == 0:
            problems.append(
                "R1 %s is `%s` and has no task in docs/tasks.md — a design that "
                "cannot be turned into tasks has not been finished"
                % (code, fm.status)
            )

    # R2 -- a task section resolves to a design.
    for f in features:
        if f.total and f.code not in designs:
            problems.append(
                "R2 docs/tasks.md carries %s and docs/designs/ has no design for it"
                % f.code
            )

    # R3 -- every depth is covered by a band.
    covered = set()
    for lo, hi in policy.wave_ranges.values():
        covered.update(range(lo, hi + 1))
    for code, d in sorted(depths.items()):
        if d not in covered and code not in policy.wave_overrides:
            problems.append(
                "R3 %s is at depth %d and no wave band covers that depth "
                "(docs/roadmap-policy.yaml)" % (code, d)
            )

    # R4 -- no feature depends on a later wave.
    for code, fm in sorted(planned.items()):
        w = lr.resolve_wave(code, depths.get(code), policy)
        for up in fm.depends_on:
            if up not in planned:
                continue
            wu = lr.resolve_wave(up, depths.get(up), policy)
            if w is not None and wu is not None and wu > w:
                problems.append(
                    "R4 %s is in W%d and depends on %s in W%d — a wave cannot "
                    "depend on a later one" % (code, w, up, wu)
                )

    # R5 -- no cycle outside a declared cluster.
    colour = {}

    def walk(code, stack):
        if colour.get(code) == "done":
            return
        if code in stack:
            cycle = " -> ".join(list(stack[stack.index(code):]) + [code])
            problems.append("R5 dependency cycle outside a cluster: %s" % cycle)
            return
        fm = designs.get(code)
        if fm is None:
            return
        same = (
            [c for c, o in designs.items() if o.cluster and o.cluster == fm.cluster]
            if fm.cluster
            else []
        )
        for up in fm.depends_on:
            if up in same:
                continue
            walk(up, stack + [code])
        colour[code] = "done"

    for code in sorted(planned):
        walk(code, [])

    # R6 -- a blocker names live, existing work.
    all_task_codes = {t.code for f in features for t in f.tasks}
    closed_task_codes = {t.code for f in features for t in f.tasks if t.status == "x"}
    for f in features:
        for t in f.tasks:
            if t.status != "!" or not t.blocker:
                continue
            head = lr._direct_part(t.blocker)
            for named in TASK_CODE_RE.findall(head):
                if named not in all_task_codes:
                    problems.append(
                        "R6 %s is blocked by %s, which is not a task in the ledger"
                        % (t.code, named)
                    )
                elif named in closed_task_codes:
                    problems.append(
                        "R6 %s is blocked by %s, which is closed — the blocker "
                        "cleared and the row still says it did not"
                        % (t.code, named)
                    )

    # R7 -- the committed roadmap is what the generator produces.
    if not ROADMAP_FILE.exists():
        problems.append("R7 docs/roadmap.md does not exist — run make roadmap")
    else:
        fresh = gen.emit(features)
        on_disk = ROADMAP_FILE.read_text(encoding="utf-8")
        if fresh != on_disk:
            problems.append(
                "R7 docs/roadmap.md differs from a fresh generation — it was "
                "edited by hand or the ledger moved under it; run make roadmap"
            )

    # R8 -- the active wave is not ahead of unfinished buildable work.
    def buildable_in(wid):
        n = 0
        for f in features:
            fm = designs.get(f.code)
            if fm is None or lr.is_excluded_from_exit(fm):
                continue
            if lr.resolve_wave(f.code, depths.get(f.code), policy) != wid:
                continue
            for t in f.outstanding:
                if t.status == "!" and t.blocker:
                    k = lr.classify_blocker(t.blocker, wid, designs, depths, policy)
                    if k != "in-graph":
                        continue
                n += 1
        return n

    for wid in sorted(policy.wave_titles):
        if wid >= policy.active_wave:
            break
        left = buildable_in(wid)
        if left:
            problems.append(
                "R8 the policy says W%d is active while W%d still has %d "
                "buildable task(s) — a wave is not left while it can be worked"
                % (policy.active_wave, wid, left)
            )

    # R9 -- the policy names things that exist.
    if policy.active_wave not in policy.wave_titles:
        problems.append(
            "R9 active_wave is W%d and no such wave is declared"
            % policy.active_wave
        )
    for code, wid in sorted(policy.wave_overrides.items()):
        if code not in designs:
            problems.append("R9 wave_overrides names %s, which has no design" % code)
        elif wid not in policy.wave_titles:
            problems.append(
                "R9 wave_overrides puts %s in W%d, which is not declared"
                % (code, wid)
            )

    for wid in sorted(policy.wave_titles):
        if not any(
            lr.resolve_wave(f.code, depths.get(f.code), policy) == wid
            for f in features
            if f.code in designs and not lr.is_excluded_from_exit(designs[f.code])
        ):
            notes.append("W%d is declared and nothing sits in it" % wid)

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1

    total = sum(f.total for f in features)
    closed = sum(f.closed for f in features)
    print(
        "roadmap: %d features, %d tasks, %d closed, %d outstanding; "
        "%d wave(s), active W%d — every design has tasks, every task has a "
        "design, no wave depends on a later one."
        % (
            len([f for f in features if f.total]),
            total,
            closed,
            total - closed,
            len(policy.wave_titles),
            policy.active_wave,
        )
    )
    for line in notes:
        print("  note: %s" % line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
