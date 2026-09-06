#!/usr/bin/env python
"""The iteration log keeps the newest twenty entries and no more.

`docs/dev1-iter-log.md` is working state, not an archive. Every cold start
reads its tail to find out where the last one stopped, so a file that grows
without bound turns a cheap orientation read into an expensive one, and then
into a file nobody opens -- at which point the loop has no memory at all.

The bound is held here rather than by an occasional cleanup, because a cleanup
that runs when somebody remembers is a cleanup that has already been skipped.
`git log -p` is the archive: every entry was committed, so a pruned one is
recoverable verbatim and no second copy is kept on disk.

What this cannot check is the rule that matters more -- that a durable fact was
promoted to its permanent home before its entry was deleted. That is
`.claude/CLAUDE.md` §13.1, and it is the reason the bound is safe.

Run: python scripts/check-log-retention.py
"""

import glob
import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIMIT = 20
ENTRY_RE = re.compile(r"^## ", re.M)


def main():
    logs = sorted(glob.glob(os.path.join(ROOT, "docs", "*-iter-log.md")))
    if not logs:
        print("retention: no iteration log yet — the bound applies when one exists.")
        return 0

    problems = []
    for path in logs:
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        with io.open(path, encoding="utf-8") as fh:
            text = fh.read()
        n = len(ENTRY_RE.findall(text))
        if n > LIMIT:
            problems.append(
                "%s holds %d entries; the bound is %d. Promote every durable "
                "fact in the oldest %d to docs/tasks.md, docs/decisions-log.md "
                "or docs/operator-checklist.md, then delete them "
                "(.claude/CLAUDE.md §13.1)." % (rel, n, LIMIT, n - LIMIT)
            )
        else:
            print("retention: %s holds %d/%d entries." % (rel, n, LIMIT))

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
