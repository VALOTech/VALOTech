---
code: A11Y-001
title: Accessibility baseline
domain: a11y
prd_refs: [A11Y-001, A11Y-R01, A11Y-R02, A11Y-R03, A11Y-R04]
depends_on: [SITE-001]
depended_by: []
layers_touched: [frontend, ui]
cross_cutting_rules: [A11Y-R01, A11Y-R02, A11Y-R03, A11Y-R04, SCENE-R04]
status: implemented
---

# `A11Y-001` — Accessibility baseline

## 1. Purpose and PRD refs

What the page owes a reader who does not use it the way it was designed to be
used. Realizes `A11Y-001` and carries `A11Y-R01` through `R04`.

This is a page whose whole idea is motion over a dark ground, which is exactly
the combination that goes wrong for the people this design is for. So the rules
below are not a checklist appended to the design; two of them changed the design.

## 2. Layer walkthrough

**Down.** Semantic landmarks, a localized skip link, `aria-label`s from the
dictionary, focus styles in the design system, a `prefers-reduced-motion` branch
in both the stylesheet and the scene, and a print stylesheet.

**Up.** Nothing is measured or reported.

## 3. Contracts

### Keyboard and focus

Every interactive element is reachable by keyboard with a **visible focus ring
that meets contrast against the panel it sits on, not against the void**. A ring
tuned against the page ground disappears the moment the control is on a panel,
which is where most of them are.

Focus never lands on something still fading in: a reveal that has not run yet is
not a focus target.

### Contrast

Text contrast is measured against the **painted pixel** — panel fill over planet
over star field — not token against token (`A11Y-R03`). A pair that passes on
paper can fail over a bright limb, and the limb moves. This is why panel fill is
opaque enough that the planet never reads through the right-hand side of a
paragraph, and why a label carries the near-black card ground rather than the
lighter glass.

### Reduced motion

`prefers-reduced-motion` slows the planet's rotation to 0.9°/s and the satellites
to a sixth of their pace, and disables the scroll boost, the intro approach, the
pointer parallax, the orbiting chapters, the mapping stage's stepping and every
scroll-driven reveal. **Every chapter shows its full content as a stacked list.**

It slows rather than freezes because a frozen scene reads as a page that failed
to load, and because 0.9°/s is below the threshold at which motion is noticed
without being watched for — which is what the setting is about. Nothing in the
argument depends on any of the motion (`SCENE-R04`).

### A block the scroll flew past

An `IntersectionObserver` is notified only when a ratio **crosses** a threshold,
so a flick of the wheel that carries a block from below the fold to above it in
one frame crosses nothing, and the block stays invisible for the rest of the
session. The same blindness left the navigation's current-chapter mark pointing
at wherever the reader used to be. **Both now read position directly** rather
than waiting to be told it changed.

This is filed here rather than under `SITE-001` because its victim is specific:
a reader who scrolls in large jumps, which includes anyone driving the page from
a keyboard.

### The scene

`aria-hidden`. It carries no information the text does not (`A11Y-R04`). That is
a constraint on the scene rather than an attribute on it: an effect that says
something the words do not is an effect a screen reader cannot deliver.

### Print

A print stylesheet puts the page on paper in black on white, with the scene, the
header and the chrome gone.

## 4. Integration

**`SITE-001`** provides the palette these ratios are measured over and the focus
tokens. **`SCENE-001`**, **`SCENE-005`** and **`SCENE-006`** each carry their own
reduced-motion branch, because each has velocity of its own to stop.

## 5. Cross-cutting compliance

- **`A11Y-R01`** — keyboard reach and a visible ring on every control.
- **`A11Y-R02`** — an accessible name on every interactive element, from the
  dictionary so it is translated.
- **`A11Y-R03`** — contrast against the painted pixel.
- **`A11Y-R04`** — the scene is decorative to assistive technology.
- **`SCENE-R04`** — reduced motion slows rather than freezes.

## 6. Open questions and trade-offs

- **An audit by a screen-reader user.** Everything above was verified by
  measurement and by driving the page from a keyboard; none of it was verified by
  someone who uses a screen reader daily. That is the same class of gap as
  `REVIEW/T1` for the locales, and it is not closed by any check written here.
- **`prefers-contrast`.** Not implemented. The palette has one theme, and a
  high-contrast variant would be a second design rather than a token swap.

## 7. Task list

- `A11Y-001/T1` — Keyboard reach and a focus ring measured against the panel, not the void
- `A11Y-001/T2` — Contrast measured against the painted pixel across five label chapters
- `A11Y-001/T3` — Reduced motion slows the scene and shows every chapter as a stacked list
- `A11Y-001/T4` — Reveals and the nav mark read position directly rather than waiting for a threshold
- `A11Y-001/T5` — A print stylesheet in black on white
