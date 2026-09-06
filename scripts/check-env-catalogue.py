#!/usr/bin/env python
"""Every variable a design names must be in env.example, and the reverse.

`env.example` claims to be the catalogue: *every variable the application reads
at boot is listed here*. A claim like that is worth exactly as much as whatever
checks it, and nothing did -- so the designs came to name `APP_ORIGIN`,
`SMTP_URL`, `MAIL_FROM` and `BACKUP_TARGET` while the file listed `APP_URL` and
none of the other three. The first person to meet that gap would have met it as
an application that would not start.

Both directions are checked, because they fail differently. A variable named in
a design and missing from the file is a value nobody knows to set. A variable in
the file that no design names is either dead configuration or a design that
forgot to say what it reads, and neither is harmless.

Not every SCREAMING_SNAKE token in a design is an environment variable, so the
exemptions below name the ones that are something else. The list is short and
each entry says what it is; a growing list means the pattern is wrong rather
than that the exemptions are.

Run: python scripts/check-env-catalogue.py
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGNS = os.path.join(ROOT, "docs", "designs")
ENV = os.path.join(ROOT, "env.example")

# A backticked SCREAMING_SNAKE token with at least one underscore. One word
# would catch every CONSTANT and every HTTP verb.
TOKEN = re.compile(r"`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`")
DECL = re.compile(r"^([A-Z][A-Z0-9_]*)=", re.M)

# Tokens that match the shape and are not environment variables.
NOT_ENV = {
    "EXPECTED_NODES": "a constant in scripts/sync-static-copy.mjs",
}


def main():
    named = {}
    for dirpath, dirnames, names in os.walk(DESIGNS):
        dirnames[:] = [d for d in dirnames if not d.startswith("_")]
        for name in sorted(names):
            if not name.endswith(".md") or name.startswith("_"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), ROOT).replace(os.sep, "/")
            text = io.open(os.path.join(dirpath, name), encoding="utf-8").read()
            for m in TOKEN.finditer(text):
                named.setdefault(m.group(1), set()).add(rel)

    declared = set(DECL.findall(io.open(ENV, encoding="utf-8").read()))
    problems = []

    for var in sorted(set(named) - declared - set(NOT_ENV)):
        problems.append(
            "`%s` is named by %s and is not in env.example — the file claims to "
            "list every variable the application reads"
            % (var, ", ".join(sorted(named[var])))
        )

    # The reverse direction searches for the declared name itself rather than
    # re-using the discovery pattern above. That pattern requires an underscore
    # to keep noise down, so a single-word variable such as PORT is invisible to
    # it -- and checking one direction with a pattern the other direction cannot
    # produce is a gate that manufactures a failure nobody can fix.
    corpus = ""
    for dirpath, dirnames, names_ in os.walk(DESIGNS):
        dirnames[:] = [d for d in dirnames if not d.startswith("_")]
        for name in sorted(names_):
            if name.endswith(".md") and not name.startswith("_"):
                corpus += io.open(os.path.join(dirpath, name), encoding="utf-8").read()
    for var in sorted(declared):
        if "`%s`" % var not in corpus:
            problems.append(
                "env.example declares `%s` and no design names it — either it is "
                "dead configuration or a design does not say what it reads" % var
            )

    for var in sorted(set(NOT_ENV) & declared):
        problems.append(
            "`%s` is exempted as %s and is also declared in env.example — the "
            "exemption is wrong" % (var, NOT_ENV[var])
        )

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1
    print(
        "env: %d variable(s) declared, every one named by a design and every "
        "named one declared." % len(declared)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
