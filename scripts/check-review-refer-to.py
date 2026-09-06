#!/usr/bin/env python
"""Hold both halves of the edge between a REVIEW row and the work it bears on.

A finding is bound to the task it corrects without being merged into it: the
REVIEW row carries `Impact to:` and the task it names carries `Refer to:` back.
The edge is written from both ends because a one-way edge rots on the side
nobody reads -- a task silently corrected by a finding its own row never
mentions is picked up by a lane that never learns the finding exists.

Also checks what a row must carry to be actionable at all: a closed row needs
Evidence, an in-progress row needs a Note, a blocked row needs a blocker.

Run: python scripts/check-review-refer-to.py
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS = os.path.join(ROOT, "docs", "tasks.md")

ROW = re.compile(r"^- \[([ x~!])\] ([A-Z][A-Z0-9-]*(?:/T\d+)?) — (.+)$")
FIELD = re.compile(r"^\s{2,}([A-Za-z][A-Za-z ]*):\s*(.*)$")
TASK_REF = re.compile(r"\b([A-Z][A-Z0-9-]*/T\d+)\b")


def read(path):
    with io.open(path, encoding="utf-8") as handle:
        return handle.read()


def rows(text):
    """Every task row with its marker and the fields indented under it."""
    out, current = [], None
    for line in text.split("\n"):
        match = ROW.match(line.rstrip())
        if match:
            current = {"marker": match.group(1), "id": match.group(2),
                       "title": match.group(3), "fields": {}}
            out.append(current)
            continue
        if current is not None:
            field = FIELD.match(line.rstrip())
            if field:
                key = field.group(1).strip()
                current["fields"][key] = current["fields"].get(key, "") + field.group(2)
            elif line.strip() and not line.startswith("  "):
                current = None
    return out


def main():
    if not os.path.exists(TASKS):
        print("tasks: docs/tasks.md does not exist yet; nothing to check.")
        return 0

    problems = []
    all_rows = rows(read(TASKS))
    by_id = {r["id"]: r for r in all_rows}
    reviews = [r for r in all_rows if r["id"].startswith("REVIEW/")]

    for row in all_rows:
        marker, rid = row["marker"], row["id"]
        fields = row["fields"]
        if marker == "x" and not fields.get("Evidence", "").strip():
            problems.append("%s is closed with no Evidence" % rid)
        if marker == "~" and not fields.get("Note", "").strip():
            problems.append("%s is in progress with no Note" % rid)
        if marker == "!" and not fields.get("Blocked by", "").strip():
            problems.append("%s is blocked and does not say by what" % rid)

    for row in reviews:
        rid = row["id"]
        impact = row["fields"].get("Impact to", "").strip()
        if not impact:
            problems.append("%s carries no 'Impact to:'" % rid)
            continue
        for ref in TASK_REF.findall(impact):
            if ref not in by_id:
                problems.append("%s says it impacts %s, which the ledger does not carry"
                                % (rid, ref))
                continue
            back = by_id[ref]["fields"].get("Refer to", "")
            if rid not in back:
                problems.append("%s says it impacts %s, which does not refer back to it"
                                % (rid, ref))

    # the other half: a task that refers to a finding the finding does not claim
    for row in all_rows:
        if row["id"].startswith("REVIEW/"):
            continue
        back = row["fields"].get("Refer to", "").strip()
        if not back:
            continue
        for ref in re.findall(r"\bREVIEW/T\d+\b", back):
            if ref not in by_id:
                problems.append("%s refers to %s, which the ledger does not carry"
                                % (row["id"], ref))
                continue
            impact = by_id[ref]["fields"].get("Impact to", "")
            named = row["id"] in impact
            # A finding may bear on a feature rather than one task, in which
            # case it names the feature code and the task under it refers back.
            feature = row["id"].split("/")[0]
            if not named and feature not in impact:
                problems.append("%s refers to %s, which claims neither it nor %s"
                                % (row["id"], ref, feature))

    if problems:
        for problem in problems:
            print("FAIL %s" % problem)
        print("")
        print("%d problem(s) across %d row(s)." % (len(problems), len(all_rows)))
        return 1

    closed = sum(1 for r in all_rows if r["marker"] == "x")
    blocked = sum(1 for r in all_rows if r["marker"] == "!")
    open_reviews = sum(1 for r in reviews if r["marker"] != "x")
    print("tasks: %d rows, %d closed, %d blocked; %d REVIEW rows, %d still open -- "
          "every edge is written from both ends."
          % (len(all_rows), closed, blocked, len(reviews), open_reviews))
    return 0


if __name__ == "__main__":
    sys.exit(main())
