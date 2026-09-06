---
code: SITE-001
title: The gateway page
domain: site
prd_refs: [SITE-001, P-01, P-04, P-06]
depends_on: []
depended_by: [SITE-002, SITE-003, SITE-004, SCENE-001, I18N-001, A11Y-001]
layers_touched: [frontend, ui]
cross_cutting_rules: [A11Y-R03, I18N-R01, P-01, P-04, P-06]
status: implemented
---

# `SITE-001` — The gateway page

## 1. Purpose and PRD refs

One page, served verbatim, that makes the company's argument to a
regulated-industry buyer. Everything else in `site/` and `scene/` is placed
inside the frame this design sets: the ground, the type, and the one layout rule
every chapter obeys. Realizes `SITE-001` and carries `P-01`, `P-04` and `P-06`.

No build step. The repository is the deployed artifact and GitHub Pages serves it
verbatim, which is why the English copy is generated **into** the markup rather
than swapped in by script — the page reads without JavaScript.

## 2. Layer walkthrough

**Down.** `index.html` is semantic markup; `assets/site.css` is the design
system; `assets/site.js` carries behaviour that is not the scene. One graphics
library is vendored and dynamically imported only where it can run.

**Up.** Nothing on this page reports anywhere. It has no analytics and sets no
cookie for a visitor who does not sign in — see `decisions-log.md#OPS-DEC-01`.

## 3. Contracts

### Ground and palette

The page is dark and has **one theme**. The planet, the star field and the glass
panels are all lit against a near-black ground; there is no light variant,
because a white page would leave every one of them without a reason to exist.

| Token | Value | Where |
|---|---|---|
| `--void` | `#080a10` | the ground behind the scene |
| `--indigo-0` | `#07071a` | deepest panel wells, footer ground |
| `--indigo-1` | `#0b0a23` | section grounds that lift off the void |
| `--indigo-2` | `#14123a` | raised chrome — header, dialogs |
| `--accent` | `#8c9eff` | links, focus, active nav, mono eyebrows |
| `--accent-bright` | `#b9c2ff` | hover, primary CTA fill |
| `--text` | `rgba(248,248,255,.98)` | headings and body |
| `--text-muted` | `rgba(228,232,248,.86)` | supporting paragraphs |
| `--text-dim` | `rgba(210,215,240,.8)` | meta, captions, disabled |
| `--glass-bg` | `rgba(24,32,62,.78)` | panel fill |
| `--glass-border` | `rgba(170,195,255,.42)` | panel edge |
| `--card-bg` | `rgba(9,11,16,.93)` | card and label ground |

Panel fill is deliberately opaque enough that the planet's bright limb never
reads through the right-hand side of a paragraph. **Glass is a material, not a
transparency effect:** where `backdrop-filter` is unavailable the fill alone
still separates text from sky.

The tokens are mirrored into `brand/tokens.css` and `brand/tokens.json`, which
are extracted from this stylesheet rather than defined beside it.

### The six product marks

The ecosystem section carries six sibling brands whose own palettes — violet,
green, azure, rose, amber, platinum — would fight an indigo ground if used as
fills. Each product sits in a **recessed tray**: the ground goes darker, not
lighter, and the product's colour appears only in its mark and a single hairline
edge. The brand stays recognisable and the page stays one page.

### Type

| Role | Face | Treatment |
|---|---|---|
| Hero display | Roboto Condensed | `clamp(52px, 4.35vw, 84px)`, weight 400, leading `1.15` |
| Feature heading | Roboto Condensed | `clamp(34px, 4.2vw, 58px)`, tracking `-0.02em`, leading `1.03` |
| Chapter heading | Roboto Condensed | `clamp(30px, 3.6vw, 44px)` |
| Body | Roboto Condensed | 16px / 1.6; intro paragraphs 17px |
| Marker, eyebrow, annotation | DM Mono | 11–13px, `0.22em` tracking on eyebrows, uppercase |

**One face carries the whole page.** That is what makes it read as one surface
rather than as a headline sitting on a document, and it is why the narrow-screen
scale is a separate set of clamps rather than the same ones: at 390px the display
clamp alone pushes the call to action off the first screen.

Both faces are self-hosted `woff2` covering Latin, Latin-ext, Cyrillic and
Vietnamese. Thai, Arabic, the Indic scripts, Korean and CJK fall back to a
per-script stack — **a condensed display face that does not cover a script is
worse than a system face that does**. `monospace` is not a font; it is a request
the operating system answers differently on every machine.

**Mono is a voice, not a decoration.** It carries what the machine knows — a
phase label, a marker on the planet, an aside such as `// the cost — every AI
initiative stalls at the data layer`. Prose is never set in it.

### A frame past two thousand pixels

Every fixed size in the type scale is a reading distance measured on a 1440-wide
screen. Held there, a 3840-wide frame shows the same page at two thirds the
apparent size with a third of its width in use — and enlarging only the world
would have answered a third of it.

`--up` is one factor: `1` below 2000px, rising to `1.32` at 3840. Above the
breakpoint it multiplies the fixed sizes, the reading column and the cover's own
column **together**. Two properties make it safe:

1. It is declared as `1` in the base, so a rule may multiply by it anywhere. A
   `var()` that resolves to nothing invalidates the whole declaration it sits in,
   and the display face silently fell to inherited body size the first time it
   did.
2. Its value at the breakpoint is exactly 1 while `--maxw`'s wide term reads
   `62vw`, which is exactly 1240px at 2000px, so nothing steps as the frame
   crosses it.

**The column grows with the type it holds rather than after it.** Left fixed
while the display face grew, the cover's four lines became five and the last ran
onto the disc: a type scale and a measure are one decision, not two.

**Everything the frame carries grows, or the half that does not reads as
debris.** The factor reaches the sun's corona, the cover's floating markers, the
channel the mapping stage splits on, the people chapter's heading column and the
annotation chips — each keeping its own viewport term so the frame still governs
and only the ceiling moves. A surface where the type grows a third while five
fixed ornaments stay put looks less finished than one where nothing grows at
all, because the eye reads the mismatch before it reads either size.

### The reading side

One rule, applied to every chapter: **the argument holds one side and the planet
takes what is left.** That is what the reference does everywhere — copy and cards
to about fifty-five per cent, the world clear beside them, never printed under a
block of text.

Six chapters declare `chapter--aside` and are held to `min(58% of --maxw, 47vw)`
on the reading-start side; three-across grids become two inside it, and
ValoStack's second text column folds into the first, since that column was the
paragraph sitting on the planet.

**The column is capped against the frame as well as against the measure.** Held
only at a share of the max content width it keeps 719px however narrow the window
gets, so as the frame shrinks the column takes more of it until the orbit no
longer clears the argument — which is the condition the labels are gated on.
Measured: that clearance is +22px at 1600, +11 at 1500, and negative from 1440
down, and two of the five label chapters showed no labels at all below 1440. The
second cap does nothing above 1530px and yields from there, which keeps every
label chapter working down to 1024.

Where a chapter puts content on **both** sides, the planet takes the channel
between them. That is the same rule with a different empty space, and it is what
`SCENE-006` is.

`chapter--aside-end` is the same column against the other edge, with the ground
swapping to match — which is how half the chapters hold their argument on the
right.

### The cover

The one section whose composition is measured against the **frame** rather than
the reading column: its own column is nearly the frame, `min(94vw, 1520px × --up)`,
and the copy is capped at `min(36vw, 560px × --up)`.

Holding the copy inside the centred 1240px column while the world and the markers
are placed in viewport units is what separates the two systems on a wide screen:
the copy is pulled inward, the art is not, and the result is a dead strip down
the left with everything else pressed into the right. Measured at 1915px that
strip was 366px against 235 on the other side; it is 226 against 235 now.

The cover's three markers are placed from the planet's own published position,
arced down the side the copy does not take. Anchoring them to the viewport
instead is what the reference does, and at 1440 it puts two of them on the
headline; anchoring them inward from the planet does the same from the other
direction. **Anchoring them outward from a world that stands clear of the copy is
the only arrangement with no collision to place.**

Below 900px the section collapses to one column and they become a plain list
under the heading, where a marker cannot cover anything.

### The header

Logo, chapter links, the language control, the sign-in and the call to action.
The whole set folds into a menu at 1080px — **as a set**. Leaving the sign-in in
a bar that had already dropped its call to action pushed the menu button outside
the frame on a phone, which cost the reader the only way into the navigation, and
the page reports no overflow when that happens because the row clips rather than
scrolls.

## 4. Integration

**`SITE-002`** hides two chapters and the mechanism detail inside this page.
**`SITE-003`** is the sequence of chapters this frame holds. **`SITE-004`** is its
close. **`SCENE-001`** reads `--planet` and the reading side to place the world.
**`I18N-001`** supplies every string. **`A11Y-001`** is measured against the
painted pixel this palette produces.

## 5. Cross-cutting compliance

- **`P-01`** — the public argument is complete without signing in.
- **`P-04`** — the scene never costs a reader the ability to read.
- **`P-06`** — verified in a browser at 390, 820, 1366, 1920, 2560 and 3840, in
  both scroll directions.
- **`A11Y-R03`** — contrast measured against the painted pixel: panel fill over
  planet over star field, never token against token.
- **`I18N-R01`** — no hard-coded visitor-facing string.

## 6. Open questions and trade-offs

- **A light theme.** Rejected, and the toggle that once offered one was removed
  rather than kept as a half-truth. Every lit element on this page exists because
  the ground is dark.
- **Analytics.** `decisions-log.md#OPS-DEC-01` is open, and the safe default is
  that the page measures nothing.

## 7. Task list

- `SITE-001/T1` — One page, nine chapters, a fixed scene layer beneath them
- `SITE-001/T2` — Chapter sequence follows the reference
- `SITE-001/T3` — The close carries the contact call to action and states why prices are not published
- `SITE-001/T4` — Navigation follows the page and folds into a menu below 1080px
- `SITE-001/T5` — The reading column yields to the frame so labels survive below 1440px
- `SITE-001/T6` — A frame past 2000px shows a larger page rather than a further one
