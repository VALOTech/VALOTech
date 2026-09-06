#!/usr/bin/env python
"""Every path a document points at must exist, or name the task that creates it.

A design cites a file so a reader can open it. When the file is not there the
reader learns nothing except that the document is stale, and they learn it after
spending the effort to look -- which is worse than the document having said
nothing. This repository had five such citations, and three of them named
artefacts that were never going to exist yet because they are future work.

So a citation is one of two things, and it says which:

    `docs/runbooks/x.md`                 must exist now
    `docs/runbooks/x.md` (`CODE/T5`)     will exist; the task that makes it

The second form is not a loophole. It names a row in the ledger, that row is
checked to exist by `sync-tasks-from-designs.py`, and a reader following the
citation lands on work that is planned rather than on nothing.

Run: python scripts/check-doc-paths.py
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCAN = ("docs", ".claude", "brand", "credentials", "deploy")

# A backticked token that starts with one of this repository's own directories.
# Anchored on the directory set rather than on "looks like a path", because a
# glob, a shell fragment and a URL all look like paths and none of them is one.
ROOTS = r"docs|scripts|assets|apps|brand|deploy|credentials|\.claude|\.github|\.githooks"
CITE = re.compile(r"`((?:%s)/[\w./-]+)`" % ROOTS)
# The forward form: the path, then a task code within a short reach. The reach
# spans one line break, because markdown wraps and a citation that happens to
# fall at the end of a line is not a different kind of citation.
FORWARD = re.compile(
    r"`(?:%s)/[\w./-]+`[^\n]{0,50}\n?[^\n]{0,50}?`?[A-Z][A-Z0-9-]*-\d{3}/T\d+[a-z]?\d*`?"
    % ROOTS
)


def main():
    problems = []
    checked = 0
    forward = 0

    for base in SCAN:
        root = os.path.join(ROOT, base)
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, names in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in ("node_modules", "__pycache__")]
            for name in sorted(names):
                if not name.endswith(".md"):
                    continue
                rel = os.path.relpath(os.path.join(dirpath, name), ROOT).replace(os.sep, "/")
                text = io.open(os.path.join(dirpath, name), encoding="utf-8").read()
                excused = {m.group(0) for m in FORWARD.finditer(text)}
                for m in CITE.finditer(text):
                    target = m.group(1)
                    checked += 1
                    if os.path.exists(os.path.join(ROOT, target)):
                        continue
                    # A directory cited with a trailing slash stripped by the
                    # pattern is still a directory.
                    if os.path.isdir(os.path.join(ROOT, target.rstrip("/"))):
                        continue
                    if any(m.group(0) in e for e in excused):
                        forward += 1
                        continue
                    problems.append(
                        "%s cites `%s`, which does not exist — either create it "
                        "or name the task that will, as `` `%s` (`CODE/TN`) ``"
                        % (rel, target, target)
                    )

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1
    print(
        "doc paths: %d citation(s), every one resolves; %d named as future work."
        % (checked, forward)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
