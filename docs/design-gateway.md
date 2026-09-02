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

Self-rotation is 1.5° per second: a four-minute revolution, slow enough to read
as presence rather than motion.

### When it does not run

The scene is loaded asynchronously and only where WebGL is available; a
browser without it, or without module support, never requests the graphics
library at all and keeps the star field, which is a sky on its own.

Reduced motion does not remove the planet. Scrolling is direct manipulation, so
the surface still changes as the reader moves; what stops is everything that
moves on its own — the idle rotation, the intro approach, the pointer drift.
Nothing in the argument depends on any of it.

### Markers

The scene publishes its own centre as `--stone-x` and `--stone-y` on the root
element every frame. Markers are positioned from those variables and the
planet's radius, never from viewport percentages, so they hold their relationship
to the planet at any window size. Above 900px they sit in lanes with a reserved
exclusion zone around the text column; below 900px they stop being overlays and
become a mono list under the heading, because a marker that covers the headline
has stopped being a marker.

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
