#!/usr/bin/env python
"""Generate docs/roadmap.md from the task ledger and the design graph.

The roadmap is not a document somebody maintains. It is the task ledger read
in the order the dependency graph says the work can be done, and it is
regenerated rather than edited -- a hand-kept ordering drifts from the ledger
the first time a task closes and nobody notices, and a session that trusts it
then works on something already finished or something not yet buildable.

What it computes:

  wave    from the design's topological depth, banded by docs/roadmap-policy.yaml
  order   within a wave, by depth then code; within a feature, [~] then [ ] then [!]
  state   from docs/tasks.md, which is the only source of truth for a task

Closed tasks are omitted and a fully-closed feature collapses to one line, so
the file is the queue rather than the archive.

Output is byte-reproducible: the same inputs always produce the same bytes, so
a regeneration that changes nothing shows an empty diff and a regeneration that
changes something shows exactly what.

Run: python scripts/generate-roadmap.py
"""

from __future__ import annotations

import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from dataclasses import dataclass, field  # noqa: E402
from pathlib import Path  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import lib_roadmap as lr  # noqa: E402

TASKS_FILE = ROOT / "docs" / "tasks.md"
OUT_FILE = ROOT / "docs" / "roadmap.md"

FEATURE_RE = re.compile(r"^## ([A-Z][A-Z0-9-]*-\d{3})\s+·\s+(.+?)\s*$")
TASK_RE = re.compile(
    r"^- \[([ x~!])\]\s+([A-Z][A-Z0-9-]*(?:-\d{3})?/T\d+[a-z]?\d*)\s+—\s+(.+?)\s*$"
)
META_RE = re.compile(r"^\s*(Note|Blocked by|Evidence|Impact to|Refer to):\s*(.*)$")


@dataclass
class Task:
    code: str
    status: str
    title: str
    blocker: str = ""
    note: str = ""


@dataclass
class Feature:
    code: str
    title: str
    tasks: list = field(default_factory=list)

    @property
    def closed(self):
        return sum(1 for t in self.tasks if t.status == "x")

    @property
    def total(self):
        return len(self.tasks)

    @property
    def outstanding(self):
        return [t for t in self.tasks if t.status != "x"]


def parse_tasks():
    """Every feature section and its rows, in file order."""
    features = []
    feature = None
    task = None
    for raw in TASKS_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        m = FEATURE_RE.match(line)
        if m:
            feature = Feature(code=m.group(1), title=m.group(2).strip())
            features.append(feature)
            task = None
            continue
        if line.startswith("## "):
            # A non-feature heading ends the current section, so prose after
            # the last feature cannot be read as more of its rows.
            feature = None
            task = None
            continue
        m = TASK_RE.match(line)
        if m and feature is not None:
            task = Task(status=m.group(1), code=m.group(2), title=m.group(3).strip())
            feature.tasks.append(task)
            continue
        m = META_RE.match(raw)
        if m and task is not None:
            kind, value = m.group(1).lower(), m.group(2).strip()
            if kind == "blocked by":
                task.blocker = value
            elif kind == "note":
                task.note = value
    return features


def marker(s):
    return {" ": "[ ]", "x": "[x]", "~": "[~]", "!": "[!]"}.get(s, "[?]")


def order(s):
    # In-progress first: an unfinished task costs more left open than a new
    # one costs unopened.
    return {"~": 0, " ": 1, "!": 2}.get(s, 3)


def trim(text, n=120):
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


_LINK_RE = re.compile(r"\]\((?!https?://|#)([^)]+)\)")


def rebase(text, frm, to):
    """Re-base a relative markdown link copied from another file's directory."""

    def repl(m):
        path, sep, frag = m.group(1).partition("#")
        if not path or path.startswith("/"):
            return m.group(0)
        rel = os.path.relpath((frm / path).resolve(), to).replace(os.sep, "/")
        return "](%s%s%s)" % (rel, sep, frag)

    return _LINK_RE.sub(repl, text)


def emit(features):
    policy = lr.load_policy()
    designs = lr.load_designs()
    depths = lr.compute_depth_map(designs)

    waves, excluded, orphans = {}, [], []
    for f in features:
        if f.total == 0:
            continue
        fm = designs.get(f.code)
        if fm is None:
            orphans.append(f)
            continue
        if lr.is_excluded_from_exit(fm):
            excluded.append((f, fm))
            continue
        w = lr.resolve_wave(f.code, depths.get(f.code), policy)
        if w is None:
            excluded.append((f, fm))
            continue
        waves.setdefault(w, []).append(f)

    out = []
    out.append("# VALO Tech — roadmap")
    out.append("")
    out.append(
        "> **Generated** by `scripts/generate-roadmap.py` from "
        "[docs/tasks.md](tasks.md), the design graph under "
        "[docs/designs/](designs/) and [docs/roadmap-policy.yaml]"
        "(roadmap-policy.yaml). Do not edit it: the next regeneration "
        "discards the edit, and until then the queue disagrees with the "
        "ledger. To change the order, change the dependency or the policy."
    )
    out.append("")
    out.append(
        "> **Not for `main`.** This file lives on `development` only "
        "(`.claude/CLAUDE.md` §1.1)."
    )
    out.append("")
    out.append(
        "Ordering only. What each task *is* lives in [docs/tasks.md](tasks.md); "
        "why the product wants it lives in [docs/PRD.md](PRD.md). Nothing is "
        "restated here. A wave is a band of the dependency graph's depth: "
        "everything in `W(n)` can be built once `W(n-1)` stands. Within a "
        "wave, features are ordered by depth and tasks by state — in-progress "
        "first, then open, then blocked. Closed tasks are omitted."
    )
    out.append("")
    active = policy.active_wave
    out.append(
        "**Active wave: W%d — %s**"
        % (active, policy.wave_titles.get(active, "unknown"))
    )
    out.append("")

    total_open = sum(len(f.outstanding) for fs in waves.values() for f in fs)
    total_all = sum(f.total for fs in waves.values() for f in fs)
    out.append(
        "_%d tasks in the plan, %d closed, %d outstanding._"
        % (total_all, total_all - total_open, total_open)
    )
    out.append("")
    out.append("---")
    out.append("")

    for wid in sorted(policy.wave_titles):
        flag = " · **ACTIVE**" if wid == active else ""
        out.append("## W%d — %s%s" % (wid, policy.wave_titles[wid], flag))
        out.append("")
        summary = policy.wave_summaries.get(wid)
        if summary:
            out.append("_%s_" % summary)
            out.append("")
        if wid not in waves:
            out.append("_(nothing in the ledger sits in this wave)_")
            out.append("")
            continue

        closed = sum(f.closed for f in waves[wid])
        rows = [t for f in waves[wid] for t in f.outstanding]
        kinds = {"external": 0, "pending-decision": 0, "cross-wave-parked": 0}
        for t in rows:
            if t.status == "!" and t.blocker:
                k = lr.classify_blocker(t.blocker, wid, designs, depths, policy)
                if k in kinds:
                    kinds[k] += 1
        buildable = len(rows) - sum(kinds.values())
        total = closed + len(rows)
        pct = 100 * closed // total if total else 0
        out.append(
            "_%d/%d closed (%d%%) · %d outstanding — %d buildable now · "
            "%d waiting on the owner · %d external residue · %d parked to a "
            "later wave._"
            % (
                closed,
                total,
                pct,
                len(rows),
                buildable,
                kinds["pending-decision"],
                kinds["external"],
                kinds["cross-wave-parked"],
            )
        )
        out.append("")

        for f in sorted(waves[wid], key=lambda f: (depths.get(f.code, 999), f.code)):
            if not f.outstanding:
                out.append(
                    "- **%s** · %s — %d/%d closed"
                    % (f.code, f.title, f.closed, f.total)
                )
                continue
            out.append(
                "- **%s** · %s — %d/%d closed · depth %s"
                % (f.code, f.title, f.closed, f.total, depths.get(f.code, "?"))
            )
            for t in sorted(f.outstanding, key=lambda t: (order(t.status), t.code)):
                line = "  - `%s %s` — %s" % (marker(t.status), t.code, trim(t.title))
                if t.status == "!" and t.blocker:
                    k = lr.classify_blocker(t.blocker, wid, designs, depths, policy)
                    b = rebase(t.blocker, TASKS_FILE.parent, OUT_FILE.parent)
                    line += "  · _%s_ · **Blocked by:** %s" % (k, trim(b, 150))
                elif t.status == "~" and t.note:
                    n = rebase(t.note, TASKS_FILE.parent, OUT_FILE.parent)
                    line += "  · **Note:** %s" % trim(n, 150)
                out.append(line)
            out.append("")

    if excluded:
        out.append("## Outside the waves")
        out.append("")
        out.append(
            "_A design whose status is `pending-decision`, `pending-external` "
            "or `deprecated` takes no wave, so a feature waiting on the owner "
            "cannot hold a wave open. Its tasks stay claimable the moment the "
            "blocker clears._"
        )
        out.append("")
        for f, fm in sorted(excluded, key=lambda pair: pair[0].code):
            out.append(
                "- **%s** · %s — status `%s` · %d/%d closed · %d outstanding"
                % (f.code, f.title, fm.status, f.closed, f.total, len(f.outstanding))
            )
        out.append("")

    if orphans:
        out.append("## In the ledger with no design")
        out.append("")
        out.append(
            "_These carry tasks and resolve to no design, so they have no "
            "wave and no order. Either the design is missing or the section "
            "is. `scripts/validate-roadmap.py` fails on this._"
        )
        out.append("")
        for f in orphans:
            out.append("- **%s** · %s — %d task(s)" % (f.code, f.title, f.total))
        out.append("")

    return "\n".join(out).rstrip("\n") + "\n"


def main():
    body = emit(parse_tasks())
    # newline="" keeps the "\n" the emitter wrote. Without it Python translates
    # on write, a Windows box lands CRLF in the working tree, .gitattributes
    # normalises it back to LF on the way into the index -- and the file then
    # reads as modified after every regeneration with an empty diff, which is
    # the shape a real pending change hides behind.
    OUT_FILE.write_text(body, encoding="utf-8", newline="")
    print("roadmap: %s" % OUT_FILE.relative_to(ROOT), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
