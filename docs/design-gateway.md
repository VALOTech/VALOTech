# VALO Tech — "Gateway" design system

The corporate homepage at [valotech.org](https://valotech.org) is a deep-space
page: a planet that begins as dead lunar rock and becomes a living Earth as the
reader scrolls, with the argument told in glass panels held in its orbit. The
visual language is the one our product designer authored as `v5.gateway`; this
document records it so the site can be maintained and extended without guessing
at the intent.

The page is still a static site. There is no build step and no package manager
at runtime: the repository is the artifact GitHub Pages serves, verbatim. One
graphics library is vendored under `assets/scene/` and one dev-time generator
writes the English copy into the markup.

## 1. Ground and palette

The page is dark and has one theme. The planet, the star field and the glass
panels are all lit against a near-black ground; there is no light variant,
because a white page would leave every one of them without a reason to exist.

| Token | Value | Where it is used |
|---|---|---|
| `--void` | `#080a10` | The page ground behind the scene |
| `--indigo-0` | `#07071a` | Deepest panel wells, footer ground |
| `--indigo-1` | `#0b0a23` | Section grounds that lift off the void |
| `--indigo-2` | `#14123a` | Raised chrome — header, dialogs |
| `--accent` | `#8c9eff` | Links, focus, active nav, mono eyebrows |
| `--accent-bright` | `#b9c2ff` | Hover, primary CTA fill |
| `--text` | `rgba(248,248,255,.98)` | Headings and body |
| `--text-muted` | `rgba(228,232,248,.86)` | Supporting paragraphs |
| `--text-dim` | `rgba(210,215,240,.68)` | Meta, captions, disabled |
| `--glass-bg` | `rgba(24,32,62,.58)` | Panel fill |
| `--glass-border` | `rgba(170,195,255,.42)` | Panel edge |
| `--glass-border-strong` | `rgba(200,220,255,.62)` | Panel edge, emphasised |
| `--glass-glow` | `rgba(120,160,255,.22)` | Panel outer glow |

Panel fill is deliberately opaque enough that the planet's bright limb never
reads through the right-hand side of a paragraph. Glass is a material, not a
transparency effect: where `backdrop-filter` is unavailable the fill alone still
separates text from sky.

### The six product marks

The ecosystem section carries six sibling brands whose own palettes — violet,
green, azure, rose, amber, platinum — would fight an indigo ground if they were
used as fills. Each product therefore sits in a recessed tray: the ground goes
darker, not lighter, and the product's colour appears only in its mark and a
single hairline edge. The brand stays recognisable and the page stays one page.

## 2. Type

| Role | Face | Treatment |
|---|---|---|
| Hero display | Roboto Condensed | `clamp(52px, 4.35vw, 84px)`, weight 400, leading `1.15` |
| Feature heading | Roboto Condensed | `clamp(34px, 4.2vw, 58px)`, tracking `-0.02em`, leading `1.03` |
| Chapter heading | Roboto Condensed | `clamp(30px, 3.6vw, 44px)` |
| Body | Roboto Condensed | 16px / 1.6; intro paragraphs 17px |
| Marker, eyebrow, annotation | DM Mono | 11–13px, `0.22em` tracking on eyebrows, uppercase |

One face carries the whole page. That is what makes it read as one surface
rather than as a headline sitting on top of a document, and it is why the
narrow-screen scale is a separate set of clamps rather than the same ones: at
390px the display clamp alone pushes the call to action off the first screen.

Roboto Condensed and DM Mono are self-hosted as `woff2` and cover Latin,
Latin-ext, Cyrillic and Vietnamese. Thai, Arabic, the Indic scripts, Korean and
the CJK locales fall back to a per-script stack declared in `assets/site.css`;
a condensed display face that does not cover a script is worse than a system
face that does.

Mono is a voice, not a decoration. It carries what the machine knows — a phase
label, a marker on the planet, an aside such as `// the cost — every AI
initiative stalls at the data layer`. Prose is never set in it.

## 3. The scene

`assets/scene/planet.js` builds one WebGL scene, 48vw square and capped at
760px, centred and moved by CSS transform rather than by re-rendering.

- Lunar sphere, radius `1.32`, 160 × 120 segments, with seven crater
  displacements applied to the vertex positions.
- Earth sphere, radius `1.322`, 128 × 96, sharing the scene, camera and parent
  transform so the two surfaces stay registered through the transition.
- Cloud shell at `radius × (1 + 15 / 6371)` and atmosphere shell at
  `radius × (1 + 100 / 6371)` — the 15 km cloud base and the 100 km Kármán
  line at true scale against a 6371 km mean radius.
- 3,600 instanced moss blades, surface-aligned, revealed with the Earth.
- Camera: 36° field of view at `z = 5.25`. ACES filmic tone mapping, exposure
  `1.34`, device pixel ratio capped at `1.75`.

Earth's 0.335% polar flattening is below a visible silhouette change at this
size, so the mesh stays spherical and the geometry budget goes to map detail.

### What scroll drives

A single scrub, `growth = smoothstep((scroll − 0.06) / 0.84)`, drives every
layer; there is no second timeline.

| Layer | Revealed over |
|---|---|
| Lunar → Earth surface | `0.08 – 0.68` |
| Atmosphere | `0.46 – 0.92` |
| Clouds | `0.54 – 0.88` |

The planet also moves, between stations written in viewport units and honoured
as written — full size at the top, small and to the right through the argument,
back to centre at *How your people fit in*, where the reader is being shown two
columns that belong on either side of it, and away again for the close.

Self-rotation is 7.5° per second — a forty-eight second revolution. The
reference turns at 1.5°, which measures as motion and reads as a photograph;
3.2 and then 5 were both still slow enough to be reported as a world that does
not turn. It turns about its own axis and the axis leans by Earth's 23.44°,
which is two groups rather than one: the outer holds the obliquity and never
spins, the inner spins and never leans. Collapsing them wobbles the pole around
the sky once a revolution.

The face follows its target on a **time constant, not a per-frame fraction**.
A per-frame follow closes the same share of the remaining travel thirty-five
times a second on a machine drawing sixty and four times a second on one
drawing six — so the surface turned at a fraction of its stated rate on slower
hardware, and a reader on such a machine saw a world that did not move. The
same correction applies to the placement easing and the scroll boost.

The satellites' orbit is **sized from the planet rather than from the
viewport**: the two named bodies keep a vertical semi-axis wider than the drawn
disc, so they are never behind it. Sized from the viewport, their semi-axis
came out smaller than the planet's radius and both spent half of every
revolution occluded — which is what "the satellites do not orbit" looks like to
someone watching the cover. The third is deliberately close in and does cross;
one body passing behind is what makes the ring read as an orbit.

The spin runs on its own clock, so the world turns whether or not anyone
scrolls, and it turns faster while someone does — scroll speed, measured as
page-fractions per second, becomes a bounded multiplier that the satellites
share. Both easings on this path are time constants rather than per-frame
fractions. A frame-counted easing follows at one speed on a machine drawing
sixty frames and another on a machine drawing six, so the same page reads as a
different animation on slower hardware; measured at four frames a second, the
scroll boost could not build at all.

### The sun

There is a star, and it is the same star the surfaces are lit by. It is drawn
in CSS — the scene's canvas is 48vw wide and a light source has to be able to
sit outside it, and a body this far away is a soft disc, which is what a radial
gradient is. A few pixels of core; everything else is corona.

**The planet is the origin.** The camera rides with it, so the planet goes where
the layout asks and the orbit is carried by everything else: the star is placed
from the planet on a bearing that sweeps once down the page — 280° to 340°,
screen axes, 270° being straight overhead — at a fixed stand-off, and the star
field slides against that same bearing, each depth tier by its own share, which
is the parallax a year of orbiting produces.

Two other framings were built and measured first. A sun on an independent
course ends up behind the header at one end of the page and grazing the limb at
the other. Curving the planet's own path around a fixed star reads as the
reader standing outside the system, and it costs the layout every station it
asked for, because a station on an arc is not the station that was written.

The arc is chosen against the page rather than against the sky: the bearing is
checked at every station for a collision with anything being read. A phone gets
its own shorter arc, and then does not draw the disc at all — the copy runs the
full width there, so wherever the star went it went behind something — keeping
only its light, which is what the reader is actually looking at.

The direction is then **derived from where the sun landed**, never set beside
it, so the two cannot disagree. One `uSun` vector reaches the lunar terminator,
the Earth's day and night, the cloud shading and the lit limb of the
atmosphere. Move the disc and the whole sky agrees; that agreement is the
effect, and a light that only moves the lamp is one nobody believes.

### Meteors

One crosses roughly every twenty seconds, at a random time, from a random edge,
on a shallow angle — rare enough to stay an event rather than a shower. They
are drawn on their own 2D canvas, behind the planet, so a streak vanishes
behind it and the sky gains a depth the star field alone cannot give. They
belong to the dead sky and stop once the surface is a living world, restarting
if the reader scrolls back up into the lunar half of the story.

Their loop exists only while one is in flight. Between meteors nothing is
scheduled, which is what lets the star field keep its own promise of no idle
animation. Reduced motion suppresses them entirely, and a hidden tab stops
scheduling them.

### The satellites

Three bodies on flat elliptical paths about the planet, drawn as two SVG
layers of one box clipped to its top and bottom halves and stacked either side
of the planet. A satellite on the far half of its path is drawn under the
planet, on the near half over it, which is what makes a flat ellipse read as an
orbit seen from above rather than as a ring drawn on the glass.

They keep their own clock, so they circle whether or not anyone scrolls, and
faster while someone does — the same multiplier the planet's spin uses. Nothing
orbits a dead rock: the ring's opacity is published from the growth scrub, so
the cover carries a bare moon and the ring arrives with the atmosphere.

Two of the three are named — *your people* and *AI*, the page's argument in
orbit — and only on the near half. A label that survived the occlusion reads as
a clipped word rather than as something passing behind. Each name sits on a
chip rather than bare on the sky, because a label crossing a lit surface needs
a ground of its own. The names appear only while the mapping chapter is on
screen, decided from that chapter's position on every frame rather than from an
observer, which a jumped scroll can bypass entirely.

### The reading side

One rule, applied to every chapter: **the argument holds one side and the
planet takes what is left.** Measured against the designer's own build, that
is what she does everywhere — copy and cards to about fifty-five percent, the
world clear beside them, never printed under a block of text. Six chapters
declare `chapter--aside` and are held to `min(58% of the max width, 58vw)` on
the reading-start side; three-across grids become two inside it, and
ValoStack's second text column folds into the first, since that column was the
paragraph sitting on the planet.

The planet's journey follows from the rule rather than being tuned against it:
one station per chapter, always in the space the argument does not take. The
two orbiting chapters mirror each other — argument right and planet left, then
the reverse — and from there every chapter holds its content left, so the
planet keeps the right and only changes height and size.

Where a chapter puts content on **both** sides, the planet takes the channel
between them. That is the same rule with a different empty space, and it is
what the mapping chapter is.

### Annotation chips

Short labels pinned around the world, connected by a small lit square, rather
than a column of prose beside it — the designer's own device, and the reason
her planet is never covered. Fifteen of them across five chapters, placed from
the planet's published position so they follow it, and shown only while their
chapter holds the frame.

Their text is drawn from strings the dictionary already carried and no chapter
rendered: the three architecture layers, the phase outcomes, the ownership
promises. Nothing new had to be written or translated, and content the business
team had already written stopped being orphaned.

### The investor gate

Two views of the trust chapter, as the design has them. The **general view** is
the seven answers and what each one is. The **detail view** — the three
mechanisms under each — opens behind a sign-in reached from the nav.

**It is a demonstration, not a security control.** This is a static site with
no server: the detail ships inside the page and anyone reading the source can
find it. Nothing may be put behind it that would matter if read. It exists so
the two views are separate, as the design intends, and so a real gate has
somewhere to go when there is a server to hold it.

### The orbiting chapters

*The problem corporate leaders face today* and *The answer* are the designer's
own composition, and the one her note was about: the cards travel **around**
the world rather than sitting in a list beside it. Above 950px each chapter is
a 340vh stage with its argument pinned to the reading-start side, and each
card rides an ellipse about the planet — `90° + i·(360/n)° − progress·240°`,
two thirds of a revolution across the chapter, so every card passes behind the
world once.

A chapter opts in by declaring `data-orbit`, and its cards by
`data-orbit-card`. The mechanism knows nothing about either chapter; adding a
third is two attributes.

Depth drives everything else: `depth = (sin θ + 1) / 2` gives scale
`0.74 + 0.26·depth`, opacity `0.48 + 0.52·depth` and blur `(1 − depth)·1.2px`.

**A far card cannot be put behind the planet with z-index.** The planet lives
in a fixed layer at the bottom of the page's stacking order and every chapter
sits above it, so stacking can only ever put a card in front. A rear card is
masked instead: a radial-gradient cut-out the size of the drawn disc, at the
disc's position expressed in the card's own coordinates — offset and radius
both divided by the card's scale, because the mask is applied before it.

The ellipse is **bounded by the frame, not by a constant**: its horizontal
radius is the smaller of the design value, the room between the planet and
the pinned column, and the room between the planet and the window edge. A
card can therefore never land on the argument or leave the page, at any
viewport, without a breakpoint being tuned for it.

Below 950px, and under reduced motion at any width, the chapter is the plain
stacked list it is underneath — same cards, same order, staggered indents,
marker squares back.

**The whole composition mirrors with the reading direction.** Under Arabic and
Urdu the argument is pinned to the right, so the journey's stations and the
star's bearing are reflected about the vertical axis and the orbit measures
its room against whichever side of the column the planet is on. The scene
still paints in physical coordinates — it has no reading order of its own —
but where it *stands* follows the page.

### The mapping stage

*How your people fit in* is a three-column composition: your people on one
side, the AI workforce on the other, one world between them. Above 1120px the
chapter becomes a scroll stage — 440vh tall, its panel sticky — and the two
columns hold a centre channel of `min(33vw, 440px)` that belongs to the planet.
The chapter's scrim opens in the middle to match, so the argument sits on solid
ground either side and the channel stays open sky.

The pairs arrive one at a time. Stage is `floor(progress × 5)` over the
chapter's own travel; a pair at or below the stage is revealed, the pair at the
stage is lit. Each side enters from its own edge, un-blurring as it lands, so
the reader takes in one correspondence before the next appears instead of
meeting five at once. Below the breakpoint there is no channel and no stage:
the arrow does the joining, and every pair is simply present.

### When it does not run

The scene is loaded asynchronously and only where WebGL is available; a
browser without it, or without module support, never requests the graphics
library at all. What it keeps is a sky rather than a gap: stars, meteors, the
sun, and a still frame of the planet in the scene's place. The still carries an
alpha channel for that reason — baked opaque it is a rectangle that hides the
sun behind it, which is exactly what happened before it was measured.

The placement runs whether or not the scene does, because the sun and the still
belong to the page's choreography too. Where nothing is rendering it runs on
scroll and resize rather than every frame.

Reduced motion does not remove the planet, and does not freeze it either. The
world keeps turning at 0.9°/s — a six-minute revolution — and the satellites
keep circling at a sixth of their pace, both slow enough that nothing appears
to move without being watched for, which is the threshold the setting is
about. What stops is everything with velocity in it: the scroll boost, the
intro approach, the pointer drift, the orbiting chapters' travel and the
mapping stage's stepping, each of which shows its content at once instead.
Nothing in the argument depends on any of it.

### Markers

Markers are laid out, not positioned. Each one holds a grid track beside the
text column, staggered by a margin inside that track; below 900px the whole
section collapses to one column and they become a plain list under the heading.

That is deliberate, and it is where this departs from the reference. There the
markers are absolutely positioned against a 1440-wide viewport, which puts two
of them on the headline at that width and covers it almost entirely on a phone.
Anchoring them to the planet instead of the viewport would move the collision
rather than remove it. A grid track cannot produce one at any width, and a
marker that covers the headline has stopped being a marker.

## 4. Chapters

| # | Chapter | What it does |
|---|---|---|
| 1 | Hero | The claim, three trust markers, one call to action |
| 2 | The Problem | Three panels in orbit — hiring, disconnected tools, scattered data |
| 3 | The Answer | Three services and the phases each covers |
| 4 | How we deliver | Five phases, each with its outcome |
| 5 | The workforce | Nine departments, what each one does |
| 6 | ValoStack | The cross-engagement brain, and the consent it runs on |
| 7 | Why leaders trust ValoLab | Seven structural answers |
| 8 | How your people fit in | What your team directs against what the workforce delivers |
| 9 | One company, a family of products | The six products, in recessed trays |
| 10 | Pricing and engagement | How an engagement is priced, and the first step |
| — | Footer | Contact, company, legal |

## 5. Language

Twenty locales, English as the source of truth. The served markup carries the
English text, generated from the dictionary by `scripts/sync-static-copy.mjs`,
so a reader without JavaScript gets the whole page rather than empty headings;
`site.js` swaps every `data-i18n` node on load. The pre-push hook fails if the
markup and the dictionary drift apart or if the twenty dictionaries fall out of
parity.

## 6. Accessibility

- Every interactive element is reachable by keyboard with a visible focus ring
  that meets contrast against the panel it sits on, not against the void.
- Text contrast is measured against the painted pixel — panel fill over planet,
  not token over token.
- `prefers-reduced-motion` slows the planet's rotation to 0.9°/s and the
  satellites to a sixth of their pace, and disables the scroll boost, the
  intro approach, the pointer parallax, the orbiting chapters, the mapping
  stage's stepping and every scroll-driven reveal. Every chapter shows its
  full content as a stacked list.
- A block the scroll flew past is revealed anyway. An observer is notified only
  when a ratio crosses a threshold, so a flick of the wheel that carries a
  block from below the fold to above it in one frame crosses nothing, and the
  block would stay invisible for the rest of the session. The same blindness
  left the nav's current-chapter mark pointing at wherever the reader used to
  be; both now read position directly.
- The scene is `aria-hidden`; it carries no information the text does not.
- A print stylesheet puts the page on paper in black on white.
