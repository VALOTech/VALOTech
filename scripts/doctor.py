#!/usr/bin/env python
"""Say what this repository has, what it does not, and what is waiting.

A new session's first question is where the work stands, and the honest answer
is spread across four documents and a directory listing. This reads them and
says it once. It asserts nothing and fails nothing -- `make check` is the gate.

Run: python scripts/doctor.py
"""

import io
import os
import re
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# What the ecosystem's repositories carry, and why this one does or does not.
SKELETON = [
    (".claude/CLAUDE.md", "the development guide"),
    ("docs/PRD.md", "the feature catalogue"),
    ("docs/tasks.md", "the task ledger"),
    ("docs/roadmap.md", "execution order"),
    ("docs/decisions-log.md", "the decision register"),
    ("docs/operator-checklist.md", "what waits on a human"),
    ("docs/ECOSYSTEM.md", "the shared map of the six products"),
    ("docs/designs", "per-feature designs"),
    ("docs/runbooks", "what an operator does at 3am"),
    ("brand", "the VALO corporate identity"),
    ("credentials", "how a credential reaches the application"),
    ("deploy", "how it is deployed"),
    ("env.example", "every variable the application reads"),
    ("docker-compose.yml", "the local stack"),
    ("Makefile", "the commands this repository has"),
    (".github/workflows", "continuous integration"),
    (".githooks/pre-push", "the gate that runs before a push"),
    (".gitleaks.toml", "secret scanning"),
    (".nvmrc", "the Node version"),
    ("apps/web", "the application"),
]

# Deliberately absent, with the reason, so nobody adds them by pattern-matching
# against a sibling.
ABSENT = [
    (".devn/", "multi-lane coordination; this repository has one lane"),
    ("packages/", "shared code between apps; there is one app"),
    ("go.work", "no Go here -- the stack is Next.js, see decisions-log.md#INFRA-DEC-01"),
    ("CONTRIBUTING.md", "solo-maintained; the guide is .claude/CLAUDE.md"),
]


def read(path):
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        return ""
    with io.open(full, encoding="utf-8") as handle:
        return handle.read()


def git(*args):
    try:
        out = subprocess.run(["git"] + list(args), cwd=ROOT, capture_output=True)
        return out.stdout.decode("utf-8", "replace").strip()
    except Exception:
        return ""


def main():
    print("VALO Tech")
    print("=========")
    print("")

    branch = git("branch", "--show-current")
    head = git("log", "--oneline", "-1")
    dirty = git("status", "--porcelain")
    print("branch   %s" % (branch or "?"))
    print("head     %s" % (head or "?"))
    print("tree     %s" % ("clean" if not dirty else
                           "%d changed path(s)" % len(dirty.split("\n"))))
    if branch == "main":
        print("")
        print("  NOTE  main is the published branch: everything committed to it is")
        print("        served at valotech.org. Planning documents belong on development.")
    print("")

    print("Skeleton")
    print("--------")
    for path, what in SKELETON:
        here = os.path.exists(os.path.join(ROOT, path))
        print("  %-24s %-4s %s" % (path, "yes" if here else "--", what))
    print("")

    print("Deliberately absent")
    print("-------------------")
    for path, why in ABSENT:
        print("  %-24s %s" % (path, why))
    print("")

    tasks = read("docs/tasks.md")
    if tasks:
        rows = re.findall(r"^- \[([ x~!])\] ([A-Z][A-Z0-9-]*(?:/T\d+)?) — (.+)$",
                          tasks, re.M)
        counts = {" ": 0, "x": 0, "~": 0, "!": 0}
        for marker, _rid, _title in rows:
            counts[marker] = counts.get(marker, 0) + 1
        print("Ledger")
        print("------")
        print("  %d rows: %d closed, %d open, %d in progress, %d blocked"
              % (len(rows), counts["x"], counts[" "], counts["~"], counts["!"]))
        open_reviews = [r for r in rows if r[1].startswith("REVIEW/") and r[0] != "x"]
        if open_reviews:
            print("  %d REVIEW row(s) open -- these are drained first:" % len(open_reviews))
            for _marker, rid, title in open_reviews:
                print("      %-12s %s" % (rid, title[:78]))
        else:
            print("  no REVIEW row is open")
        print("")

    register = read("docs/decisions-log.md")
    if register:
        opens = re.findall(r"^### `([^`]+)` — (.+?) — OPEN", register, re.M)
        print("Waiting on the owner")
        print("--------------------")
        if opens:
            for code, title in opens:
                print("  %-16s %s" % (code, title[:74]))
            print("")
            print("  None of these blocks work: each ships a fail-closed default.")
        else:
            print("  nothing open")
        print("")

    print("Next")
    print("----")
    print("  make check     run every gate this repository has")
    print("  make serve     the gateway on http://127.0.0.1:8123, no-store")
    print("  make infra-up  PostgreSQL on 5434")
    return 0


if __name__ == "__main__":
    sys.exit(main())
