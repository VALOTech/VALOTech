---
code: SCENE-004
title: Annotation chips
domain: scene
prd_refs: [SCENE-004, SCENE-R02, SCENE-R03, I18N-R01]
depends_on: [SCENE-001, SCENE-002]
depended_by: []
layers_touched: [scene, frontend, ui]
cross_cutting_rules: [SCENE-R02, SCENE-R03, I18N-R01, A11Y-R03]
status: implemented
---

# `SCENE-004` — Annotation chips

## 1. Purpose and PRD refs

Short labels pinned around the world, connected by a small lit square, rather
than a column of prose beside it — the designer's own device, and the reason her
planet is never covered. Fifteen across five chapters. Realizes `SCENE-004`.

## 2. Layer walkthrough

**Down.** Each chapter that names bodies carries a `.chips` group; a driver reads
`window.VALO_STAGE` each frame, decides which chapter may name, and writes each
chip's position.

**Up.** Nothing reads from the chips. Their text is drawn from the dictionary
(`I18N-R01`), so a chip is translated like any other string.

## 3. Contracts

### Pinning

Each chip is pinned to **one body** and follows it round, measured at thirty to
fifty pixels from it at every point of every orbit, because a label that drifts
from the thing it names stops naming it.

**A label opens away from the disc, not away along its body's own path.** The
orbit is a flat ellipse, so a body on its near or far half sits in front of or
behind the world while its horizontal direction still points inward, and the
label then lands on the planet's face. Where neither side clears the disc the
label stays with its body and crosses it — a body passing over the world is named
over the world, as the reference has it, because a label that let go of its body
to avoid the disc would be pointing at nothing.

Within the space it is allowed, a chip opens away from the planet and takes the
near side when the far one has no room — **never a clamp**. Clamping is what
leaves a label at the edge of the allowed space pointing at nothing, which is
worse than opening on the unexpected side.

### Which chapter may name

**Only one chapter names the bodies at a time.** Two chapters in frame together
pin their labels to the same three bodies, so six labels land on three positions
and print on top of each other — which reads as one line split in half rather
than as two chapters overlapping.

The chapter the reader is **level with** wins. Level with means the reading line
falls *inside* that chapter, not that its centre is nearest the line: on a tall
frame two chapters share the view and a shorter one's centre can sit further away
while its text is the text under the reader's eye — which is how a chapter with
every right to name the bodies went its whole length without once doing so.

That chapter shows its labels only when three further things hold:

1. it holds the frame,
2. the planet has stopped, and
3. **the planet stands in the space this chapter left for it.**

The third is not implied by the second. The planet parks at one chapter's station
and is perfectly motionless there while the next chapter comes into frame, and
labels lit at that moment point at bodies orbiting somewhere else entirely. The
test is written against the **whole orbit** rather than the planet's centre: what
prints itself over a sentence is the body swinging out to the far side of its
path, and the label chasing it.

### Appearance

A chip carries the same near-black ground as a chapter card rather than the
lighter glass the panels use. Glass is right for a panel sitting on a chapter's
own dark scrim; a chip sits on the lit world itself, and the blue in the glass
reads as a second colour against it (`A11Y-R03` — contrast is measured against
the painted pixel, and the painted pixel here is a moving planet).

### The words

Their text is drawn from strings the dictionary already carried and no chapter
rendered: the three architecture layers, the phase outcomes, the ownership
promises. Nothing new had to be written or translated, and content the business
team had already written stopped being orphaned.

## 4. Integration

**`SCENE-002`** publishes the reach a chip clears against and the position of the
body it names. **`SCENE-001`** publishes whether the planet has arrived.
**`SITE-003`** decides which chapters carry chips — five of them.

## 5. Cross-cutting compliance

- **`SCENE-R02`** — the clearance is measured against the published reach, not a
  restated constant.
- **`SCENE-R03`** — the driver's frame loop runs while a chapter is showing and
  stops when none is; a four-hundred-millisecond tick keeps it alive between
  scrolls, because the bodies move on their own clock.
- **`I18N-R01`** — every chip is a dictionary key.
- **`A11Y-R03`** — contrast measured over the planet, not over a token.

## 6. Open questions and trade-offs

- **A chip crossing the world's face.** Measured at 1920 across the four label
  chapters: a chip's rectangle touched the drawn disc in 42 of 117 frames it was
  shown in. The dominant case is a satellite passing in front of or behind the
  world, where no horizontal offset clears the disc and the label rightly stays
  with its body — the reference design does the same. **This is a deliberate
  acceptance, recorded here so a future reader does not rediscover it as a
  defect.** Reopen it if the owner reads the crossing as clutter; the fix is not
  a wider offset, which was measured and pushes a chip off the frame, but a
  depth cue on the chip that matches the one its satellite already carries.

## 7. Task list

- `SCENE-004/T1` — Fifteen chips across five chapters, each pinned to one body
- `SCENE-004/T2` — Only one chapter names the bodies at a time, chosen by the reading line
- `SCENE-004/T3` — A chip opens away from the disc, and never clamps
