#!/usr/bin/env python
"""Every gate that prints must survive a console that is not UTF-8.

These scripts print arrows, section signs and em dashes, and a Windows console
running the cp1252 code page cannot encode any of them. Python does not degrade
there -- it raises `UnicodeEncodeError` on the print, so the gate dies partway
through its own output with a traceback that has nothing to do with what it was
checking. Worse, the exit code is then non-zero for the wrong reason, and the
report says the tree is broken when only the terminal is.

`sys.stdout.reconfigure(encoding="utf-8", errors="replace")` costs one line and
removes the whole class. Every script in `scripts/` that can print carries it,
and this gate is what keeps a new one from being written without it.

Run: python scripts/check-stream-guard.py
"""

import glob
import io
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = 'sys.stdout.reconfigure(encoding="utf-8"'


def main():
    problems = []
    checked = 0

    for path in sorted(glob.glob(os.path.join(ROOT, "scripts", "*.py"))):
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        with io.open(path, encoding="utf-8") as fh:
            text = fh.read()
        # A module that never prints has nothing to guard. `lib_roadmap.py` is
        # the case this exists for: adding a guard there would be a line that
        # protects nothing, and a rule with a pointless instance is a rule
        # people learn to work around.
        if "print(" not in text:
            continue
        checked += 1
        if GUARD not in text:
            problems.append(
                "%s prints and does not reconfigure stdout — one cp1252 "
                "console turns its output into a traceback" % rel
            )

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1
    print("stream guard: %d printing script(s), every one guarded." % checked)
    return 0


if __name__ == "__main__":
    sys.exit(main())
