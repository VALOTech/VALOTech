#!/usr/bin/env python
"""Hold the brand kit to the stylesheet the live page actually loads.

`brand/tokens.css` and `brand/tokens.json` are an interface to the values in
`assets/site.css`, not a second definition of them. That rule was written in
`brand/README.md` and in the header of both files, and prose is not a check: a
`:root` edit lands, the kit keeps the old number, and the two disagree silently
for as long as nobody opens both. Anyone reading the kit -- a designer, a deck,
a future application that imports it -- then builds on a value the page has not
used since.

So the kit is verified against the stylesheet rather than trusted to match it:
every token it publishes must exist in `assets/site.css` and carry the same
value, byte for byte after whitespace is normalised, and the two kit files must
publish the same set of names.

Run: python scripts/check-brand-tokens.py
"""

import io
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STYLESHEET = "assets/site.css"
TOKENS_CSS = "brand/tokens.css"
TOKENS_JSON = "brand/tokens.json"

# DOTALL, because a declaration may wrap: `--shadow` spans two lines in the
# stylesheet, and a line-anchored pattern reports it as absent -- which reads
# as "the kit invented a token" and is really "the gate cannot see this shape".
# A gate blind to a shape is a gate that has never checked the values in it.
DECL_RE = re.compile(r"^[ 	]*(--[a-z0-9-]+)\s*:\s*(.+?);[ 	]*$", re.M | re.S)
JSON_ENTRY_RE = re.compile(r'^\s*"([a-z0-9-]+)"\s*:\s*"(.*?)"\s*,?\s*$', re.M)


def read(rel):
    with io.open(os.path.join(ROOT, rel), encoding="utf-8") as handle:
        return handle.read()


def normalise(value):
    """Whitespace is not a difference; anything else is."""
    return re.sub(r"\s+", " ", value).strip()


def root_block(text, path):
    """The first `:root { ... }` block, or an empty string with a complaint."""
    start = text.find(":root {")
    if start < 0:
        return None, "%s: no :root block" % path
    end = text.find("\n}", start)
    if end < 0:
        return None, "%s: the :root block is never closed" % path
    return text[start:end], None


def parse_css_tokens(text, path):
    block, err = root_block(text, path)
    if err:
        return {}, [err]
    out = {}
    for name, value in DECL_RE.findall(block):
        out[name] = normalise(value)
    return out, []


def parse_json_tokens(text):
    """Every leaf under `tokens`, keyed by its `--name` form.

    A hand-rolled scan rather than `json.loads` so a duplicated key is visible
    as a duplicate rather than silently resolved to the last one -- the shape
    the kit is most likely to grow, and the one a parse would hide.
    """
    start = text.find('"tokens"')
    if start < 0:
        return {}, ["%s: no `tokens` object" % TOKENS_JSON]
    out = {}
    problems = []
    for name, value in JSON_ENTRY_RE.findall(text[start:]):
        key = "--" + name
        if key in out:
            problems.append("%s: `%s` is declared twice" % (TOKENS_JSON, name))
        out[key] = normalise(value)
    return out, problems


def main():
    problems = []

    site, site_problems = parse_css_tokens(read(STYLESHEET), STYLESHEET)
    problems += site_problems
    kit_css, kit_problems = parse_css_tokens(read(TOKENS_CSS), TOKENS_CSS)
    problems += kit_problems
    kit_json, json_problems = parse_json_tokens(read(TOKENS_JSON))
    problems += json_problems

    if not site:
        print("FAIL %s carries no tokens -- nothing to verify against" % STYLESHEET)
        return 1

    for path, kit in ((TOKENS_CSS, kit_css), (TOKENS_JSON, kit_json)):
        for name in sorted(kit):
            if name not in site:
                problems.append(
                    "%s: `%s` is published by the kit and is not in %s:root"
                    % (path, name, STYLESHEET)
                )
                continue
            if kit[name] != site[name]:
                problems.append(
                    "%s: `%s` is %s; %s says %s"
                    % (path, name, kit[name], STYLESHEET, site[name])
                )

    # The other direction, which is the half a one-way check cannot see: a
    # value the stylesheet declares and the kit omits is a theme value nobody
    # reading the kit knows exists. `--shadow` was exactly that for as long as
    # the kit had been written, and the one-way check called the kit complete.
    for name in sorted(set(site) - set(kit_css)):
        problems.append(
            "%s:root declares `%s` and the kit does not publish it — the kit "
            "is the interface to the theme, so a value missing from it is a "
            "value a designer cannot find" % (STYLESHEET, name)
        )

    only_css = sorted(set(kit_css) - set(kit_json))
    only_json = sorted(set(kit_json) - set(kit_css))
    for name in only_css:
        problems.append(
            "%s publishes `%s` and %s does not" % (TOKENS_CSS, name, TOKENS_JSON)
        )
    for name in only_json:
        problems.append(
            "%s publishes `%s` and %s does not" % (TOKENS_JSON, name, TOKENS_CSS)
        )

    if problems:
        for line in problems:
            print("FAIL %s" % line)
        return 1

    print(
        "brand: %d tokens published, every one matches %s, and the kit covers every value the stylesheet declares."
        % (len(kit_css), STYLESHEET)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
