#!/usr/bin/env python
"""Comment hygiene, per .claude/CLAUDE.md §6.

Two classes are refused, and they fail for opposite reasons.

A **bare marker** -- `TODO`, `FIXME`, `XXX`, `HACK` -- is a deferral with no
blocker, no owner and no signal that it has cleared. It reads as a note to
somebody and is a note to nobody. The sanctioned forms carry all four fields:

    // Deferred: <CODE> — <what>. Until then, <safe default>.
    // PENDING-CREDENTIAL: <name>. Owner sets <ENV_VAR>. Tracked at CRED-*.

A **history comment** is the opposite defect: it says too much, about the wrong
thing. "Previously X, now Y", "fix for finding 3", "Phase 2", "shipped in the
2026-09 pass" -- each describes a past moment rather than the code, and each
becomes false the next time the code changes. `git log` already holds that
account, and §1.9 keeps it there so a document reads as though written once.

Escape hatches, for the line where a marker is genuinely the subject:

    check-comments:ignore        this line
    check-comments:ignore-next   the following line
    check-comments:ignore-file   the whole file

Run: python scripts/check-comments.py
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCAN_DIRS = ["assets", "apps", "scripts", "packages"]
SCAN_EXT = (".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".py", ".sql")
SKIP_PARTS = ("node_modules", ".next", "dist", "build", "__pycache__", ".git")

BARE_MARKER = re.compile(r"\b(TODO|FIXME|XXX|HACK)\b")
SANCTIONED = re.compile(r"\b(Deferred:|PENDING-CREDENTIAL:)")

HISTORY = [
    (re.compile(r"\b(previously|used to be|formerly)\b", re.I), "tells history"),
    (re.compile(r"\bnow (?:we|it|this) (?:use|do|is|are)\b", re.I), "tells history"),
    (re.compile(r"\bfix(?:ed)? for (?:finding|issue|bug) \S+", re.I), "cites a finding"),
    (re.compile(r"\bphase \d+\b", re.I), "carries a phase label"),
    (re.compile(r"\bsession \d+\b", re.I), "narrates a session"),
    (re.compile(r"\bshipped (?:at|in|on)\b", re.I), "narrates shipping"),
    (re.compile(r"\[AC-\d+\]"), "carries an audit tag"),
]

COMMENT = re.compile(r"(?://|#|/\*|\*)\s?(.*)$")


def files():
    for base in SCAN_DIRS:
        root = os.path.join(ROOT, base)
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_PARTS]
            for name in sorted(filenames):
                if name.endswith(SCAN_EXT):
                    yield os.path.join(dirpath, name)


def main():
    problems = []
    scanned = 0

    for path in files():
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        with io.open(path, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
        if any("check-comments:ignore-file" in ln for ln in lines[:40]):
            continue
        scanned += 1
        skip_next = False
        for n, line in enumerate(lines, 1):
            if skip_next:
                skip_next = False
                continue
            if "check-comments:ignore-next" in line:
                skip_next = True
                continue
            if "check-comments:ignore" in line:
                continue

            m = BARE_MARKER.search(line)
            if m and not SANCTIONED.search(line):
                problems.append(
                    "%s:%d bare `%s` — a deferral with no blocker and no "
                    "signal that it cleared" % (rel, n, m.group(1))
                )

            body = COMMENT.search(line)
            if not body:
                continue
            text = body.group(1)
            if not text.strip():
                continue
            for pattern, why in HISTORY:
                if pattern.search(text):
                    problems.append(
                        "%s:%d comment %s — git log holds that, §1.9 keeps it "
                        "there" % (rel, n, why)
                    )
                    break

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1
    print("comments: %d file(s) scanned, no bare marker and no history prose." % scanned)
    return 0


if __name__ == "__main__":
    sys.exit(main())
