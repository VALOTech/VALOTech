#!/usr/bin/env python
"""Hold the task ledger to the designs' own task lists.

A design's §7 is the list of things that have to be done to realise it, and it
is written while the design is being reasoned about -- which is the moment the
author knows what the work is. `docs/tasks.md` is where that work is then
tracked. Copying between them by hand means the two disagree the first time a
design gains a task and nobody re-copies, and what disagreement looks like is a
task nobody ever does because it is only written in a document sessions read
once.

This is also the feasibility test this project is run on: **a design that cannot
be turned into tasks has not been finished, it has been described.** A design
whose §7 is empty fails here rather than passing quietly.

    python scripts/sync-tasks-from-designs.py            report only
    python scripts/sync-tasks-from-designs.py --write    add what is missing

`--write` only ever **adds** an open row. It never edits, reorders or removes
one: a row in the ledger carries `Evidence:`, `Note:` or `Blocked by:` that the
design does not know about, and losing that is losing the record of the work
rather than the plan for it.

Run without arguments as a gate: it exits non-zero when the two disagree.
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGNS = os.path.join(ROOT, "docs", "designs")
TASKS = os.path.join(ROOT, "docs", "tasks.md")

FM_CODE = re.compile(r"^code:\s*(\S+)\s*$", re.M)
FM_TITLE = re.compile(r"^title:\s*(.+?)\s*$", re.M)
FM_STATUS = re.compile(r"^status:\s*(\S+)\s*$", re.M)
DESIGN_TASK = re.compile(r"^- `([A-Z][A-Z0-9-]*-\d{3}/T\d+[a-z]?\d*)`\s+—\s+(.+?)\s*$", re.M)

LEDGER_SECTION = re.compile(r"^## ([A-Z][A-Z0-9-]*-\d{3})\s+·\s+(.+?)\s*$", re.M)
LEDGER_TASK = re.compile(r"^- \[([ x~!])\]\s+([A-Z][A-Z0-9-]*-\d{3}/T\d+[a-z]?\d*)\s+—\s+(.+?)\s*$", re.M)


def read(path):
    return io.open(path, encoding="utf-8").read()


def load_designs():
    """code -> (title, status, relpath, [(task, title), ...])"""
    out = {}
    for dirpath, _dirs, names in os.walk(DESIGNS):
        for name in sorted(names):
            if not name.endswith(".md") or name.startswith("_"):
                continue
            path = os.path.join(dirpath, name)
            text = read(path)
            if not text.startswith("---"):
                continue
            end = text.find("\n---", 3)
            if end < 0:
                continue
            block, body = text[:end], text[end:]
            m = FM_CODE.search(block)
            if not m:
                continue
            code = m.group(1)
            title = FM_TITLE.search(block)
            status = FM_STATUS.search(block)
            idx = body.find("## 7. Task list")
            tasks = DESIGN_TASK.findall(body[idx:]) if idx >= 0 else []
            out[code] = (
                title.group(1) if title else code,
                status.group(1) if status else "unknown",
                os.path.relpath(path, ROOT).replace(os.sep, "/"),
                tasks,
            )
    return out


def load_ledger(text):
    """code -> {task: (marker, title)}, in file order."""
    sections = {}
    current = None
    for line in text.splitlines():
        m = LEDGER_SECTION.match(line)
        if m:
            current = m.group(1)
            sections.setdefault(current, {})
            continue
        if line.startswith("## "):
            current = None
            continue
        m = LEDGER_TASK.match(line)
        if m and current:
            sections[current][m.group(2)] = (m.group(1), m.group(3))
    return sections


def main():
    write = "--write" in sys.argv
    designs = load_designs()
    text = read(TASKS)
    ledger = load_ledger(text)

    problems = []
    missing_rows = {}
    extra = []
    empty = []
    drifted = []

    for code in sorted(designs):
        title, status, rel, tasks = designs[code]
        if status == "deprecated":
            continue
        if not tasks:
            empty.append("%s (%s) has no §7 task list" % (code, rel))
            continue
        have = ledger.get(code, {})
        for tcode, ttitle in tasks:
            if tcode not in have:
                missing_rows.setdefault(code, []).append((tcode, ttitle))
            elif have[tcode][1] != ttitle:
                # Same code, different words. Checking only the code lets one
                # side be rewritten while the other keeps its own wording, and
                # the ledger is what a session reads before it starts work.
                drifted.append(
                    "%s\n      design: %s\n      ledger: %s"
                    % (tcode, ttitle, have[tcode][1])
                )
        for tcode in have:
            if tcode not in {t for t, _ in tasks}:
                extra.append("%s is in the ledger and in no design's §7" % tcode)

    for line in empty:
        problems.append("FAIL %s — a design that cannot be turned into tasks has not been finished" % line)
    for line in extra:
        problems.append("FAIL %s" % line)
    for line in drifted:
        problems.append("FAIL %s — the design and the ledger describe it differently" % line)

    if missing_rows and not write:
        for code, rows in sorted(missing_rows.items()):
            for tcode, ttitle in rows:
                problems.append("FAIL %s — in %s §7 and not in the ledger" % (tcode, code))

    if write and drifted:
        for line in drifted:
            print("FAIL %s — a title drift is resolved by hand, not by a script"
                  % line)
        return 1

    if write and missing_rows:
        for code, rows in sorted(missing_rows.items()):
            title, _status, rel, _tasks = designs[code]
            block = "".join("- [ ] %s — %s\n" % (t, tt) for t, tt in rows)
            heading = "## %s · %s" % (code, title)
            if code in ledger:
                # Append to the existing section, after its last task row.
                idx = text.index("\n## ", text.index(heading) + 1) if "\n## " in text[text.index(heading) + 1:] else len(text)
                start = text.index(heading)
                nxt = text.find("\n## ", start + 1)
                end = nxt if nxt >= 0 else len(text)
                section = text[start:end].rstrip("\n")
                text = text[:start] + section + "\n" + block + text[end:]
            else:
                new = "\n%s\nDesign: [%s](%s) · PRD: `%s`\n\n%s" % (
                    heading, rel, rel.replace("docs/", ""), code, block
                )
                text = text.rstrip("\n") + "\n" + new
            ledger.setdefault(code, {}).update({t: (" ", tt) for t, tt in rows})
        io.open(TASKS, "w", encoding="utf-8", newline="").write(text)
        print("tasks: %d row(s) added across %d feature(s)."
              % (sum(len(v) for v in missing_rows.values()), len(missing_rows)))
        return 0

    if problems:
        for line in problems:
            print(line)
        print("")
        print("Run `python scripts/sync-tasks-from-designs.py --write` to add the missing rows.")
        return 1

    total = sum(len(d[3]) for d in designs.values())
    print("tasks: %d design(s), %d task(s); the ledger and the designs agree."
          % (len(designs), total))
    return 0


if __name__ == "__main__":
    sys.exit(main())
