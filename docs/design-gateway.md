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

The planet also moves. Through the chapters it recedes on a `4p(1 − p)` curve —
full size at the top, small and to the right through the argument, full again at
the close. It returns to centre at *How your people fit in*, where the reader is
being shown two columns that belong on either side of it, and settles into the
gap between the footer's two columns at the end.

Self-rotation is 3.2° per second — just under two minutes a revolution. The
reference turns at 1.5°, which measures as motion and reads as a photograph;
at 3.2 the planet is unmistakably alive on a first look and still far too slow
to pull the eye off the argument.

### The sun

There is a star, and it is the same star the surfaces are lit by. It is drawn
in CSS — the scene's canvas is 48vw wide and a light source has to be able to
sit outside it, and a body this far away is a soft disc, which is what a radial
gradient is. A few pixels of core; everything else is corona.

It keeps station with the planet rather than travelling its own path: given as
an offset in viewport units that widens and lifts as the story runs, so the
light angle turns across the page and the terminator visibly swings. The
starting pair reproduces the reference's key direction exactly while the planet
is centred. A sun on an independent course was tried first and measured — it
ends up behind the header at one end of the page and grazing the limb at the
other.

The direction is then **derived from where the sun landed**, never set beside
it, so the two cannot disagree. One `uSun` vector reaches the lunar terminator,
the Earth's day and night, the cloud shading and the lit limb of the
atmosphere. Move the disc and the whole sky agrees; that agreement is the
effect, and a light that only moves the lamp is one nobody believes.

### Meteors

One crosses roughly every twenty seconds, at a random time, from a random edge,
on a shallow angle — rare enough to stay an event rather than a shower. They
are drawn on their own 2D canvas, behind the planet, so a streak vanishes
behind it and the sky gains a depth the star field alone cannot give.

Their loop exists only while one is in flight. Between meteors nothing is
scheduled, which is what lets the star field keep its own promise of no idle
animation. Reduced motion suppresses them entirely, and a hidden tab stops
scheduling them.

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

Reduced motion does not remove the planet. Scrolling is direct manipulation, so
the surface still changes as the reader moves; what stops is everything that
moves on its own — the idle rotation, the intro approach, the pointer drift.
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
- `prefers-reduced-motion` disables the planet's idle rotation, the intro
  approach, the pointer parallax and every scroll-driven reveal. Scroll still
  moves the page; nothing else moves on its own.
- The scene is `aria-hidden`; it carries no information the text does not.
- A print stylesheet puts the page on paper in black on white.
