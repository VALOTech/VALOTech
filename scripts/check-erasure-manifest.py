#!/usr/bin/env python3
"""Refuse an erasure manifest that disagrees with the schema (`DATA-002/T3`).

The manifest in `docs/designs/data/data-002-erasure-and-retention.md` declares,
for every table, what it holds about a person and what erasure does to it. The
erasure function leans on the foreign keys' `on delete` behaviour to do the
work (`DATA-002/T2`); this gate is what proves "most of the work" is "all of
it", by holding the declaration against the migrations that define the schema.

Three checks, the design's own:

  1. Every table a migration creates appears in the manifest. A table nobody
     declared is a table whose erasure nobody decided.
  2. Every column referencing `accounts` has the `on delete` the manifest's row
     names. A `cascade` the manifest calls `set null`, or the reverse, is an
     investor's archive deleted to satisfy a staff erasure, or a staff id left
     pointing at a person who asked to be forgotten.
  3. A table the manifest says holds nothing personal has no column whose name
     matches a personal-data pattern. The third is a heuristic and will misfire
     one day; the remedy is an exemption line below, naming the column and why,
     never a looser pattern -- a check that matches less each time it fires
     stops being one.

It parses the migrations rather than a live database, so it runs in CI with no
connection, the way `apps/web/src/db/db.test.ts` proves the types against the
same files. `pgmigrations` is the migration tool's own table and no migration
creates it, so it is out of the parse and named in the manifest for the reader.
"""

import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "docs" / "designs" / "data" / "data-002-erasure-and-retention.md"
MIGRATIONS = ROOT / "apps" / "web" / "migrations"

# The personal-data column-name patterns, matched against a column's
# underscore-delimited tokens rather than as substrings: "ip" is a token of
# "ip_address" and "last_ip", and must not be one of "recipient", "script" or
# "description". A two-letter substring match would fire on half the schema.
PERSONAL_PATTERNS = frozenset({"email", "name", "phone", "address", "ip"})

# Columns whose name carries a personal token but which hold nothing personal,
# each with its reason. Add a line here when check 3 misfires; never widen or
# soften PERSONAL_PATTERNS.
EXEMPTIONS: dict[tuple[str, str], str] = {}

# First tokens that open a table-level constraint line rather than a column.
CONSTRAINT_KEYWORDS = frozenset({"CONSTRAINT", "PRIMARY", "UNIQUE", "FOREIGN", "CHECK"})

# The dash forms a manifest cell uses to mean "nothing about a person here".
NOTHING_DASHES = ("—", "–")  # em dash, en dash


def manifest() -> dict[str, tuple[str, str]]:
    """Each manifest table mapped to (personal-data cell, on-erasure cell).

    The manifest is the one markdown table whose header names the three columns;
    scoping to that header keeps a table elsewhere in the design — the retention
    table, say — from being read as a manifest row.
    """
    rows: dict[str, tuple[str, str]] = {}
    in_table = False
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        lowered = stripped.lower()
        if lowered.startswith("| table") and "personal data" in lowered and "on erasure" in lowered:
            in_table = True
            continue
        if not in_table:
            continue
        if not stripped.startswith("|"):
            break  # the table ended
        if set(stripped) <= {"|", "-", " ", ":"}:
            continue  # the |---|---| separator row
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) < 3:
            continue
        rows[cells[0].strip("`* ")] = (cells[1], cells[2])
    return rows


def table_bodies() -> dict[str, str]:
    """Each `CREATE TABLE <name> ( ... );` body, by table name."""
    bodies: dict[str, str] = {}
    for sql_file in sorted(MIGRATIONS.glob("*.sql")):
        sql = sql_file.read_text(encoding="utf-8")
        for match in re.finditer(r"CREATE TABLE (\w+) \((.*?)\n\);", sql, re.DOTALL):
            bodies[match.group(1)] = match.group(2)
    return bodies


def account_references(body: str) -> list[tuple[str, str]]:
    """Each (column, on-delete) in a table body that references accounts."""
    return [
        (m.group(1), m.group(2).lower())
        for m in re.finditer(
            r"(\w+)\s+[^,\n]*REFERENCES accounts\(id\) ON DELETE (CASCADE|SET NULL)", body
        )
    ]


def column_names(body: str) -> list[str]:
    """The column names a table declares, skipping table-level constraint lines."""
    names = []
    for raw in body.splitlines():
        tokens = raw.strip().rstrip(",").split()
        if not tokens or tokens[0].upper() in CONSTRAINT_KEYWORDS:
            continue
        if re.fullmatch(r"[a-z_]+", tokens[0]):
            names.append(tokens[0])
    return names


def holds_nothing_personal(personal_cell: str) -> bool:
    """Whether a manifest 'Personal data' cell declares the table holds nothing."""
    cell = personal_cell.strip()
    return cell in ("", "-") or cell.startswith(NOTHING_DASHES)


def matches_personal(column: str) -> bool:
    return bool(PERSONAL_PATTERNS.intersection(column.split("_")))


def main() -> int:
    rows = manifest()
    bodies = table_bodies()
    failures: list[str] = []

    # 1. Every table a migration creates is declared in the manifest.
    for table in sorted(bodies):
        if table not in rows:
            failures.append(f"table '{table}' is created by a migration but absent from the manifest")

    references = 0
    for table in sorted(bodies):
        if table not in rows:
            continue
        personal_cell, erasure_cell = rows[table]

        # 2. Each accounts reference's on-delete keyword appears in the cell.
        for column, on_delete in account_references(bodies[table]):
            references += 1
            if on_delete not in erasure_cell.lower():
                failures.append(
                    f"{table}.{column} is ON DELETE {on_delete.upper()} in the schema, "
                    f"which the manifest's '{table}' row does not name"
                )

        # 3. A table declared to hold nothing personal has no personal column.
        if holds_nothing_personal(personal_cell):
            for column in column_names(bodies[table]):
                if matches_personal(column) and (table, column) not in EXEMPTIONS:
                    failures.append(
                        f"{table}.{column} carries a personal-data token, but the manifest "
                        f"declares '{table}' holds nothing personal — add an exemption or fix the manifest"
                    )

    # accounts is the subject of erasure: the row itself is deleted, not referenced.
    if "accounts" in rows and "deleted" not in rows["accounts"][1].lower():
        failures.append("the manifest's 'accounts' row must declare the row is deleted")

    if failures:
        print("erasure manifest: the manifest and the schema disagree:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(
        f"erasure manifest: {len(bodies)} created table(s) declared, "
        f"{references} accounts-reference(s), every disposition matches the schema."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
