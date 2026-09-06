#!/usr/bin/env python
"""Refuse a code this tree minted that origin has already given to something else.

Several windows work this ecosystem at once. Two of them, both diverged from
`origin/development`, both read the ledger, both take the next free number --
and both are right, locally. The collision does not exist when the number is
taken; it appears when the other window pushes, by which point both numbers are
in committed messages and `.claude/CLAUDE.md` §3.1's "no renumbering" forbids
the easy remedies.

The check is a three-way one, because two-way is not enough: a code that this
tree carries and origin also carries is a collision **only if the merge base
lacked it**. If the merge base had it, both sides simply inherited it.

    in HEAD  and  in origin/development  and  NOT in merge-base   ->  minted twice

Run: python scripts/check-identifier-allocation.py
"""

import os
import re
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The two sequences a window allocates from. Each is read the same way at all
# three points, so a difference is a difference in the ledger and never in how
# it was parsed.
LEDGERS = {
    "docs/tasks.md": re.compile(r"^- \[[ x~!]\]\s+([A-Z][A-Z0-9-]*(?:-\d{3})?/T\d+[a-z]?\d*)\s+—", re.M),
    "docs/decisions-log.md": re.compile(r"^### `([A-Z][A-Z0-9-]*-DEC-\d{2})`", re.M),
}


def git(*args):
    r = subprocess.run(["git"] + list(args), cwd=ROOT, capture_output=True)
    return r.returncode, r.stdout.decode("utf-8", "replace")


def codes_at(ref, path, pattern):
    """Every code the ledger carries at a ref, or None when it is unreadable."""
    if ref is None:
        rc, out = 0, open(os.path.join(ROOT, path), encoding="utf-8").read()
    else:
        rc, out = git("show", "%s:%s" % (ref, path))
    if rc != 0:
        return None
    return set(pattern.findall(out))


def main():
    rc, _ = git("rev-parse", "--verify", "--quiet", "origin/development")
    if rc != 0:
        print(
            "identifiers: no origin/development to compare against — the check "
            "needs a fetched remote and is skipped, not passed."
        )
        return 0

    rc, base = git("merge-base", "HEAD", "origin/development")
    base = base.strip()
    if rc != 0 or not base:
        print("identifiers: HEAD and origin/development share no history — skipped.")
        return 0

    problems = []
    checked = 0

    for path, pattern in sorted(LEDGERS.items()):
        if not os.path.exists(os.path.join(ROOT, path)):
            continue
        here = codes_at(None, path, pattern)
        there = codes_at("origin/development", path, pattern)
        common = codes_at(base, path, pattern)
        if here is None or there is None or common is None:
            # The ledger did not exist at one of the three points. That is a new
            # file, not a collision.
            continue
        checked += len(here)
        for code in sorted((here & there) - common):
            problems.append(
                "%s: `%s` was minted here and on origin/development after the "
                "merge base — two subjects wear one code "
                "(.claude/CLAUDE.md §3.1 says which side moves)" % (path, code)
            )

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1
    print(
        "identifiers: %d code(s) across %d ledger(s); none minted twice since "
        "the merge base." % (checked, len(LEDGERS))
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
