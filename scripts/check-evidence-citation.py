#!/usr/bin/env python
"""Every closed task's Evidence must resolve to something that exists.

`Evidence:` is the whole of what "done" means here, and it is the one field a
session writes about its own work. An evidence line naming a file that was
renamed, a symbol that was refactored away or a commit that only ever existed
in a message reads exactly like one that holds -- so the ledger keeps saying a
task is finished long after the thing that finished it has gone.

What counts as evidence, and what each form is checked against:

  path/to/file.ext            the path exists in the tree
  path/to/file.ext:Symbol     the path exists and the file contains the symbol
  commit <sha>                the object exists in this repository
  <sha>                       a bare 7-to-40 hex word, same check
  docs/...#anchor             the anchor is defined in that document
  make <target>               the Makefile declares the target
  prose                       allowed only alongside at least one of the above

The last rule is the point: a measurement in prose is worth reading and worth
keeping, and it is not a citation. A row whose entire evidence is a sentence
about how well it went cites nothing.

Run: python scripts/check-evidence-citation.py
"""

import io
import os
import re
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS = os.path.join(ROOT, "docs", "tasks.md")

TASK_RE = re.compile(r"^- \[([ x~!])\]\s+(\S+)\s+—")
EVIDENCE_RE = re.compile(r"^\s*Evidence:\s*(.+?)\s*$")

# A path-shaped token: at least one directory separator or a known extension,
# and no spaces. Anchored on the left by a boundary so a word inside prose is
# not mistaken for a path.
#
# The character class is spelled out rather than written `\w`, because Python's
# `\w` is Unicode: `으로/로`, a Korean particle pair written the way every
# grammar writes it, is two word runs around a slash and matched as a path. No
# file in this tree is named outside ASCII, so the narrower class costs nothing
# and stops prose in nineteen languages from being read as a filesystem.
#
# The extension alternation ends in a boundary because regex alternation is
# leftmost-first, not longest: without it `en.json` matches `js` and is checked
# as `en.js`, and `page.tsx` is checked as `page.ts`. Both then fail against a
# file that was never cited. Only a bare filename reaches this branch -- a
# slashed path matches the first alternative whole -- which is why it went
# unnoticed.
PATH_RE = re.compile(
    r"(?<![A-Za-z0-9_/.-])((?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]+(?::[A-Za-z_][A-Za-z0-9_.@-]*)?"
    r"|[A-Za-z0-9_.-]+\.(?:md|css|js|mjs|ts|tsx|json|html|py|yaml|yml|sql|sh|toml)(?![A-Za-z0-9_]))"
)
# A task code (`INFRA-001/T3`) is `word/word` and matches PATH_RE, but it is a
# reference in prose, never a file. An Evidence line legitimately names another
# task -- which task owns a neighbouring half of the work -- and that name must
# not be checked as a path that does not exist. It is excluded before the path
# scan rather than after, so the reference is invisible to the file check.
#
# `REVIEW/T<N>` is the second form and carries no domain number, because a review
# mints no code of its own and files its findings under the one code (CLAUDE.md
# §12). Leaving it out made the gate refuse the very cross-reference that section
# asks every finding to carry.
TASK_CODE_RE = re.compile(r"\b(?:[A-Z][A-Z0-9-]*-\d{3}|REVIEW)/T\d+[a-z]?\d*\b")
SHA_RE = re.compile(r"(?<![\w])(?:commit\s+)?([0-9a-f]{7,40})(?![\w])")
MAKE_RE = re.compile(r"\bmake\s+([a-z][a-z0-9-]*)")
# `make` is also an ordinary English verb, and an evidence line saying a control
# would "make the form a test" is not citing a target. The words that can follow
# the verb and never name one are a short, closed set; excluding them keeps the
# check able to catch a mistyped target, which excluding everything unbracketed
# would not -- citations in this ledger are written both inside backticks and
# bare, so the backtick is no signal either.
NOT_A_TARGET = frozenset(
    "a an the it its this that these those them their his her my our your one "
    "some any no every each both either sure up".split()
)


def git(*args):
    try:
        r = subprocess.run(["git"] + list(args), cwd=ROOT, capture_output=True)
        return r.returncode, r.stdout.decode("utf-8", "replace")
    except OSError:
        return 1, ""


def make_targets():
    path = os.path.join(ROOT, "Makefile")
    if not os.path.exists(path):
        return set()
    with io.open(path, encoding="utf-8") as fh:
        return set(re.findall(r"^([a-z][a-z0-9-]*):", fh.read(), re.M))


def anchors_in(rel):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        return None
    with io.open(path, encoding="utf-8") as fh:
        text = fh.read()
    return set(re.findall(r'<a id="([^"]+)"', text)) | {
        # A markdown heading is its own anchor, slugified.
        re.sub(r"[^a-z0-9]+", "-", h.lower()).strip("-")
        for h in re.findall(r"^#{1,6}\s+(.+?)\s*$", text, re.M)
    }


def check_citation(token, targets):
    """Return None when the token resolves, or a reason when it does not."""
    path, _, symbol = token.partition(":")
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        return "%s does not exist" % path
    if symbol:
        if os.path.isdir(full):
            return "%s is a directory and the citation names a symbol in it" % path
        with io.open(full, encoding="utf-8", errors="replace") as fh:
            if symbol not in fh.read():
                return "%s does not contain `%s`" % (path, symbol)
    return None


def main():
    with io.open(TASKS, encoding="utf-8") as fh:
        lines = fh.read().splitlines()

    targets = make_targets()
    problems = []
    closed_without = []
    current = None
    checked = 0

    for raw in lines:
        m = TASK_RE.match(raw)
        if m:
            current = (m.group(1), m.group(2))
            if m.group(1) == "x":
                closed_without.append(m.group(2))
            continue
        m = EVIDENCE_RE.match(raw)
        if not m or current is None:
            continue
        status, code = current
        if status == "x" and code in closed_without:
            closed_without.remove(code)
        body = m.group(1)
        # Strip task-code references so a prose mention like "owned by
        # INFRA-001/T3" is not scanned as a path. The count of real citations
        # is unaffected: a task code was never one.
        scan = TASK_CODE_RE.sub(" ", body)

        resolved = 0
        for token in PATH_RE.findall(scan):
            # A citation closing a sentence carries the sentence's full stop,
            # and no path or symbol ends in one: the dot belongs to the prose.
            token = token.rstrip(".")
            # An anchor citation is checked against the document it names.
            reason = check_citation(token, targets)
            if reason:
                problems.append("%s — %s" % (code, reason))
            else:
                resolved += 1
        for frag in re.findall(r"([\w./-]+\.md)#([A-Za-z0-9_-]+)", body):
            found = anchors_in(frag[0])
            if found is None:
                problems.append("%s — %s does not exist" % (code, frag[0]))
            elif frag[1] not in found and frag[1].lower() not in found:
                problems.append(
                    "%s — %s has no anchor `%s`" % (code, frag[0], frag[1])
                )
            else:
                resolved += 1
        for sha in SHA_RE.findall(body):
            rc, _ = git("cat-file", "-e", sha + "^{commit}")
            if rc != 0:
                problems.append(
                    "%s — commit %s is not an object in this repository"
                    % (code, sha)
                )
            else:
                resolved += 1
        for target in MAKE_RE.findall(body):
            if target in NOT_A_TARGET:
                continue
            if target not in targets:
                problems.append(
                    "%s — the Makefile declares no `%s` target" % (code, target)
                )
            else:
                resolved += 1

        if status == "x" and resolved == 0:
            problems.append(
                "%s — evidence is prose only, and prose cites nothing" % code
            )
        checked += 1

    for code in closed_without:
        problems.append("%s is closed and carries no Evidence: line" % code)

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1
    print("evidence: %d cited row(s), every citation resolves." % checked)
    return 0


if __name__ == "__main__":
    sys.exit(main())
