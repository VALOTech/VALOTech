#!/usr/bin/env python
"""Hold the served copy to the terms the glossary settled.

`docs/glossary/<locale>.json` records one answer per technical term per locale,
decided once and cited to where each rendering came from
(`docs/decisions-log.md#I18N-DEC-03`). A glossary nothing reads is a suggestion:
measured across this ecosystem, five of eight repositories carry a `preferred`
field that no checker consults, and in every one of those five the glossary and
the catalogues have drifted apart without anybody noticing. So this reads it.

**What it checks is a forbidden rendering, never a missing preferred one.** A
term's preferred word is what a *new* string should use, and demanding it appear
in every string that touches the concept would fail on every sentence that
refers to the idea without naming it -- which is most of them. What can be
checked, and is worth checking, is the opposite: a rendering the glossary
explicitly ruled out, appearing in copy a reader sees.

**The exemption list is the part that decides whether this is a gate or
theatre.** Turning the rule on over twenty locales finds violations that predate
it, and refusing every commit until they are all fixed would stop the work that
fixes them. So `docs/glossary/exemptions.json` names each one -- locale, key,
term -- with a reason somebody wrote, and the gate passes over it. The list is
only allowed to shrink: an exemption for a key that no longer violates anything
is reported as stale, because a list nobody empties is this gate with its eyes
shut, and it would take exactly as long to write.

**A row marked `permanent` is a decision, not a debt.** Where the owner has
settled that one string keeps a rendering the glossary otherwise refuses -- the
Turkish slogan, `I18N-DEC-04` -- counting it among the work owed leaves the
number that is supposed to fall unable to reach zero, and a target nobody can
hit is a target nobody aims at. The two counts are reported separately.

Run: python scripts/check-glossary.py
"""

import io
import json
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GLOSSARY_DIR = "docs/glossary"
EXEMPTIONS = "docs/glossary/exemptions.json"

# The three catalogues a reader's words actually come from. The gateway pair are
# JavaScript rather than JSON, which is why each is read by its own reader
# rather than by a shared one that would have to guess.
APP_CATALOGUE = "apps/web/src/messages/%s.json"
GATEWAY_CATALOGUE = "assets/i18n.js"
LEGAL_CATALOGUE = "assets/legal-i18n.js"

# `concept` carries `<term> — <gloss>`; a sibling repository's checker parses up
# to the first em-dash as the head term, so the shape is load-bearing rather
# than decorative and is enforced here too.
CONCEPT_RE = re.compile(r"^(?P<term>[^—]+?)\s+—\s+(?P<gloss>.+)$")

BASES = {"harvested", "ratified", "authored", "derived"}


# Scripts that write without spaces, where a word boundary is meaningless: a
# forbidden token in one of them is a token inside a compound, and that is
# exactly where it needs to be caught.
UNSPACED = (
    "\u3040-\u30ff"   # Hiragana and Katakana
    "\u3400-\u4dbf"   # CJK extension A
    "\u4e00-\u9fff"   # CJK unified
    "\uac00-\ud7af"   # Hangul syllables
    "\u0e00-\u0e7f"   # Thai
)
UNSPACED_RE = re.compile("[%s]" % UNSPACED)

# Cyrillic inflects by suffix, so a noun the glossary forbids appears as a stem
# with a case ending on it. Anchoring both ends would miss every inflected form,
# which is most of them.
CYRILLIC_RE = re.compile("[\u0400-\u04ff]")


def forbidden_pattern(banned):
    r"""The boundary rule a forbidden token needs, which is not the same for every script.

    A plain word boundary was the first attempt and it is wrong in two measured
    ways. Python's `\w` is Unicode-aware, so `\u30ed\u30b0\u30a4\u30f3` inside
    `\u6295\u8cc7\u5bb6\u30ed\u30b0\u30a4\u30f3` is two word characters
    meeting and the guard refuses to fire -- the compound is where a Japanese
    violation always lives. The same guard misses `\u0441\u0435\u0430\u043d\u0441`
    inside `\u0441\u0435\u0430\u043d\u0441\u044b`, which is the nominative
    plural and not a different word.

    Removing the guard is not the fix either: `AI` then matches inside
    `hello@valotech.org` and reports a Latin token that is part of a domain name.
    So the rule is per script -- unanchored where the script does not use spaces,
    anchored at the head only where it inflects by suffix, and anchored at both
    ends otherwise. A Latin plural is a separate string the glossary lists
    separately, because loosening the tail there would match inside any longer
    word that happens to start with the token.
    """
    literal = re.escape(banned)
    if UNSPACED_RE.search(banned):
        return literal
    if CYRILLIC_RE.search(banned):
        return r"(?<![^\W\d_])%s" % literal
    return r"(?<![\w])%s(?![\w])" % literal


def read(rel):
    with io.open(os.path.join(ROOT, rel), encoding="utf-8") as handle:
        return handle.read()


def locale_block(source, loc):
    """One `var <loc> = { ... };` block of a gateway catalogue, as a dictionary."""
    opening = "var %s = {" % loc
    start = source.find(opening)
    if start < 0:
        return None
    end = source.find("\n  };", start)
    if end < 0:
        return None
    return dict(re.findall(r'"([a-z0-9][\w.]*)"\s*:\s*"((?:[^"\\]|\\.)*)"', source[start:end]))


def flatten(node, prefix=""):
    out = {}
    for key, value in node.items():
        if isinstance(value, dict):
            out.update(flatten(value, prefix + key + "."))
        else:
            out[prefix + key] = value
    return out


def catalogues_for(loc, gateway_source, legal_source):
    """Every string this locale serves, keyed by `<catalogue>:<key>`."""
    found = {}
    app_path = os.path.join(ROOT, APP_CATALOGUE % loc)
    if os.path.exists(app_path):
        with io.open(app_path, encoding="utf-8") as handle:
            for key, value in flatten(json.load(handle)).items():
                if isinstance(value, str):
                    found["app:%s" % key] = value
    for name, source in (("gateway", gateway_source), ("legal", legal_source)):
        block = locale_block(source, loc)
        if block is None:
            continue
        for key, value in block.items():
            found["%s:%s" % (name, key)] = value
    return found


def entries_of(path, problems):
    """The glossary for one locale, refused rather than read when malformed."""
    try:
        with io.open(path, encoding="utf-8") as handle:
            loaded = json.load(handle)
    except ValueError as error:
        problems.append("%s: not valid JSON -- %s" % (path, error))
        return []
    if not isinstance(loaded, list):
        problems.append("%s: the top level must be an array, which is the only shape "
                        "every checker in the ecosystem reads" % path)
        return []
    return loaded


def main():
    directory = os.path.join(ROOT, GLOSSARY_DIR)
    if not os.path.isdir(directory):
        print("glossary: %s does not exist" % GLOSSARY_DIR)
        return 1

    files = sorted(f for f in os.listdir(directory) if f.endswith(".json") and f != "exemptions.json")
    if not files:
        print("glossary: %s holds no locale file" % GLOSSARY_DIR)
        return 1

    exempt = {}
    permanent = set()
    exemption_path = os.path.join(ROOT, EXEMPTIONS)
    if os.path.exists(exemption_path):
        with io.open(exemption_path, encoding="utf-8") as handle:
            for row in json.load(handle):
                key = (row["locale"], row["key"], row["term"])
                exempt[key] = row.get("reason", "")
                # A carve-out the owner decided is not work owed, and counting it
                # as such leaves the number that is supposed to fall unable to
                # reach zero -- which is how a list stops being read at all.
                if row.get("permanent") is True:
                    permanent.add(key)

    gateway_source = read(GATEWAY_CATALOGUE)
    legal_source = read(LEGAL_CATALOGUE)

    problems = []
    used_exemptions = set()
    terms_seen = 0
    strings_scanned = 0

    for filename in files:
        loc = filename[:-len(".json")]
        entries = entries_of(os.path.join(directory, filename), problems)
        served = catalogues_for(loc, gateway_source, legal_source)
        strings_scanned += len(served)

        for entry in entries:
            concept = entry.get("concept", "")
            match = CONCEPT_RE.match(concept)
            if match is None:
                problems.append("%s: concept %r is not `<term> — <gloss>`, which a "
                                "sibling's checker parses for the head term" % (loc, concept[:48]))
                continue
            term = match.group("term")
            terms_seen += 1

            if entry.get("basis") not in BASES:
                problems.append("%s/%s: basis %r is not one of %s -- a rendering a lane "
                                "invented must never read like one four products converged on"
                                % (loc, term, entry.get("basis"), ", ".join(sorted(BASES))))
            if entry.get("basis") in ("harvested", "ratified") and not entry.get("sources"):
                problems.append("%s/%s: basis says it was harvested and it cites nothing"
                                % (loc, term))
            if not entry.get("preferred"):
                problems.append("%s/%s: no preferred rendering, so the entry settles nothing"
                                % (loc, term))

            for banned in entry.get("forbidden", []):
                pattern = re.compile(forbidden_pattern(banned), re.IGNORECASE)
                for key, value in served.items():
                    if not pattern.search(value):
                        continue
                    if (loc, key, term) in exempt:
                        used_exemptions.add((loc, key, term))
                        continue
                    problems.append(
                        "%s %s uses %r, which the glossary forbids for %s (it settled %s)"
                        % (loc, key, banned, term, ", ".join(entry.get("preferred", [])))
                    )

    stale = set(exempt) - used_exemptions
    for locale, key, term in sorted(stale):
        problems.append("exemption for %s %s / %s no longer covers anything -- delete it, "
                        "because a list nobody empties is this gate with its eyes shut"
                        % (locale, key, term))

    if problems:
        print("glossary: %d problem(s)" % len(problems))
        for problem in problems:
            print("  FAIL " + problem)
        return 1

    owed = len(exempt) - len(permanent)
    print("glossary: %d term(s) across %d locale(s), checked against %d served string(s); "
          "%d exemption(s), every one still covering a real violation -- %d owed and %d "
          "decided as permanent"
          % (terms_seen, len(files), strings_scanned, len(exempt), owed, len(permanent)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
