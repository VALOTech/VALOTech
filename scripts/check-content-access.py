#!/usr/bin/env python
"""No SQL names a content table outside the one module that scopes it.

Who may read which content item is decided by a single predicate, and every
content query composes it (`CMS-006`). The rule holding is what stands between
an investor-only report and anybody who guesses its identifier -- and it is
exactly the kind of rule that holds for a year and then does not, in a route
written under time pressure at the end of a day. Nothing about that failure is
visible: the page renders, somebody reads it, and no error is raised.

So the rule is mechanical rather than agreed. Content is reachable only through
`apps/web/src/content/`, whose read functions take the reader and compose the
predicate themselves; a query anywhere else names a content table, and naming
one anywhere else is what this refuses.

The guarded tables are the item and the three that hold or gate its body:
`content_items`, `content_revisions` and `content_locales` carry the blocks a
reader must not see unbidden, and `content_grants` is the grant the predicate
reads. A query naming only the revisions or the locales would return a body with
no audience predicate and is exactly as dangerous as one naming the item, so the
gate does not stop at the item.

It is blunt on purpose. It matches a table's name wherever it appears in a
scanned file, case-insensitively because PostgreSQL folds an unquoted identifier
and `CONTENT_ITEMS` is the same table, and including a comment, because the
vocabulary outside the module is the content item rather than the row it is
stored in. A legitimate exception -- the schema description, the guard that
compares it to the migration -- lives in a named file listed below, and each
entry is a line somebody had to write and justify, which is the intended
friction.

Two ways this gate could pass while checking nothing are refused rather than
trusted: a scan that matched no files at all, and an exemption whose path has
been renamed out from under it.

Run: python scripts/check-content-access.py
"""

import io
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The item and the tables that hold or gate its body. Matched case-folded.
TABLES = ("content_items", "content_revisions", "content_locales", "content_grants")

# Every place a database query could be written: the whole application tree and
# the repository scripts. `docs/` is not here -- a design names a table because
# describing it is what a design does -- and `SKIP_DIRS` prunes what is built or
# vendored. Scanning all of `apps/web` rather than named subdirectories is so a
# route moved to a sibling of `src/` cannot leave the scan by moving.
SCAN = (
    os.path.join("apps", "web"),
    "scripts",
)
EXTENSIONS = (".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx", ".py", ".sql")
SKIP_DIRS = ("node_modules", "__pycache__", ".next", "dist", "build")

# Each entry is a path and the reason it may name a content table. A directory
# covers what is under it.
EXEMPT = (
    (
        os.path.join("apps", "web", "src", "content"),
        "the content module — the one place the tables are queried, and every "
        "read in it composes the access predicate",
    ),
    (
        os.path.join("apps", "web", "migrations"),
        "the migrations — they create the tables",
    ),
    (
        os.path.join("apps", "web", "src", "db", "types.ts"),
        "the schema description — it names the tables as keys of the database "
        "type and declares no query",
    ),
    (
        os.path.join("apps", "web", "src", "db", "db.test.ts"),
        "the drift guard — it compares that description to the migration and "
        "must name every table to do it",
    ),
    (
        os.path.join("scripts", "check-content-access.py"),
        "this gate — it names the tables because it searches for them",
    ),
)


def normalise(path):
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def exempt(rel):
    for path, _reason in EXEMPT:
        prefix = path.replace(os.sep, "/")
        if rel == prefix or rel.startswith(prefix + "/"):
            return True
    return False


def main():
    problems = []
    scanned = 0
    exempted = 0

    for missing in [p for p, _ in EXEMPT if not os.path.exists(os.path.join(ROOT, p))]:
        problems.append(
            "the exemption for %s names a path that is not there — an exemption "
            "nothing matches has stopped saying anything, and the file it "
            "excused may now be scanned or may have moved somewhere that is not"
            % normalise(os.path.join(ROOT, missing))
        )

    for base in SCAN:
        root = os.path.join(ROOT, base)
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, names in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in sorted(names):
                if not name.endswith(EXTENSIONS):
                    continue
                rel = normalise(os.path.join(dirpath, name))
                if exempt(rel):
                    exempted += 1
                    continue
                scanned += 1
                with io.open(os.path.join(dirpath, name), encoding="utf-8") as fh:
                    for number, line in enumerate(fh, start=1):
                        lowered = line.lower()
                        for table in TABLES:
                            if table in lowered:
                                problems.append(
                                    "%s:%d names %s outside the content module — "
                                    "a read of it belongs in apps/web/src/content/, "
                                    "composing visibleTo(reader)" % (rel, number, table)
                                )

    if scanned == 0:
        problems.append(
            "no file was scanned at all — the scan roots name nothing, so this "
            "gate would pass whatever the tree contained"
        )

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1

    print(
        "content access: %d file(s) scanned, none names a content table; %d "
        "exempt file(s) under %d named exemption(s)." % (scanned, exempted, len(EXEMPT))
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
