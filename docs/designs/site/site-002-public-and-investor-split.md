---
code: SITE-002
title: Public and investor chapter split
domain: site
prd_refs: [SITE-002, SEC-R01, P-01, P-02]
depends_on: [SITE-001]
depended_by: []
layers_touched: [frontend, ui]
cross_cutting_rules: [SEC-R01, P-01, P-02]
status: implemented
---

# `SITE-002` — Public and investor chapter split

## 1. Purpose and PRD refs

Two views of one page. Realizes `SITE-002`, and is the feature `INV-002` replaces
when there is a server to hold the gate.

The **public view** is the argument a visitor is owed: the problem, the answer as
three services, their own place in it, the reasons to believe it, the workforce,
the brain, and what they keep. The **investor view** adds the two chapters that
are the inside of the business — the five-phase delivery model and the portfolio
— and the three mechanisms under each of the seven answers.

The line is not drawn for secrecy. It is drawn because a buyer needs a decision
and an investor needs a model, and one page cannot make both cases without
becoming a hybrid that serves neither. The page was that hybrid until the split.

## 2. Layer walkthrough

**Down.** A class on the root element selects the view. Gated chapters carry
`chapter--gated` and gated nav links `nav-gated`; the mechanism detail under each
of the seven answers carries `cap-detail`, with a `cap-locked` line standing in
its place for a visitor.

**Up.** Nothing reports which view a reader is in. The demonstration stores a
session flag and nothing else.

## 3. Contracts

    .chapter--gated, .nav-gated   { display: none }
    .investor .chapter--gated     { display: block }
    .investor .nav-gated          { display: inline-block }
    .cap-detail                   { display: none }
    .investor .cap-detail         { display: grid }
    .investor .cap-locked         { display: none }

Gated: `#deliver` (the five-phase delivery model) and `#ecosystem` (the
portfolio), plus the mechanism detail under all seven trust answers.

**The gated chapters stay in the document rather than being cut from it.** The
copy and its twenty translations are the same copy the investor deck will carry,
and a chapter deleted to hide it is a chapter that has to be written again.

A folded chapter has **no box**, so the chapter spine drops it and the journey
spans it; and a station written for a folded chapter is dropped with it, because
a place the world visits for a chapter that is not there reads as the world
wandering. That coupling belongs to `SCENE-001`, and it is why gating a chapter
is two classes rather than a re-tuning.

## 4. Integration

**`SITE-001`** is the page both views are of. **`SCENE-001`** re-measures its
spine when the fold changes the document's height, and drops the stations of
folded chapters. **`INV-002`** replaces the whole of this with a server decision.

## 5. Cross-cutting compliance

- **`SEC-R01`** — **this is a demonstration, not a security control.** The site is
  static and has no server: the detail ships inside the page and anyone reading
  the source can find it. **Nothing may be put behind it that would matter if
  read.** It exists so the two views are separate, as the design intends, and so a
  real gate has somewhere to go.
- **`P-01`** — the public view is a complete argument, not a teaser.
- **`P-02`** — nothing in the copy describes the gated material as protected.

## 6. Open questions and trade-offs

- Nothing open. The feature is a placeholder with a named end: `INV-002`.

## 7. Task list

- `SITE-002/T1` — How-we-deliver and the portfolio are hidden from a visitor and shown to a signed-in reader
- `SITE-002/T2` — The mechanism detail under each of seven trust claims opens behind the sign-in
- `SITE-002/T3` — The navigation names the gated pair only to a signed-in reader
- `SITE-002/T4` — The split is enforced by the server rather than by CSS
