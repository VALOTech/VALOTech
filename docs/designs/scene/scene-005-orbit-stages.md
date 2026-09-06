---
code: SCENE-005
title: Orbit stages
domain: scene
prd_refs: [SCENE-005, SCENE-R02, SCENE-R03, SCENE-R04]
depends_on: [SCENE-001]
depended_by: []
layers_touched: [scene, frontend, ui]
cross_cutting_rules: [SCENE-R02, SCENE-R03, SCENE-R04, A11Y-R01]
status: implemented
---

# `SCENE-005` — Orbit stages

## 1. Purpose and PRD refs

*The problem corporate leaders face today* and *The answer* are the designer's
own composition: the cards travel **around** the world rather than sitting in a
list beside it. Realizes `SCENE-005`.

The mechanism knows nothing about either chapter. A chapter opts in by declaring
`data-orbit` and its cards by `data-orbit-card`; adding a third is two
attributes.

## 2. Layer walkthrough

**Down.** Above 950px the chapter is a 340vh stage with its argument pinned to
the reading-start side and its `.wrap` sticky. A driver reads the planet's
published position each frame and writes each card's `left`, `top`, `transform`,
`opacity`, `filter` and mask.

**Up.** Nothing reads from the stage. It reads the planet and the pinned
heading's box.

## 3. Contracts

### The ellipse

Each card rides `90° + i·(360/n)° − progress·240°` — two thirds of a revolution
across the chapter, so every card passes behind the world once.

Depth drives everything else: `depth = (sin θ + 1) / 2` gives scale
`0.74 + 0.26·depth`, opacity `0.48 + 0.52·depth`, blur `(1 − depth) × 1.2px`.

**Bounded by the frame, not by a constant.** The horizontal radius is the
smaller of the design value, the room between the planet and the pinned column,
and the room between the planet and the window edge. A card can therefore never
land on the argument or leave the page at any viewport without a breakpoint being
tuned for it.

**And floored by the world.** Where the room and the disc disagree the disc wins:
a card cannot be drawn inside the world, and a heading can be read beside a
slightly wider ellipse. Held instead at a flat pixel figure while the world grew
with the frame, a 312px radius put all three cards inside a 333px disc at 3840
and piled them on one another. For the same reason the disc's radius is **read
from the `.planet` element** rather than restated from the stylesheet's numbers —
that number has already changed once, and a second copy of it is true only until
it does — and the card's own width grows with `--up` (`SCENE-R02`).

### The rear card

**A far card cannot be put behind the planet with z-index.** The planet lives in
a fixed layer at the bottom of the page's stacking order and every chapter sits
above it, so stacking can only ever put a card in front.

A rear card is **masked** instead: a radial-gradient cut-out the size of the
drawn disc, at the disc's position expressed in the card's own coordinates —
offset and radius both divided by the card's scale, because the mask is applied
before it.

### The stage takes the frame

Because it is a stage and not a column. Its cards are placed in viewport
coordinates, so holding its argument inside the centred reading container leaves
dead frame beside the heading and squeezes the heading into a ribbon. Measured at
1920: the heading was 320px wide, the answer ran to seven lines, 348px of frame
sat empty to the right of it, and the cards still reached 23px past its left
edge.

### The stage keeps its own clock

The cards are placed against the planet, and the planet goes on easing to its
station after the reader stops. Driven by scroll alone the cards freeze where the
world used to be, and the stage comes apart into a world in one place and its
cards in another. The loop keeps itself alive **exactly while a stage is pinned**
and stops the moment none is, so the page still animates nothing when nothing is
on stage (`SCENE-R03`).

### Below the breakpoint

Below 950px, and under reduced motion at any width, the chapter is the plain
stacked list it is underneath — same cards, same order, staggered indents, marker
squares back (`SCENE-R04`). Nothing in the argument depends on the motion.

### Mirroring

**The whole composition mirrors with the reading direction.** Under Arabic and
Urdu the argument is pinned to the right, so the journey's stations and the
star's bearing are reflected about the vertical axis and the orbit measures its
room against whichever side of the column the planet is on. The scene still
paints in physical coordinates — it has no reading order of its own — but where
it *stands* follows the page.

## 4. Integration

**`SCENE-001`** publishes the planet's position and scale, and the stage reads
its `.planet` element for the disc. **`SITE-003`** decides which chapters declare
`data-orbit` — two of them.

## 5. Cross-cutting compliance

- **`SCENE-R02`** — the disc is measured from the element; the ellipse and the
  card width scale with the world.
- **`SCENE-R03`** — the loop lives only while a stage holds the frame.
- **`SCENE-R04`** — the plain stacked list, with everything present.
- **`A11Y-R01`** — the cards are ordinary elements in document order; the motion
  is presentation, and a keyboard reaches them in the order they are written.

## 6. Open questions and trade-offs

- **A third orbit chapter.** The mechanism supports it for two attributes. Not
  used: two is a rhythm and three is a pattern the reader starts predicting.

## 7. Task list

- `SCENE-005/T1` — Two chapters whose cards ride an ellipse about the world, a rear card masked rather than stacked
- `SCENE-005/T2` — The stage takes the frame, and its heading is not squeezed into a ribbon
- `SCENE-005/T3` — The ellipse and the mask are measured from the world, not from a copy of its stylesheet value
- `SCENE-005/T4` — The stage keeps its own clock while it holds the frame
