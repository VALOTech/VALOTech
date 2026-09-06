---
code: SCENE-003
title: The sky
domain: scene
prd_refs: [SCENE-003, SCENE-R02, SCENE-R03, SCENE-R04]
depends_on: [SCENE-001]
depended_by: []
layers_touched: [scene]
cross_cutting_rules: [SCENE-R02, SCENE-R03, SCENE-R04]
status: implemented
---

# `SCENE-003` — The sky

## 1. Purpose and PRD refs

Everything behind the world: a star field in three parallax tiers, meteors that
end somewhere, and the rare event that makes a reader look twice. Realizes
`SCENE-003`. It is drawn on 2D canvases rather than in the WebGL scene, so the
page has a sky even where the planet cannot run — a machine with WebGL disabled
still gets depth rather than flat black.

## 2. Layer walkthrough

**Down.** `assets/scene/stars.js` builds the field once per resize, in three
depth tiers with their own radius, alpha and parallax share. It redraws when the
page has moved under it, when the orbit has carried the sky far enough to see, or
while an event is alive — never otherwise.

**Up.** Nothing reads from the sky. It reads `SCENE-001`'s published bearing and
the planet's measured disc.

## 3. Contracts

### The field

One star per 2,600 CSS pixels of viewport, capped at 1,400. Three tiers by
radius, alpha and parallax share; stars wrap over a band twice the viewport's
height so a tier can travel without the top edge running dry.

**A field drawn in one colour is the difference between a photograph and a
texture**, and it is the first thing a reader calls monotonous without being able
to say why. Stars carry a colour temperature: mostly white and blue-white, a seam
of yellow, a few orange, the occasional red. Only the two nearer tiers take it —
the eye cannot resolve the colour of a faint star either, so tinting the far
field would be a claim the sky itself does not make.

### Scintillation, in two kinds

One of them is not what the word describes.

- **The slow kind** is a pair of sines on a sixth of the field, each star on its
  own period of three to nine seconds and on two rates at once: a single sine is
  a metronome and a sky is not. That is the sky breathing, and it belongs under
  notice.
- **The fast kind** is the twinkle itself — one star flaring to nearly three
  times its brightness for a fifth of a second and gone, one at a time, seconds
  apart. Sparse on purpose: the eye finds a single flare in an empty sky and
  stops finding any once several run together. The flare rises in a fifth of its
  life and falls over the rest, because a glint that fades the way it rose reads
  as a pulse.

### The supernova

Rare enough that meeting one is luck rather than a feature: the first no sooner
than twenty-two seconds in, then one every one to two and a half minutes. It
rises over nine tenths of a second, holds briefly, falls over six, and leaves a
shell expanding to a hundred and fifty pixels and thinning to nothing — the shape
of a light curve, not of a flash.

It grows **diffraction spikes**, whose absence is what makes a bright dot read as
a dot. It is placed in the field's own coordinates so it travels with the sky
rather than sitting on the glass, on a far tier, and clear of the world: an event
behind the disc is an event nobody sees.

### Meteors

One crosses every few seconds, at a random time, from a random edge, on a shallow
angle — rare enough to stay an event rather than a shower. Drawn on their own 2D
canvas **behind** the planet, so a streak vanishes behind it and the sky gains a
depth the star field alone cannot give. Half are aimed at the world.

**An aimed one that reaches the drawn limb ends there, and what happens next is
the whole point of aiming it.**

- On the **bare rock** it detonates: an expanding shock ring, a warm flash, and
  debris thrown along the shallow angle it arrived on, never back through the
  body it just struck.
- On the **living world** it is drunk in: a cool bloom that swells and fades, no
  debris.

It is the atmosphere doing it — a world with air takes the strike rather than
shattering under it — so the ending is pinned to the atmosphere's own arrival,
changing at a scrub of 0.55, just after the shell begins to appear at 0.46. The
two read apart at a glance and measure apart too: warm pixels outnumber cool by
an order of magnitude on the first, and cool outnumber warm by more on the
second.

**The sky quiets rather than emptying** as the world comes alive: the gap between
meteors stretches with the growth scrub, so the dead sky is the busy one and the
living world is met by the occasional arrival. It never reaches nothing. A sky
with nothing crossing it cannot deliver the second ending, and what the
atmosphere does to an arrival is the reason the meteor was aimed.

The strike radius is **measured from the planet element**, never restated from
its stylesheet numbers, so resizing the world cannot leave meteors striking a
circle that is no longer where it is (`SCENE-R02`).

## 4. Integration

**`SCENE-001`** publishes the star's bearing that the field slides against, the
growth scrub the quieting reads, and the disc a meteor strikes.

## 5. Cross-cutting compliance

- **`SCENE-R02`** — the strike radius is measured, not restated.
- **`SCENE-R03`** — three loops, each alive only while something is. The meteors'
  loop exists while one is in flight or an impact is fading; between them nothing
  is scheduled. Both kinds of star event live on the twinkle's clock rather than
  on loops of their own — a tenth-of-a-second tick, a sky does not need sixty of
  them a second, tightening to forty milliseconds only while something runs.
- **`SCENE-R04`** — reduced motion suppresses meteors entirely and stops the
  twinkle clock; a hidden tab stops both. **A star left mid-flare when the tab
  hides would still be bright when the reader returns**, so the flares are
  cleared rather than paused.

Measured at 1920 × 1080: one full redraw of the field with an event alive costs
**2.1 ms** at the median.

## 6. Open questions and trade-offs

- **A Milky Way band.** A diagonal of denser, dimmer stars with faint nebulosity
  would be the single largest gain against monotony still available, and is
  astronomically true. Not built: it is a compositional element that would
  compete with the argument for the reader's eye, and that is a judgement worth
  making deliberately rather than in passing.
- **Comets.** A slow crossing over many seconds would read differently from a
  meteor's flick. Same reason, less gain.

## 7. Task list

- `SCENE-003/T1` — A parallaxed field in three depth tiers, against the orbit's bearing
- `SCENE-003/T2` — Meteors with two endings: a crater on the rock, absorption on the living world
- `SCENE-003/T3` — Colour temperature, a discrete twinkle, and a rare supernova
