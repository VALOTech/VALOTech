#!/usr/bin/env python
"""Make `depends_on` and `depended_by` symmetric across every design.

The edge is written from both ends deliberately: a design should say what it
needs and what needs it, so a reader landing on either one sees the whole
relationship without walking the tree. The cost is that the second half is
written by hand and is forgotten, which `validate-designs.py` then reports as
dozens of failures naming pairs rather than the one missing line.

This adds the missing halves. It never removes an edge -- an asymmetry can mean
either that a `depended_by` was forgotten or that a `depends_on` is wrong, and
only a person can tell which, so the safe direction is the one that adds.

    python scripts/fix-design-symmetry.py --dry-run
    python scripts/fix-design-symmetry.py
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGNS = os.path.join(ROOT, "docs", "designs")

CODE_RE = re.compile(r"^code:\s*(\S+)\s*$", re.M)
DEPS_RE = re.compile(r"^depends_on:\s*\[([^\]]*)\]\s*$", re.M)
BY_RE = re.compile(r"^depended_by:\s*\[([^\]]*)\]\s*$", re.M)


def load():
    out = {}
    for dirpath, _dirs, names in os.walk(DESIGNS):
        for name in sorted(names):
            if not name.endswith(".md") or name.startswith("_"):
                continue
            path = os.path.join(dirpath, name)
            text = io.open(path, encoding="utf-8").read()
            if not text.startswith("---"):
                continue
            end = text.find("\n---", 3)
            if end < 0:
                continue
            block = text[:end]
            m = CODE_RE.search(block)
            if not m:
                continue
            deps = BY_RE.search(block)
            ups = DEPS_RE.search(block)
            out[m.group(1)] = {
                "path": path,
                "text": text,
                "end": end,
                "depends_on": [x.strip() for x in (ups.group(1) if ups else "").split(",") if x.strip()],
                "depended_by": [x.strip() for x in (deps.group(1) if deps else "").split(",") if x.strip()],
            }
    return out


def main():
    dry = "--dry-run" in sys.argv
    designs = load()
    added = []

    for code, d in designs.items():
        for up in d["depends_on"]:
            if up in designs and code not in designs[up]["depended_by"]:
                designs[up]["depended_by"].append(code)
                added.append("%s.depended_by += %s" % (up, code))
        for down in d["depended_by"]:
            if down in designs and code not in designs[down]["depends_on"]:
                designs[down]["depends_on"].append(code)
                added.append("%s.depends_on += %s" % (down, code))

    if not added:
        print("symmetry: every edge is already written from both ends.")
        return 0

    for line in added:
        print("  %s" % line)
    if dry:
        print("symmetry: %d edge half/halves missing (dry run)." % len(added))
        return 1

    for code, d in designs.items():
        block, rest = d["text"][: d["end"]], d["text"][d["end"] :]
        new = DEPS_RE.sub(
            lambda m: "depends_on: [%s]" % ", ".join(sorted(d["depends_on"])), block, count=1
        )
        new = BY_RE.sub(
            lambda m: "depended_by: [%s]" % ", ".join(sorted(d["depended_by"])), new, count=1
        )
        if new != block:
            io.open(d["path"], "w", encoding="utf-8", newline="").write(new + rest)

    print("symmetry: %d edge half/halves written." % len(added))
    return 0


if __name__ == "__main__":
    sys.exit(main())
