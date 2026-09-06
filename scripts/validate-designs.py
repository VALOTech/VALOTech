#!/usr/bin/env python
"""Validate the design files against the contract in .claude/CLAUDE.md 3.4.

A design is the one place a feature's behaviour is written down before it is
built, and the chain PRD code -> design -> task -> code -> test only holds if
each link resolves. This checks the links a machine can check: that a design's
code matches its filename and its folder, that depends_on and depended_by agree
in both directions, that every code it names exists, that its layers are the
canonical tokens, and that a design waiting on something says what.

Run: python scripts/validate-designs.py [--strict]
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGNS = os.path.join(ROOT, "docs", "designs")
PRD = os.path.join(ROOT, "docs", "PRD.md")
REGISTER = os.path.join(ROOT, "docs", "decisions-log.md")
CHECKLIST = os.path.join(ROOT, "docs", "operator-checklist.md")

LAYERS = {"scene", "infra", "data", "domain", "service", "api", "frontend", "ui"}
STATUSES = {"draft", "under-review", "design-ready", "implemented", "deprecated",
            "pending-external", "pending-decision"}
BLOCKER_KINDS = {"credential", "vendor", "legal", "threshold"}

FEATURE = re.compile(r"^[A-Z][A-Z-]*-\d{3}$")
RULE = re.compile(r"^([A-Z][A-Z-]*-R\d{2}|P-\d{2})$")
DEC = re.compile(r"^[A-Z][A-Z-]*-DEC-\d{2}$")


def read(path):
    with io.open(path, encoding="utf-8") as handle:
        return handle.read()


def frontmatter(text):
    """The YAML block as a flat dict. Lists are read as lists; nothing nested
    beyond external_blocker, which is read as its own dict."""
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    block, out, current = text[3:end], {}, None
    for raw in block.split("\n"):
        if not raw.strip() or raw.strip().startswith("#"):
            continue
        if raw.startswith("  ") and current:
            key, _, value = raw.strip().partition(":")
            out[current][key.strip()] = value.strip()
            continue
        key, _, value = raw.partition(":")
        key, value = key.strip(), value.strip()
        if not value:
            out[key] = {}
            current = key
            continue
        current = None
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            out[key] = [v.strip() for v in inner.split(",") if v.strip()] if inner else []
        else:
            out[key] = value
    return out


def main():
    strict = "--strict" in sys.argv
    problems = []

    if not os.path.isdir(DESIGNS):
        # Said rather than passed: a gate that reports clean because it read
        # nothing is the shape that hides a whole missing directory. The
        # exemption ends the moment docs/designs exists.
        print("designs: docs/designs does not exist yet; nothing to check.")
        return 0

    files = []
    for folder, _dirs, names in os.walk(DESIGNS):
        for name in sorted(names):
            if name.endswith(".md") and not name.startswith("_"):
                files.append(os.path.join(folder, name))

    prd = read(PRD) if os.path.exists(PRD) else ""
    register = read(REGISTER) if os.path.exists(REGISTER) else ""
    checklist = read(CHECKLIST) if os.path.exists(CHECKLIST) else ""

    designs = {}
    for path in files:
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        meta = frontmatter(read(path))
        if meta is None:
            problems.append("%s: no frontmatter block" % rel)
            continue
        code = meta.get("code", "")
        if not FEATURE.match(str(code)):
            problems.append("%s: code '%s' is not <DOMAIN>-NNN" % (rel, code))
            continue
        if code in designs:
            problems.append("%s: code %s is already used by %s" % (rel, code, designs[code][0]))
        designs[code] = (rel, meta)

    for code, (rel, meta) in sorted(designs.items()):
        domain = str(meta.get("domain", ""))
        folder = os.path.basename(os.path.dirname(os.path.join(ROOT, rel)))
        if domain.lower() != folder:
            problems.append("%s: domain '%s' does not match its folder '%s'" % (rel, domain, folder))
        if not code.startswith(domain + "-"):
            problems.append("%s: code %s does not begin with its domain %s" % (rel, code, domain))
        if not os.path.basename(rel).startswith(code.lower() + "-"):
            problems.append("%s: filename does not begin with %s" % (rel, code.lower()))

        status = str(meta.get("status", ""))
        if status not in STATUSES:
            problems.append("%s: status '%s' is not one of the seven" % (rel, status))
        if status == "deferred":
            problems.append("%s: 'deferred' is not a status; re-class it" % rel)

        for layer in meta.get("layers_touched", []):
            if layer not in LAYERS:
                problems.append("%s: layer '%s' is not a canonical token" % (rel, layer))

        for rule in meta.get("cross_cutting_rules", []):
            if not RULE.match(rule):
                problems.append("%s: '%s' is not a rule or principle code" % (rel, rule))
            elif prd and rule not in prd:
                problems.append("%s: rule %s appears in no PRD section" % (rel, rule))

        for ref in meta.get("prd_refs", []):
            if prd and ref not in prd:
                problems.append("%s: prd_ref %s appears in no PRD section" % (rel, ref))

        for other in meta.get("depends_on", []):
            if not FEATURE.match(other):
                problems.append("%s: depends_on '%s' is not a feature code" % (rel, other))
            elif other not in designs:
                problems.append("%s: depends_on %s, which has no design" % (rel, other))
            elif code not in designs[other][1].get("depended_by", []):
                problems.append("%s: depends_on %s, which does not list it under depended_by"
                                % (rel, other))
        for other in meta.get("depended_by", []):
            if not FEATURE.match(other):
                problems.append("%s: depended_by '%s' is not a feature code" % (rel, other))
            elif other not in designs:
                problems.append("%s: depended_by %s, which has no design" % (rel, other))
            elif code not in designs[other][1].get("depends_on", []):
                problems.append("%s: depended_by %s, which does not list it under depends_on"
                                % (rel, other))

        if status == "pending-external":
            blocker = meta.get("external_blocker") or {}
            if not isinstance(blocker, dict) or not blocker:
                problems.append("%s: pending-external with no external_blocker" % rel)
            else:
                if blocker.get("kind") not in BLOCKER_KINDS:
                    problems.append("%s: external_blocker.kind '%s' is not one of the four"
                                    % (rel, blocker.get("kind")))
                ref = blocker.get("ref", "")
                if not ref:
                    problems.append("%s: external_blocker names no ref" % rel)
                elif checklist and ('id="%s"' % ref) not in checklist:
                    problems.append("%s: external_blocker.ref '%s' resolves to no anchor in "
                                    "docs/operator-checklist.md" % (rel, ref))
                if not blocker.get("unblocks_when"):
                    problems.append("%s: external_blocker says nothing about what unblocks it" % rel)

        if status == "pending-decision":
            if not meta.get("decision_required"):
                problems.append("%s: pending-decision with no decision_required" % rel)
            if not meta.get("decision_owner"):
                problems.append("%s: pending-decision with no decision_owner" % rel)
            if register and ("**Blocks:**" in register) and code not in register:
                problems.append("%s: pending-decision, but no register entry names it under Blocks"
                                % rel)

    if problems:
        for problem in problems:
            print("FAIL %s" % problem)
        print("")
        print("%d problem(s) across %d design(s)." % (len(problems), len(designs)))
        return 1

    if designs:
        print("designs: %d read, every code, layer, rule and edge resolves." % len(designs))
    else:
        print("designs: the directory exists and holds none yet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
