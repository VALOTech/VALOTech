# VALO Tech — brand guidelines

The parent identity. What follows governs the company's own surfaces; a product
uses its own kit and inherits only the relationship described under *The family*.

## The mark

The folded **V** of VALO. Two strokes meeting at a vertex — the geometry every
product mark is a re-skin of, which is why the family reads as one company at a
glance and as six businesses on inspection.

- **On the void**, `assets/valo-symbol-white.png`. This is the primary lockup and
  the one the gateway uses.
- **On light**, `assets/valo-symbol-teal.png`.
- **Clear space** on every side is the height of the V's vertex. Nothing sits in
  it, including the wordmark's own descenders.
- **Minimum size** 24px tall on screen. Below that the vertex closes and the mark
  reads as a triangle.
- **Never** recolour the mark to a product accent, rotate it, add a stroke, place
  it on a photograph without a scrim, or reproduce it beside another company's
  mark at a larger size than theirs.

The wordmark is set in the display face with `VALO` in the text colour and the
second word in the accent — `VALO Tech`, `VALO Ads`, `VALO Pocket`. Products
whose names are not compounds of VALO (Shimmra, Amavo, Farola, Verdiq) do not
take that treatment.

## Gateway — the theme

**Gateway** is VALO Tech's theme: deep indigo, glass panels, and one world in
frame. It is the design language of the company's own surfaces — the public page
and, when it is built, the investor room — and it is the only theme. There is no
light variant; the three-way toggle that once offered one was removed rather than
kept as a half-truth, because everything in this system is lit from inside and a
light ground has nowhere to put the light.

Its lineage is the designer's `v5.3` gateway — *deep indigo and glass cards over
a field* — and the values below are hers unless a row says otherwise. Three do
say otherwise, and each is a measured change rather than a preference; they are
listed together at the end of this section so the difference between the theme
and its source is one paragraph rather than something a reader has to notice.

### Ground

Four values, in depth order. Nothing else is a background.

| Token | Value | Where |
|---|---|---|
| `--void` | `#080a10` | The page. Everything is painted on it |
| `--indigo-0` | `#07071a` | The far field |
| `--indigo-1` | `#0b0a23` | Mid depth |
| `--indigo-2` | `#14123a` | Near depth, and the warmest thing in the ground |

The indigos are **for depth, never for a surface a reader reads against.** Text
sits on a panel, and a panel takes `--card-bg` or `--glass-bg`, which are opaque
enough to hold text over a moving planet.

### Two panel families, one material

The system has exactly two, and mixing them is how a page stops looking designed.

| | Glass | Card |
|---|---|---|
| Fill | `--glass-bg` `rgba(24,32,62,.78)` | `--card-bg` `rgba(9,11,16,.93)` |
| Border | `--glass-border` `rgba(170,195,255,.42)` | `--card-border` `rgba(255,255,255,.12)` |
| Elevation | `--shadow` | `--card-shadow` |
| Radius | `--r-panel` `12px` | `--r-panel` `12px` |
| Moves | yes — orbits, follows, reveals | no |
| Carries | a label, a claim, a control | a paragraph somebody reads |

**Glass is for things in the scene; card is for things being read.** A glass
panel is cool, bordered in light and allowed to move; a card is near-black,
bordered faintly and still. A reading surface that moves is a reading surface
nobody finishes.

`--glass-bg-hover`, `--glass-border-strong` and `--glass-highlight` are the
interactive states of the first family. `--glass-glow` is the only ambient light
a panel emits, and it is emitted by nothing that is not interactive.

### Accent

`--accent` `#8c9eff` is the **single** accent. It marks the interactive and the
current, and nothing else — a second accent would make the first mean nothing.
`--accent-bright` `#b9c2ff` is its hover and its emphasis; `--accent-dim` and
`--accent-wash` are the same hue at rule and fill strength.

**The mark stays teal, and that is not a conflict.** The folded V is the company,
the accent is the interface. A mark recoloured to whatever accent a surface
happens to use stops being an identity and becomes decoration, which is why the
rule under *The mark* forbids it in both directions.

### Text

| Token | Value | For |
|---|---|---|
| `--text` | `rgba(248,248,255,.98)` | Headings and body |
| `--text-muted` | `rgba(228,232,248,.86)` | Secondary sentences, ledes |
| `--text-dim` | `rgba(210,215,240,.8)` | Meta, captions, disabled |
| `--text-shadow` | `0 1px 2px rgba(7,7,26,.55)` | Text over the scene, always |

### Type

Roboto Condensed for everything, DM Mono for eyebrows, markers and asides, IBM
Plex Mono where Vietnamese diacritics need it. Both self-hosted — `monospace` is
not a font, it is a request the operating system answers differently on every
machine, and a mono face here is chosen for its shape.

| Role | Size | Notes |
|---|---|---|
| `--type-display` | `clamp(52px, 4.35vw, 84px)` | The cover only |
| `--type-feature` | `clamp(34px, 4.2vw, 58px)` | A chapter's own claim; line 1.03, tracking −0.02em |
| `--type-chapter` | `clamp(30px, 3.6vw, 44px)` | Everything else that is a heading |
| `--type-intro` | `17px` | The lede under a heading |
| `--type-body` | `16px` | Body, line 1.6 |
| `--type-card-title` | `16px` | 600 weight, line 1.3 |
| `--type-card-body` | `15px` | Line 1.6 |
| `--type-meta` | `12px` | 500 weight, line 1.3 — eyebrows, markers |

**Equivalent content is the same size everywhere.** A card title is a card title
whether it is on a satellite, in a grid or in a footer; the layout varies and the
role does not. That is what these tokens are for, and a component that sets its
own size has left the system.

### Scale with the frame

The display, feature and chapter sizes are viewport-relative between fixed
bounds. Above 2000px one factor, `--up`, grows the fixed sizes, the reading
column and every ornament the frame carries — **together**. A fixed size is a
reading distance measured on a 1440-wide screen, and a 4K frame shows the same
page from further away; a surface where half the elements scale looks less
finished than one where none do.

`--planet` sizes the world from the frame and carries **no flat pixel ceiling**,
for the same reason: a ceiling does not fix that defect, it postpones it to the
first frame that exceeds the number.

### Space, radius, motion

| Token | Value | For |
|---|---|---|
| `--maxw` | `1240px`, `clamp(1240px, 62vw, 1720px)` above 2000 | The reading column |
| `--gut` | `28px` | The page gutter |
| `--hdr` | `68px` | The fixed header, and what every scroll target offsets by |
| `--r-panel` / `--r-ctrl` / `--r-pill` | `12px` / `10px` / `999px` | Panel, control, pill |
| `--ease` | `cubic-bezier(.16, 1, .3, 1)` | Every transition. One curve |

**No idle animation.** Motion in this theme is caused — by a scroll, a pointer or
a state change — and a surface that moves while nobody is doing anything is a
surface competing with the words. Under `prefers-reduced-motion` the scene slows
rather than freezes, because a frozen scene reads as a page that failed to load.

### Contrast

Measured against the **painted pixel** — the panel fill over the planet over the
star field — never token against token. A pair that passes on paper fails over a
bright limb, and the limb moves.

### Where this theme differs from its source, and why

| Value | Source | Here | Why |
|---|---|---|---|
| `--glass-bg` | `.58` | `.78` | The planet read through the right-hand side of a paragraph. Measured over the disc's lit limb, not over the void |
| `--card-bg` | `.88` | `.93` | Same measurement, same cause, on the family that carries the most text |
| `--text-dim` | `.68` | `.8` | AA against the panel it actually sits on |

All three move in one direction — **towards legibility over a moving
background** — and none of them changes a hue. The theme is the source's; the
opacities are what it took to hold text over a world that is not a flat colour.

## The family

| Product | Theme | Accent | Mark |
|---|---|---|---|
| VALO Ads | Aurora | `#6D5CFF` violet | folded V + a cent of light |
| VALO Pocket | Verdant | `#0A7E50` green | folded V opening to a pocket |
| Shimmra | Halo | `#3B86FF` azure | orbit-star in a halo |
| Amavo | Ember | `#FF5777` rose | ember play-heart |
| Farola | Beacon | `#F5A524` amber | a light above the far shore, reflected |
| Verdiq | Sterling | struck platinum | the compliance backbone, B2B |

A product's kit is authoritative for that product. This document is authoritative
for VALO Tech and for the relationship above; where a product's kit and this one
disagree about the product, the product's kit is right.

## Voice

Plain, specific, and never larger than the evidence. The gateway's own copy is
the reference: it says what the company does and what a buyer keeps, it declines
to publish prices rather than pretending there is a menu, and it makes no
absolute claim about safety or outcomes. A sentence that would embarrass the
company in front of a regulator does not ship, whether or not it is true.

Twenty languages, and English is the source. A translation is authored, not
generated, and it is allowed to say the thing differently — a sentence that is
correct and lifeless is not finished.
