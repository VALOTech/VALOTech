---
code: SCENE-001
title: The world and its journey
domain: scene
prd_refs: [SCENE-001, SCENE-R02, SCENE-R03, SCENE-R04, SCENE-R05, P-04]
depends_on: [SITE-001, SITE-003]
depended_by: [SCENE-002, SCENE-003, SCENE-004, SCENE-005, SCENE-006]
layers_touched: [scene, ui]
cross_cutting_rules: [SCENE-R02, SCENE-R03, SCENE-R04, SCENE-R05, A11Y-R04, P-04]
status: implemented
---

# `SCENE-001` — The world and its journey

## 1. Purpose and PRD refs

A lunar sphere that becomes Earth across one read of the page, moving between
stations the layout asks for, lit by a star that crosses the sky once. It is the
argument's setting, not its decoration: the reader is put on a surface, shown
that surface become a living world, and told what a governed AI workforce is
while it happens. Realizes `SCENE-001` and carries `SCENE-R02` through
`SCENE-R05`.

Everything else in `scene/` is placed against this feature. `SCENE-002` orbits
it, `SCENE-003` is the sky behind it, `SCENE-004` names bodies on its orbits,
and `SCENE-005` and `SCENE-006` are chapters that stage themselves around it.

## 2. Layer walkthrough

**Down.** `assets/scene/planet.js` builds one WebGL scene and hands nothing to
the page but a canvas. `assets/scene/boot.js` reads the scroll position, maps it
onto the journey, and moves the canvas by CSS transform rather than by
re-rendering. The page reads the result through one plain object.

**Up.** Every consumer — the labels, the orbiting chapters, the meteors, the two
orbit layers — reads `window.VALO_STAGE`, never a resolved style. §5 says why
that direction is load-bearing.

## 3. Contracts

### The scene

One WebGL scene, 48vw square capped at 760px, centred and moved by transform.

- Lunar sphere, radius `1.32`, 160 × 120 segments, seven crater displacements
  applied to the vertex positions.
- Earth sphere, radius `1.322`, 128 × 96, sharing the scene, camera and parent
  transform so the two surfaces stay registered through the transition.
- Cloud shell at `radius × (1 + 15 / 6371)`, atmosphere shell at
  `radius × (1 + 100 / 6371)` — the 15 km cloud base and the 100 km Kármán line
  at true scale against a 6371 km mean radius.
- 3,600 instanced moss blades, surface-aligned, revealed with the Earth.
- Camera 36° at `z = 5.25`. ACES filmic tone mapping, exposure `1.34`, device
  pixel ratio capped at `1.75`.

Earth's 0.335% polar flattening is below a visible silhouette change at this
size, so the mesh stays spherical and the geometry budget goes to map detail.

**Everything the scene places vertically is measured from the middle of what a
reader can see** — half a header below the middle of the window. Measuring from
the window instead left the world about thirty pixels high at every size.

### How large the world is

    --planet: max(min(30vw, 440px), min(26vw, 46vh, 900px))

Everything sized from the world — the orbits, and through them the reach the
labels clear against — is a multiple of it.

A flat pixel cap is what a scene must not have. Held at 440px the world was a
quarter of the frame at 1920 and an eighth at 3840: every pixel the frame gained
past 1470 made it smaller in the reader's eye. The wide term takes over and
holds it near a quarter of the frame at any width. The height term exists
because width alone is the wrong measure of room — a 2560 × 900 letterbox has
the width for a 660px disc and nowhere to put it. **The outer `max()` is a
proof, not a sample:** the value can never fall below what the narrow frames were
tuned against, so widening a ceiling cannot regress a verified size.

### What scroll drives

One scrub, `growth = smoothstep((scroll − 0.06) / 0.84)`. There is no second
timeline.

| Layer | Revealed over |
|---|---|
| Lunar → Earth surface | `0.08 – 0.68` |
| Frontier heat | with the surface, peaking mid-crossing |
| Atmosphere | `0.46 – 0.92` |
| Clouds | `0.54 – 0.88` |
| Continental drift | `0.52 – 0.96` |

**The crust does not arrive where it is now.** While the world is young its
longitudes are drawn toward one meridian, so the visible face carries nearly all
the land at once and the far side is open ocean — one mass, which is what it
was. As the drift relaxes the land parts into today's continents, opening the
seas as it goes; crust still travelling is tinted warmer and barer than the
ground it will become. It runs behind the surface rather than with it, so the
world finishes becoming a world before it starts becoming *this* world.

**The frontier is lit.** The two surfaces meet along a dithered edge and a band
of heat runs with it — strongest exactly on the line, gone a little either side,
drawn on both surfaces so they share one edge rather than meeting at a seam. It
fades in over the first sixth of the crossing and out over the last, so the
world neither arrives already glowing nor leaves still lit. Without it the change
was silent: one surface replaced the other, pixel by pixel, with nothing to
watch.

### The journey

Stations in viewport units: full size at the top, then the side each chapter
leaves open — two left, centre through the mapping chapter, two right, two left,
and out to the right for the close.

**Measured in chapters, not page fractions.** A station is written as a fraction,
but the page is not one length: reduced motion collapses three chapters to their
stacked height — three and a half thousand pixels shorter — and a locale with
longer sentences stretches it the other way. Each chapter's measured top is
mapped onto the fraction the journey was tuned against, piecewise-linearly
between them, re-measured whenever the document's height changes.

Without that mapping the failure is not drift, it is the wrong story: a reader
with animation off met the bare rock parked on the left through a chapter that
had asked for a finished world on the right, because the scrub and the reveal
were reading a position two chapters behind the one on screen.

**The journey is read a little ahead of the reader.** The planet follows a moving
target, so while the reader scrolls it trails by roughly the target's speed times
the easing's time constant — which is why a chapter can be reached before the
planet is in the space it left, and why moving a station earlier cannot fix it:
moving a station moves the target and the trail with it. The lead is the same
product, so the two subtract. It falls to nothing when scrolling stops, so a
settled planet sits exactly on its station. The rate is smoothed, because a wheel
delivers scroll in steps, and capped, because a flick would otherwise read the
journey most of a page ahead. **Only the journey is led:** the growth scrub and
the star's bearing stay honest to where the reader is.

**A crossing is timed to the hand-over and stays in sight.** Two arguments face
each other across it, and the incoming heading arrives at the bottom of the frame
rather than in the world's own band — so between the first argument scrolling off
and the second rising level with the world there is about half a second of
reading, and the crossing is timed to it. Taking the world below the frame
instead solves the collision and loses the world, which is worse: a reader who
looks up and cannot find it has been shown a page that broke, not a planet that
moved (`SCENE-R05`).

**The one full crossing passes low and arrives late.** The chapter it leaves pins
its argument on the destination side, so on a level path the disc slides behind
the outgoing heading and reads as sinking into the text. Dropping through the
lower part of the frame takes it under that heading, and holding the arrival
until the heading has left clears the last of it.

Legs want a real span of page, because a lead cannot cancel a trail larger than
the leg itself. A leg written level with its chapter's top is a leg the world is
still travelling while the reader is already there.

**A jump is not a scroll, and is placed rather than eased.** A scrollbar drag, or
a restored position on reload, moves the page further in one frame than any
reader does; easing across it leaves the world crossing the frame for two and a
half seconds after the reader has arrived. Past a step of 0.02 of the page in one
frame the scene is placed exactly as on the first frame — about forty thousand
pixels a second, an order above the fastest fling. **The step is measured before
the frame's position is recorded:** comparing the new position against a variable
already assigned the new position is a guard whose difference is always zero, and
such a guard reads as present in the source while never once having run.

### Rotation

7.5° per second, a forty-eight second revolution. The reference turns at 1.5°,
which measures as motion and reads as a photograph; 3.2 and then 5 were both
still reported as a world that does not turn. It spins about its own axis and the
axis leans by Earth's 23.44° — **two groups, not one**: the outer holds the
obliquity and never spins, the inner spins and never leans. Collapsing them
wobbles the pole around the sky once a revolution.

The spin runs on its own clock, so the world turns whether or not anyone scrolls,
and faster while someone does — scroll speed as page-fractions per second becomes
a bounded multiplier the satellites share.

**Every easing on this path is a time constant, not a per-frame fraction.** A
per-frame follow closes the same share of the remaining travel thirty-five times
a second on a machine drawing sixty and four times on one drawing six, so the
same page reads as a different animation on slower hardware. Measured at four
frames a second the scroll boost could not build at all.

### The star

It crosses the sky once over the page, shoulder to shoulder by way of directly
overhead — a hundred and eight degrees — and its distance breathes by a fifth as
it goes. A narrow arc at fixed radius reads as a lamp clipped to the planet
rather than as a star the planet is going round, which is the whole point of
putting the reader on the surface. Both ends stay well above the horizontal,
because a sun level with the world grazes its limb and the surface goes to
silhouette. The drawn position is clamped inside the frame: a star pushed past an
edge is a light source the reader cannot find.

It is drawn in **CSS**, not in the scene — the canvas is 48vw and a light source
has to be able to sit outside it, and a body this far away is a soft disc, which
is what a radial gradient is.

**The planet is the origin.** The camera rides with it, so the planet goes where
the layout asks and the orbit is carried by everything else: the star is placed
*from* the planet on a bearing sweeping 280° to 340° in screen axes, at a fixed
stand-off, and the star field slides against that same bearing, each depth tier
by its own share — the parallax a year of orbiting produces.

Two other framings were built and measured first. A sun on an independent course
ends up behind the header at one end of the page and grazing the limb at the
other. Curving the planet's own path around a fixed star reads as the reader
standing outside the system, and costs the layout every station it asked for,
because a station on an arc is not the station that was written.

**The light direction is derived from where the sun landed**, never set beside
it, so the two cannot disagree. One `uSun` vector reaches the lunar terminator,
the Earth's day and night, the cloud shading and the atmosphere's lit limb. Move
the disc and the whole sky agrees; that agreement is the effect, and a light that
only moves the lamp is one nobody believes.

## 4. Integration

**`SITE-001`** provides the page the scene sits behind and the `--planet` token.
**`SITE-003`** provides the chapters the journey is measured in; changing the
chapter sequence changes the spine, and the spine is re-measured rather than
re-tuned. **`SCENE-002`** sizes its orbits from `--planet` and publishes the
reach `SCENE-004` clears against. **`SCENE-003`** slides against the star's
bearing. **`SCENE-005`** and **`SCENE-006`** place their content against the
published position.

## 5. Cross-cutting compliance

- **`SCENE-R02`** — the world's size, the orbit's reach and the disc's radius are
  read from the element that draws them, never from a constant duplicating a
  stylesheet value. Three defects have come from a second copy going stale.
- **`SCENE-R03`** — the placement loop runs while something is moving and stops
  when nothing is. Where nothing is rendering it runs on scroll and resize.
- **`SCENE-R04`** — reduced motion keeps the world turning at 0.9°/s and the
  satellites at a sixth pace, both slow enough that nothing appears to move
  without being watched for, which is the threshold the setting is about. What
  stops is everything with velocity: the scroll boost, the intro approach, the
  pointer drift, the orbiting chapters' travel and the mapping stage's stepping.
- **`SCENE-R05`** — the world stays in sight.
- **`A11Y-R04`** — the scene is `aria-hidden` and carries no information the text
  does not.

### What the frame costs

The scene hands its per-frame state to the page as **one plain object**,
`window.VALO_STAGE`, and not as custom properties on the root element. That is
the single largest performance decision on the page and it was not obvious until
measured: a custom property set on `:root` is inherited by every element, so
writing eighteen per frame invalidates the whole tree's computed style, and every
consumer reading them back through `getComputedStyle` forced the recalculation to
complete.

Measured on an integrated GPU at 1600 × 900, idle: **sixteen frames a second with
those writes, a hundred and twenty without.** Nothing else came close. Halving the
pixel ratio, disabling antialiasing and cutting the sphere from thirty-eight
thousand triangles to six moved the figure by less than the noise, because the
cost was never on the GPU — removing the whole WebGL scene left it at sixteen.

Two consequences to keep. The only stylesheet consumers are the two orbit layers,
and they carry the properties **on themselves**, so the rules reading them go on
working and the invalidation stops at two elements. And every page-side reader
takes the object rather than resolving style, which removes about twenty
`getComputedStyle` calls a frame along with the writes that made them expensive.

### When it does not run

The scene loads asynchronously and only where WebGL and module support are both
present; a browser without them never requests the graphics library. What it
keeps is a sky rather than a gap: stars, meteors, the sun, and a still frame of
the planet in the scene's place. **The still carries an alpha channel** — baked
opaque it is a rectangle that hides the sun behind it, which is exactly what
happened before it was measured.

The placement runs whether or not the scene does, because the sun and the still
belong to the page's choreography too.

## 6. Open questions and trade-offs

- **The pixel-ratio cap at 1.75.** Measured: raising it costs frames on
  integrated graphics and buys nothing a reader reports. Lowering it to 1.0 was
  measured too and gains about ten per cent at a visible cost in the limb.
- **A second scrub for the drift.** It would let the drift be tuned without
  touching the surface reveal. Rejected: two timelines are two things to keep in
  agreement, and the one behaviour that needed the freedom — running the drift
  behind the surface — is expressible as a range on the one scrub.

## 7. Task list

- `SCENE-001/T1` — A lunar sphere becomes Earth across one scroll scrub, with a lit frontier
- `SCENE-001/T2` — The journey is measured in chapters, not page fractions
- `SCENE-001/T3` — The journey is read ahead of the reader so each chapter's disc is standing when its heading arrives
- `SCENE-001/T4` — A jump is placed rather than eased
- `SCENE-001/T5` — The world's size follows the frame, and its ceiling can never shrink a tuned size
- `SCENE-001/T6` — The close takes the open side of the footer
