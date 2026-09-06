#!/usr/bin/env python
"""Validate docs/decisions-log.md against the register's contract.

The register is the one place a choice that shapes the product is written down,
and every other document links to an anchor in it. That only holds if the
anchors exist, the codes are unique, an OPEN entry can actually be decided from
what it says, and a choice the loop settled carries the warrant that lets the
owner audit it. Those are the things checked here.

Run: python scripts/validate-decisions.py
"""

import io
import os
import re
import sys

# Windows consoles decode with cp1252, so a stray typographic character in a
# document would crash the gate rather than fail it. Say what the stream is.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTER = os.path.join(ROOT, "docs", "decisions-log.md")
TASKS = os.path.join(ROOT, "docs", "tasks.md")

# A domain may carry digits: I18N and A11Y are domains.
CODE = re.compile(r"^[A-Z][A-Z0-9-]*-DEC-\d{2}$")
ANCHOR = re.compile(r'<a id="([^"]+)"></a>')
HEADING = re.compile(r"^### `([^`]+)` — (.+?) — (OPEN|RESOLVED|RATIFIED|WITHDRAWN)\b(.*)$")
ISO = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
TASK_ROW = re.compile(r"^- \[([ x~!])\] ([A-Z][A-Z0-9-]*(?:/T\d+)?) —")
FORCING = ("DOCTRINE", "MEASUREMENT", "REVERSAL COST", "DOMINANCE")

OPEN_FIELDS = ("**Decision:**", "**Options:**", "**Recommendation:**",
               "**Decision owner:**", "**Status:**")


def read(path):
    with io.open(path, encoding="utf-8") as handle:
        return handle.read()


def entries(text):
    """Every entry as (code, status, suffix, body), in document order."""
    out = []
    lines = text.split("\n")
    for i, line in enumerate(lines):
        match = HEADING.match(line)
        if not match:
            continue
        code, _title, status, suffix = match.groups()
        # the anchor is the line above, allowing a blank line between
        anchor = None
        for back in (1, 2):
            if i - back >= 0:
                found = ANCHOR.search(lines[i - back])
                if found:
                    anchor = found.group(1)
                    break
        body = []
        for line2 in lines[i + 1:]:
            if line2.startswith("### ") or line2.startswith("## "):
                break
            body.append(line2)
        out.append((code, anchor, status, suffix, "\n".join(body), i + 1))
    return out


def task_states(text):
    """Every task id in the ledger, mapped to its marker."""
    states = {}
    for line in text.split("\n"):
        match = TASK_ROW.match(line.strip())
        if match:
            states[match.group(2)] = match.group(1)
    return states


def main():
    problems = []

    if not os.path.exists(REGISTER):
        # The register is a development-only document by design: main is the
        # published branch and carries only the site. Its absence here is the
        # honest signal that there is nothing to check, not a gate standing
        # down -- this exemption ends the moment the file is present.
        print("decisions-log.md: not on this branch; nothing to check.")
        return 0
    text = read(REGISTER)

    open_at = text.find("\n## Open decisions")
    resolved_at = text.find("\n## Resolved decisions")
    if open_at < 0:
        problems.append("the '## Open decisions' section is missing")
    if resolved_at < 0:
        problems.append("the '## Resolved decisions' section is missing")
    if open_at >= 0 and resolved_at >= 0 and open_at > resolved_at:
        problems.append("'## Open decisions' must come before '## Resolved decisions'")

    found = entries(text)
    if not found:
        problems.append("the register carries no entries")

    seen = {}
    for code, anchor, status, suffix, body, line_no in found:
        where = "line %d, %s" % (line_no, code)

        if not CODE.match(code):
            problems.append("%s: code is not <DOMAIN>-DEC-NN" % where)
        if code in seen:
            problems.append("%s: code already used at line %d" % (where, seen[code]))
        seen[code] = line_no
        if anchor is None:
            problems.append("%s: no <a id> anchor above the heading" % where)
        elif anchor != code:
            problems.append("%s: anchor is '%s', which is not the code" % (where, anchor))

        in_open_section = open_at <= text.find("### `%s`" % code) < (
            resolved_at if resolved_at >= 0 else len(text))
        if status == "OPEN" and not in_open_section:
            problems.append("%s: OPEN but filed under Resolved" % where)
        if status != "OPEN" and in_open_section:
            problems.append("%s: %s but filed under Open" % (where, status))

        if status == "OPEN":
            for field in OPEN_FIELDS:
                if field not in body:
                    problems.append("%s: OPEN entry is missing %s" % (where, field.strip("*:")))
            if "Safe default" not in body:
                problems.append("%s: OPEN entry names no safe default" % where)
        else:
            status_line = ""
            for line in body.split("\n"):
                if line.strip().startswith("- **Status:**"):
                    status_line = line
            if not status_line:
                problems.append("%s: no Status line" % where)
            elif not ISO.search(status_line):
                problems.append("%s: Status carries no ISO date" % where)

        loop_suffix = "loop-settled" in suffix
        loop_field = re.search(r"\*\*Settled by:\*\*\s*loop\b", body) is not None
        if loop_suffix != loop_field:
            problems.append(
                "%s: the heading says loop-settled=%s and 'Settled by:' says %s"
                % (where, loop_suffix, loop_field))
        if status != "OPEN" and "**Settled by:**" not in body:
            problems.append("%s: resolved entry does not say who settled it" % where)
        if loop_field:
            source = re.search(r"\*\*Forcing source:\*\*\s*([A-Z ]+)", body)
            if not source:
                problems.append("%s: loop-settled entry names no forcing source" % where)
            elif source.group(1).strip() not in FORCING:
                problems.append("%s: forcing source '%s' is not one of the four"
                                % (where, source.group(1).strip()))
            overturn = re.search(r"\*\*Overturned by:\*\*(.*)", body)
            if not overturn:
                problems.append("%s: loop-settled entry names no overturning signal" % where)
            elif ISO.search(overturn.group(1)):
                problems.append("%s: the overturning signal is a date, not a signal" % where)

        if status == "OPEN":
            blocks = re.search(r"\*\*Blocks:\*\*(.*)", body)
            if blocks and os.path.exists(TASKS):
                states = task_states(read(TASKS))
                for ref in re.findall(r"\b([A-Z][A-Z0-9-]*/T\d+)\b", blocks.group(1)):
                    if ref not in states:
                        problems.append("%s: Blocks names %s, which the ledger does not carry"
                                        % (where, ref))
                    elif states[ref] == "x":
                        problems.append("%s: Blocks names %s, which is already closed"
                                        % (where, ref))

    # every anchor referenced from any document must resolve here
    defined = set(seen)
    for folder, _dirs, files in os.walk(os.path.join(ROOT, "docs")):
        for name in files:
            if not name.endswith(".md"):
                continue
            path = os.path.join(folder, name)
            body = read(path)
            rel = os.path.relpath(path, ROOT).replace("\\", "/")
            for ref in re.findall(r"decisions-log\.md#([A-Za-z0-9-]+)", body):
                if ref not in defined:
                    problems.append("%s: links to decisions-log.md#%s, which is not defined"
                                    % (rel, ref))
            if rel != "docs/decisions-log.md":
                for stray in ANCHOR.findall(body):
                    if CODE.match(stray):
                        problems.append("%s: defines decision anchor %s outside the register"
                                        % (rel, stray))

    if problems:
        for problem in problems:
            print("FAIL %s" % problem)
        print("")
        print("%d problem(s) in the decision register." % len(problems))
        return 1

    opens = sum(1 for e in found if e[2] == "OPEN")
    print("decisions-log.md: %d entries, %d open, %d settled -- all anchors resolve."
          % (len(found), opens, len(found) - opens))
    return 0


if __name__ == "__main__":
    sys.exit(main())
