---
code: SITE-003
title: Chapter sequence
domain: site
prd_refs: [SITE-003, P-01]
depends_on: [SITE-001]
depended_by: [SCENE-001]
layers_touched: [frontend]
cross_cutting_rules: [P-01, I18N-R01]
status: implemented
---

# `SITE-003` — Chapter sequence

## 1. Purpose and PRD refs

The order the argument is made in, and the side each chapter leaves open.
Realizes `SITE-003`. It is a `site` feature rather than a `scene` one because the
sequence **is** the argument; the journey follows it rather than the other way
round.

## 2. Layer walkthrough

**Down.** Nine sections in `index.html`, two of them gated, each declaring which
side its argument holds.

**Up.** `SCENE-001` measures their tops and maps them onto the journey's
canonical fractions, so a change here is re-measured rather than re-tuned.

## 3. Contracts

The sequence is the reference designer's: **the answer is followed by the
reader's own place in it, then by the reasons to believe it, and only then by
what the workforce does.**

| # | Chapter | View | Argument holds | What it does |
|---|---|---|---|---|
| 1 | Hero | public | the frame | The claim, three trust markers, one call to action |
| 2 | The Problem | public | right | Three panels in orbit — hiring, disconnected tools, scattered data |
| 3 | The Answer | public | right | Three services and the phases each covers |
| — | How we deliver | investor | right | Five phases, each with its outcome |
| 4 | How your people fit in | public | both, channel between | What your team directs against what the workforce delivers |
| 5 | Why leaders trust ValoLab | public | left | Seven structural answers |
| 6 | The workforce | public | left | Nine departments, what each one does |
| 7 | ValoStack | public | right | The cross-engagement brain, and the consent it runs on |
| 8 | Yours, not ours | public | right | What the engagement leaves in your hands |
| — | One company, a family of products | investor | right | The six products, in recessed trays |
| — | Footer | public | left | The engagement, contact, company, legal |

**The world takes the side each chapter leaves open:** two on the left, the
centre through the chapter whose argument runs down a channel, two on the right,
two on the left to close. That is **one crossing of the frame in the whole page**,
and a crossing is the movement most likely to put the disc behind a heading.

**The close is a station like any chapter.** Its copy holds the left of the frame
and its two columns leave only the right strip open, so the world crosses out to
the right as the footer arrives. Parked on the left it spent the last screen of
the page behind the heading it was there to close under.

## 4. Integration

**`SITE-001`** provides the layout rule each chapter declares against.
**`SCENE-001`** keys its spine to these chapters: reordering them re-measures the
spine, and a chapter added without a station is spanned rather than broken.

## 5. Cross-cutting compliance

- **`P-01`** — the eight public chapters are a complete argument.
- **`I18N-R01`** — every heading and lede is a dictionary key.

## 6. Open questions and trade-offs

- **Pricing.** The reference has no pricing chapter on its public page. What this
  page's navigation once called Pricing is the contact close, and why it stayed
  is `decisions-log.md#SITE-DEC-03`.

## 7. Task list

- `SITE-003/T1` — Nine sections in the reference order, each declaring the side its argument holds
- `SITE-003/T2` — Two chapters gated, and the journey spans them when they are folded
