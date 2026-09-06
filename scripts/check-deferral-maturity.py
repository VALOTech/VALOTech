#!/usr/bin/env python
"""A blocker must name something a machine can check, and must still be true.

A `Blocked by:` line is written once, at the single moment it is true, and read
by nobody afterwards. That is the whole defect class: the credential arrives,
the decision is answered, the task it waited on closes -- and the row goes on
saying it is blocked, so the roadmap keeps a buildable task out of the queue
and a session that reaches it re-derives a blocker that cleared weeks ago.

So a blocker is held to a grammar, and then to reality.

  Blocked by: <CODE>/T<N> — ...          in-graph: the task must exist and be open
  Blocked by: pending-decision: <CODE> — ...  the decision must exist and be OPEN
  Blocked by: pending-external: <what> — ...  must name what ends it

Prose describing a state of the world -- "when the mail carrier is chosen",
"once the room is built" -- reads as a signal and is one only to a person who
already knows where to look. It cannot be checked, so it is not one.

`scripts/validate-roadmap.py` R6 holds the in-graph form. This holds the other
two, and the direction that costs the most: a blocker whose stated cause has
already gone.

Run: python scripts/check-deferral-maturity.py
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS = os.path.join(ROOT, "docs", "tasks.md")
REGISTER = os.path.join(ROOT, "docs", "decisions-log.md")

TASK_RE = re.compile(r"^- \[([ x~!])\]\s+(\S+)\s+—")
BLOCKED_RE = re.compile(r"^\s*Blocked by:\s*(.+?)\s*$")
DEC_CODE_RE = re.compile(r"\b([A-Z][A-Z0-9-]*-DEC-\d{2})\b")

# The head of the line, before the prose that explains it.
def head(text):
    cut = len(text)
    for sep in (" — ", " -- ", ". "):
        i = text.find(sep)
        if 0 <= i < cut:
            cut = i
    return text[:cut]


def register_states():
    """Every decision code in the register, mapped to OPEN or its closed token."""
    if not os.path.exists(REGISTER):
        return {}
    with io.open(REGISTER, encoding="utf-8") as fh:
        text = fh.read()
    out = {}
    for m in re.finditer(r"^### `([^`]+)`.*?—\s*(OPEN|RESOLVED|RATIFIED|WITHDRAWN)",
                         text, re.M):
        out[m.group(1)] = m.group(2)
    return out


def main():
    with io.open(TASKS, encoding="utf-8") as fh:
        lines = fh.read().splitlines()

    states = register_states()
    problems = []
    current = None
    seen = 0

    for raw in lines:
        m = TASK_RE.match(raw)
        if m:
            current = (m.group(1), m.group(2))
            continue
        m = BLOCKED_RE.match(raw)
        if not m or current is None:
            continue
        status, code = current
        body = m.group(1)
        h = head(body)
        seen += 1

        if status != "!":
            problems.append(
                "%s carries `Blocked by:` and is marked `[%s]`, not `[!]`"
                % (code, status)
            )

        if "pending-decision:" in h.lower():
            # A row names its decision three times -- the token, the link
            # text and the link target -- so the raw findall reports one
            # defect three times and a reader counts three defects.
            named = sorted(set(DEC_CODE_RE.findall(body)))
            if not named:
                problems.append(
                    "%s is blocked on a decision and names no `<DOMAIN>-DEC-NN` "
                    "entry — a choice filed nowhere cannot be answered" % code
                )
            for dec in named:
                if dec not in states:
                    problems.append(
                        "%s cites %s, which is not an entry in "
                        "docs/decisions-log.md" % (code, dec)
                    )
                elif states[dec] != "OPEN":
                    problems.append(
                        "%s is blocked on %s, which the register settled "
                        "(%s) — the blocker cleared and the row still says it "
                        "did not" % (code, dec, states[dec])
                    )
            continue

        if "pending-external:" in h.lower():
            if "unblocks when" not in body.lower():
                problems.append(
                    "%s is blocked on an external actor and never says what "
                    "ends it — add `Unblocks when: <signal>`" % code
                )
            continue

        # Neither token: the head must then name a task code, which R6 checks.
        if not re.search(r"\b[A-Z][A-Z0-9-]*(?:-\d{3})?/T\d+", h):
            problems.append(
                "%s names no task, no decision and no external class — a "
                "blocker in prose is not a signal anything can read" % code
            )

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1
    print("deferrals: %d blocker(s), every one names a live, checkable cause." % seen)
    return 0


if __name__ == "__main__":
    sys.exit(main())
