---
code: SCENE-002
title: Satellites and their rings
domain: scene
prd_refs: [SCENE-002, SCENE-R02, SCENE-R03, SCENE-R04]
depends_on: [SCENE-001]
depended_by: [SCENE-004]
layers_touched: [scene, ui]
cross_cutting_rules: [SCENE-R02, SCENE-R03, SCENE-R04]
status: implemented
---

# `SCENE-002` — Satellites and their rings

## 1. Purpose and PRD refs

Three bodies on three drawn paths about the world: one moon carrying the
organisation's people, two built craft carrying what is being built. They are the
argument in orbit, and they are what `SCENE-004`'s labels are pinned to. Realizes
`SCENE-002`.

## 2. Layer walkthrough

**Down.** `boot.js` builds two SVG layers — one clipped to the far half of the
box, one to the near half — and places the same three bodies in each, so a body
on the far half is drawn under the planet and on the near half over it. Position
comes from one table of radii, sizes and phases; the drawing comes from the
`kind` in that same row.

**Up.** The outermost reach is published once, from the same table, because
everything that reads it is deciding whether the orbit clears something.

## 3. Contracts

### The table

| kind | rx | ry | r | period | phase | label |
|---|---|---|---|---|---|---|
| moon | 92 | 40 | 6.4 | 48 s | 0 | `YOUR PEOPLE` |
| craft | 78 | 35 | 3.4 | 48 s | ⅓ | `AI` |
| craft | 64 | 32 | 3.4 | 48 s | ⅔ | — |

Radii are in the SVG's own units; the box is sized from `--planet`, so the whole
system scales with the world (`SCENE-R02`).

### One period, and why it is not three

All three share **one period**, and that is the whole of what keeps them apart.
On separate periods the phase offsets drift: three bodies written a third of a
turn apart closed to thirty-five degrees inside a minute, which is the clumping
that makes an orbit read as three unrelated dots. One period holds the third of a
turn for as long as the page is open, and the period is the planet's own, so the
system reads as one thing. What tells them apart is radius, size and colour,
never speed.

### The rings

**One ring per body, and each ring is that body's own path.** A drawn path is a
promise about where a body will be, so there is exactly one ring per promise: two
rings serving three bodies leaves one visibly off its track and the whole system
reads as decoration.

- Drawn **before** the bodies, so a label's plate covers the ring it crosses.
- Revealed **with** the body that rides it — a path drawn ahead of its satellite
  is a promise the scene has not kept yet.
- The dash pattern is irregular, so the line reads as particles strung along a
  path rather than as a dotted rule.
- The three run on **coprime durations**: on one timing they read as a single
  blinking figure rather than as three bodies sharing a world.

### Clearance

Every path clears the drawn disc at every point, in both axes, by at least twenty
pixels at each of the five chapters that anchor labels. That is a sizing
constraint, not an aesthetic one. Sized from the viewport, the vertical semi-axis
came out smaller than the planet's radius and a body spent half of every
revolution behind the disc — which is what "the satellites do not orbit" looks
like to someone watching. Sized from the planet, the innermost path is nearly
face-on and the outermost is flattened; the trio still reads as a system seen at
an angle.

### What each body is, and when it arrives

**They arrive in the order the story does, and they are drawn as what they are.**

- The cover's sky has a world in it and **nothing else**, because nothing orbits a
  bare rock.
- A **moon** arrives with the surface it belongs to, on the widest path, drawn
  grey with its maria — a plain ball is a bead, and the seas are what make a
  reader recognise *this* moon rather than a generic one.
- The **two the argument is about are built rather than found**, so they arrive
  last, where the page first needs something to pin a label to, and they are
  drawn as machinery: a lit hull between two striped arrays on a boom, with a
  dish looking back at the world. At four pixels across a shaded sphere reads as
  another planet, which is the one thing these two are not.

What each carries follows from what it is: the moon is the oldest thing in the
sky, so it names the oldest thing the organisation has — its people — and the two
that were built name what is being built.

### The published reach

One value, computed from the table that draws the bodies. **What a label has to
clear is the drawn object, not the radius it was sized from:** a craft's arrays
reach well past its hull, and the published span says so.

## 4. Integration

**`SCENE-001`** provides `--planet`, the shared clock and the scroll multiplier.
**`SCENE-004`** pins a chip to a body and clears the published reach; it is the
only consumer of that number, and a second copy of it would stay true exactly
until one of the two is tuned.

## 5. Cross-cutting compliance

- **`SCENE-R02`** — the box is sized from `--planet`; the reach is computed from
  the drawing table.
- **`SCENE-R03`** — the bodies keep their own clock and it stops with the scene's.
- **`SCENE-R04`** — reduced motion keeps them circling at a sixth pace rather
  than freezing them.

## 6. Open questions and trade-offs

- **A fourth body.** There is room on a wide frame and none on a narrow one, and
  the argument has three things to say. Not a decision, a restraint.
- **Naming all three.** Only two are named, and the third exists to make the trio
  read as a system rather than as a pair. Naming it would put a third chip in a
  band that already holds two.

## 7. Task list

- `SCENE-002/T1` — Three bodies on one shared period, arriving in the order the story does
- `SCENE-002/T2` — One drawn ring per body, revealed with the body that rides it
