"""Roadmap policy helper.

Reads `docs/roadmap-policy.yaml` and walks the design dependency graph to
answer one question per feature: which wave does it belong to. Deterministic,
side-effect-free, and the single place that answer is computed -- the
generator, the validator and anything else that needs it call in here rather
than each parsing the graph its own way, because two parsers of one graph is
two answers waiting to disagree.

There are no lanes here. The siblings partition their features across three
concurrent lanes because three windows work them at once; this repository has
one, and a lane field that always reads the same value is a column that
teaches a reader nothing and a rule nobody can violate.

Public API
----------
- load_policy() -> Policy
- load_designs() -> dict[code, FrontMatter]
- compute_depth_map(designs) -> dict[code, int]
- resolve_wave(code, depth, policy) -> int | None
- is_excluded_from_exit(fm) -> bool
- classify_blocker(text, wave, designs, depth_map, policy) -> str
- referenced_codes(text) -> list[str]
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

ROOT = Path(__file__).resolve().parent.parent
POLICY_FILE = ROOT / "docs" / "roadmap-policy.yaml"
DESIGNS_DIR = ROOT / "docs" / "designs"

# A design in one of these states is part of the plan and takes a wave. The
# others -- pending-external, pending-decision, deprecated -- are excluded, so
# a feature waiting on the owner cannot hold a wave open.
ROADMAP_STATUSES = {"draft", "under-review", "design-ready", "implemented"}
EXCLUDED_STATUSES = {"pending-external", "pending-decision", "deprecated"}

# The domain grammar is `[A-Z][A-Z0-9-]*` and not `[A-Z]+`: a letters-only
# prefix silently drops every I18N-* and A11Y-* feature, which is how a
# roadmap comes to describe a subset of the tree while reporting a total.
CODE_RE = re.compile(r"\b([A-Z][A-Z0-9-]*-\d{3})(?:/T\d+[a-z]?\d*)?\b")

_FM_CODE = re.compile(r"^code:\s*(\S+)\s*$", re.M)
_FM_STATUS = re.compile(r"^status:\s*(\S+)\s*$", re.M)
_FM_DEPS = re.compile(r"^depends_on:\s*\[([^\]]*)\]", re.M)
_FM_CLUSTER = re.compile(r"^bootstrap_cluster:\s*(\S+)", re.M)


@dataclass
class FrontMatter:
    code: str
    status: str
    path: Path
    depends_on: list = field(default_factory=list)
    cluster: Optional[str] = None


@dataclass
class Policy:
    active_wave: int
    wave_ranges: dict
    wave_titles: dict
    wave_summaries: dict
    wave_overrides: dict
    raw: dict


# ---------------------------------------------------------------------------
# Designs
# ---------------------------------------------------------------------------

def _parse_frontmatter(path: Path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    block = text[3:end]
    m_code = _FM_CODE.search(block)
    if not m_code:
        return None
    m_status = _FM_STATUS.search(block)
    deps = []
    m_deps = _FM_DEPS.search(block)
    if m_deps:
        deps = [x.strip() for x in m_deps.group(1).split(",") if x.strip()]
    m_cluster = _FM_CLUSTER.search(block)
    return FrontMatter(
        code=m_code.group(1).strip(),
        status=m_status.group(1).strip() if m_status else "unknown",
        path=path,
        depends_on=deps,
        cluster=m_cluster.group(1).strip() if m_cluster else None,
    )


def load_designs():
    """Every design under docs/designs/, keyed by code."""
    out = {}
    for p in sorted(DESIGNS_DIR.rglob("*.md")):
        if p.name.startswith("_") or p.name.lower() == "readme.md":
            continue
        fm = _parse_frontmatter(p)
        if fm is not None:
            out[fm.code] = fm
    # An edge to a code that has no design cannot carry depth. Dropping it here
    # keeps the arithmetic finite; validate-designs.py is what refuses it.
    known = set(out)
    for fm in out.values():
        fm.depends_on = [d for d in fm.depends_on if d in known]
    return out


# ---------------------------------------------------------------------------
# Depth
# ---------------------------------------------------------------------------

def compute_depth_map(designs):
    """Topological depth: depth(F) = 1 + max(depth(D) for D in F.depends_on).

    Members of a declared bootstrap cluster ignore edges to each other, so a
    cluster behaves as one equivalence class. Without that, a foundation whose
    parts genuinely need each other has no finite depth at all.
    """
    members = defaultdict(list)
    for fm in designs.values():
        if fm.cluster:
            members[fm.cluster].append(fm.code)

    def reduced(code):
        fm = designs[code]
        if fm.cluster:
            same = members.get(fm.cluster, [])
            return [u for u in fm.depends_on if u not in same]
        return fm.depends_on

    planned = {c for c, fm in designs.items() if fm.status in ROADMAP_STATUSES}
    depth = {}

    def visit(code, stack=()):
        if code in depth:
            return depth[code]
        if code in stack:
            # A cycle outside a declared cluster is a defect the design
            # validator refuses; treat it as a root here so the arithmetic
            # still terminates and the failure is reported once, there.
            return 0
        stack = stack + (code,)
        ups = [u for u in reduced(code) if u in planned]
        depth[code] = 1 + max(visit(u, stack) for u in ups) if ups else 0
        return depth[code]

    for code in list(planned):
        visit(code)
    return depth


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------

def load_policy():
    raw = yaml.safe_load(POLICY_FILE.read_text(encoding="utf-8"))
    ranges, titles, summaries = {}, {}, {}
    for key, body in (raw.get("waves") or {}).items():
        wid = int(str(key).lstrip("W"))
        lo, hi = body["depth_range"]
        ranges[wid] = (int(lo), int(hi))
        titles[wid] = body.get("title", "Wave %d" % wid)
        summaries[wid] = (body.get("summary") or "").strip()
    overrides = {}
    for code, val in (raw.get("wave_overrides") or {}).items():
        overrides[code] = int(val["wave"] if isinstance(val, dict) else val)
    return Policy(
        active_wave=int(raw.get("active_wave", 0)),
        wave_ranges=ranges,
        wave_titles=titles,
        wave_summaries=summaries,
        wave_overrides=overrides,
        raw=raw,
    )


def is_excluded_from_exit(fm):
    """Excluded iff the design says so itself.

    There is no manual exclusion list, so prose and policy cannot drift: to
    exclude a feature, set its own status; to re-include it, set it back.
    """
    return fm.status in EXCLUDED_STATUSES


def resolve_wave(code, depth, policy):
    if code in policy.wave_overrides:
        return policy.wave_overrides[code]
    if depth is None:
        return None
    for wid, (lo, hi) in sorted(policy.wave_ranges.items()):
        if lo <= depth <= hi:
            return wid
    return max(policy.wave_ranges) if policy.wave_ranges else None


# ---------------------------------------------------------------------------
# Blockers
# ---------------------------------------------------------------------------

def referenced_codes(text):
    """Feature codes named anywhere in a line."""
    return sorted({m.group(1) for m in CODE_RE.finditer(text)})


def _direct_part(text):
    """The blocker list, before the prose that explains it.

    A `Blocked by:` line reads `<what blocks it> -- <why>`, and the why often
    names a later feature in passing. Classifying on the whole line lets that
    mention flip the verdict, so only the head is read.
    """
    cut = len(text)
    for sep in (" — ", " -- ", ". ", " ("):
        i = text.find(sep)
        if 0 <= i < cut:
            cut = i
    return text[:cut]


def classify_blocker(text, task_wave, designs, depth_map, policy):
    """One of: external, pending-decision, cross-wave-parked, in-graph.

    The split that matters is the first two: an external blocker leaves a
    mechanism that can still be built ahead of it, and an unmade decision does
    not. Collapsing them into one word tells a session to build something the
    owner has not chosen yet.
    """
    head = _direct_part(text).lower()
    if "pending-decision:" in head:
        return "pending-decision"
    if "pending-external:" in head:
        return "external"
    refs = referenced_codes(_direct_part(text))
    if not refs:
        return "in-graph"
    parked = False
    for code in refs:
        fm = designs.get(code)
        if fm is not None and is_excluded_from_exit(fm):
            return "pending-decision" if fm.status == "pending-decision" else "external"
        w = resolve_wave(code, depth_map.get(code), policy)
        if w is not None and task_wave is not None and w > task_wave:
            parked = True
    return "cross-wave-parked" if parked else "in-graph"
