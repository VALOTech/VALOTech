# Gateway rebuild — iteration log

Working state for the homepage rebuild onto the `v5.gateway` design language
(`docs/design-gateway.md`). One entry per iteration, newest last. The file keeps
the **newest 20 entries**; `git log -p docs/gateway-iter-log.md` is the archive,
so a pruned entry is recoverable verbatim. An entry may only be pruned once every
durable fact in it already lives somewhere permanent — the design document, the
code, or a commit message.

Entry shape:

```
## NN — <one-line goal>
WHAT CHANGED: <concrete artifacts>
VERIFIED: <the command, or the browser reading, that proves it>
PARTIAL / BROKEN: <exact stopping point — or "— none —">
NEXT: <the smallest next action>
```

A ⭐ line records an error of my own — a wrong measurement, a retracted finding,
a false assumption. Those are the most useful lines in the file.

## 01 — Foundation: self-hosted type, tokens, page shell, hero
WHAT CHANGED: `assets/fonts.css` + 20 self-hosted woff2 (Roboto Condensed
400/500/600/700, DM Mono 400/500; latin, latin-ext, vietnamese, cyrillic).
`assets/site.css` rewritten as the Gateway system — tokens, base, type scale,
rails, header, controls, panels, markers, hero, footer, motion, narrow, print.
`index.html` rebuilt: head + sprite + header + language menu + mobile menu +
hero + footer skeleton, every string on a real dictionary key.
`docs/design-gateway.md` and this log added; `robots.txt` keeps `/docs/` out of
search.
VERIFIED: `node scripts/sync-static-copy.mjs --check` → 31/31 nodes, 20 locales.
Chrome 1440x900 and 390x844 — header, language menu and hero render clean at
both; on 390 the markers stack under the H1 rather than covering it, which is
the defect the reference mockup has.
PARTIAL / BROKEN: the scene is an empty canvas — no star field, no planet.
`assets/site.js` is still the old file; it drives i18n, the language menu and
the burger correctly but also looks for a theme switch that no longer exists.
NEXT: star field, so the void stops being flat black.

## 02 — The star field
WHAT CHANGED: `assets/scene/stars.js` — a 2D-canvas sky in three depth tiers
that scroll at different rates, plus a 1.4% minority carrying a soft halo.
Linked `defer` from `index.html`.
VERIFIED: a Playwright probe read the canvas signature at scrollY 0 and 500 —
it changes, so the parallax is real and not a still image. Chrome 1440x900
shows the field at the reference's density.
⭐ The same probe counted requestAnimationFrame ticks to check for an idle
loop. That measures the probe's own loop, not the page's, and proves nothing.
The absence of an idle loop is a fact about the code — `frame()` returns
without rescheduling — not something that run established.
PARTIAL / BROKEN: — none —
NEXT: vendor three.js and put the lunar sphere in the sky.

## 03 — The lunar body
WHAT CHANGED: vendored three.js 0.166.0 (MIT, licence beside it) under
`assets/scene/`; `assets/scene/planet.js` builds the cratered sphere —
`SphereGeometry(1.32, 160, 120)` with seven crater displacements, a
`MeshStandardMaterial` over the regolith map, and the designer's four-light
rig; `assets/scene/boot.js` loads it only where WebGL exists and feeds it the
page's motion state. The regolith map was re-encoded to WebP: 3212 KB -> 434 KB.
VERIFIED: clip screenshots of both planet elements at an identical 691px box,
then luminance over the same 400x400 window. Reference median 26, mine 29;
p90 49 against 63. Chrome 1440x900 and 390x844 both render the moon behind
legible text.
⭐ Three corrections, all mine:
  1. I ported `ROCK_FRAGMENT_SHADER` faithfully — and it is dead code in the
     reference. Nothing references it; the visible surface is the textured
     standard material. Reading a file is not the same as reading what runs.
  2. My first luminance comparison used windows centred on different parts of
     the two discs, so the numbers were not comparable. Re-measured.
  3. The p99 gap that survives (245 against 91) is the white headline inside
     the sample window, not the planet. A measurement window that includes the
     UI measures the UI.
The real cause of the 2.7x brightness gap was the `<map_fragment>` injection:
a contrast curve with a 0.28 pivot, applied in linear space where every sample
sits far below it, so it crushes rather than expands. Ported.
PARTIAL / BROKEN: no Earth, clouds, atmosphere or moss yet — `growth` is
computed and fed to the scene but nothing consumes it. There is no still-image
fallback for a machine without WebGL; it currently gets the star field alone.
NEXT: the Earth surface and its transition frontier.

## 04 — The living Earth
WHAT CHANGED: `assets/scene/planet.js` gains the Earth group — a 128x96 sphere
under the Blue Marble map with ocean and land separated out of the map itself,
a cloud shell at the 15 km base driving opacity on a lit surface, and a
back-face Rayleigh atmosphere at the 100 km line. One scrub reads through three
windows: surface 0.08-0.68, atmosphere 0.46-0.92, clouds 0.54-0.88. The lunar
surface discards wherever the Earth claims a pixel, so one directional frontier
owns each pixel exactly once. Earth and cloud maps re-encoded to WebP:
603 KB -> 303 KB and 810 KB -> 505 KB.
VERIFIED: Chrome 1440x900 at scroll 0.35, 0.6 and 1.0. At 0.35 the frontier is
visibly mid-sweep — living continents on one side, cratered rock on the other,
dithered across the seam. At 1.0 the Earth carries clouds, a day/night
terminator and a blue limb. No console errors on any of the three.
⭐ A second piece of dead code caught before porting it: the reference paints a
whole procedural Earth — ellipse continents, ice caps, deserts — onto the lunar
surface, then mixes it in at `earthReveal = 0.0`. Roughly a hundred lines that
never reach a pixel. The separate Earth sphere superseded it.
PARTIAL / BROKEN: `growth` still comes from a 1555px page, so the transition is
only observable by scrolling a nearly empty document. The planet does not yet
recede, re-centre or settle into the footer — it holds the middle throughout.
NEXT: the chapters, so the scrub has a story to run along.

## 05 — Chapter 2, The Problem
WHAT CHANGED: the orbit constellation — three dark panels with a blinking
outline glyph and a mono aside, beside a chapter head over a left-to-right
scrim. Seven new keys carry the asides, seeded across all twenty dictionaries.
`EXPECTED_NODES` 31 -> 46.
VERIFIED: `--check` 46/46. Chrome 1440x900 at scroll 0.45 — the headline, the
lede and all three panels are legible over the planet, and nothing overlaps
anything. The reference places these nodes absolutely against a 1440 viewport
and they land on its headline; here the stagger is a margin inside a grid
track, so no width can produce that collision.
PARTIAL / BROKEN: the nineteen non-English dictionaries carry the English
string for the seven new keys. That is the seed, not a translation, and the
per-locale pass replaces it.
NEXT: chapters 3 and 4 — The Answer, and How we deliver.

## 06 — Chapters 3 and 4, The Answer and How we deliver
WHAT CHANGED: three service panels, each carrying a five-square strip that
shows which phases it covers, so the shape of an engagement is legible before
a word of it is read; then the five-phase track, markers joined by a rule so
the panels read as one sequence. Three new keys. `EXPECTED_NODES` 46 -> 86.
VERIFIED: `--check` 86/86, no console errors. Chrome 1440x900 at scroll 0.33
and 0.55.
⭐ Caught in the browser, not in review: `.chapter-head { max-width: 52ch }`
resolves `ch` against the container's 16px font, not the heading's 58px, so
the display headline broke into six lines. The heading now takes a measure in
its own terms and the paragraph keeps a reading measure.
PARTIAL / BROKEN: — none —
NEXT: chapters 5 to 7 — the workforce, ValoStack, and the seven trust answers.

## 07 — Chapters 5 to 7, the workforce, ValoStack and the seven answers
WHAT CHANGED: nine department panels, each leading with the need rather than
our label for it; ValoStack as a statement chapter with no cards, because the
claim carries itself; seven capability panels with a mono headline and three
checked points each. Three new keys. `EXPECTED_NODES` 86 -> 161.
VERIFIED: `--check` 161/161, no console errors. Chrome 1440x900 at scroll 0.5,
0.62 and 0.78. With the page now 8012px the growth scrub paces properly — the
Earth is fully formed by the trust chapter, which is where the argument turns
from what breaks to what holds.
PARTIAL / BROKEN: — none —
NEXT: the ecosystem's six products, then pricing and the real footer.

## 08 — Chapters 8 to 10 and the real footer
WHAT CHANGED: the people/workforce mapping as five paired rows rather than two
lists, so the trade reads line by line; the ownership chapter; the six-product
ecosystem; and a footer carrying the pricing argument, the company block and
the ecosystem links. Two new keys. `EXPECTED_NODES` 161 -> 205.
VERIFIED: `--check` 205/205, no console errors, no request over 400. Chrome
1440x900 at scroll 0.72, 0.86, 0.95 and 1.0. The six product marks sit in
recessed trays with their own colour confined to the mark and one hairline —
the concern I raised when the indigo palette was chosen, resolved in layout
rather than by changing the palette.
PARTIAL / BROKEN: the planet still holds the centre of the frame everywhere.
It does not recede through the argument, return to centre at the people
chapter, or settle into the footer's column gap.
NEXT: the placement orchestration.

## 09 — Placement: the planet follows the argument
WHAT CHANGED: `assets/scene/boot.js` now places the planet against the
document — a 4p(1-p) recede curve through the chapters, a return to centre
while the people chapter is on screen, full presence on the right at the
close, and an approach on first paint that starts when the surface is ready.
Everything eases toward its target rather than being set, so a fast scroll
reads as the planet following. `--stone-x`, `--stone-y` and `--stone-r` are
published every frame for markers to anchor to.
VERIFIED: Chrome 1440x900 at scroll 0.3, 0.55, 0.62, 0.78 and 1.0 — the planet
is small and aside through the argument and large on the right in the footer,
with the pricing text clear of it.
⭐ I ported the reference's footer rule and then measured what it does: it
compares the column gap to the full container width, so `(gap - 48) / 691`
lands under the 0.5 floor at every realistic gap. The branch is dead in
practice. Replaced with the placement its own screenshots actually show.
PARTIAL / BROKEN: nothing consumes `--stone-r` yet; the hero markers are still
laid out by the grid rather than anchored to the planet.
NEXT: the quality pass — a11y, no-JS, a fallback for machines without WebGL,
and retiring the parts of `site.js` that look for a theme switch.

## 10 — Degradation: what happens when the page's supports are taken away
WHAT CHANGED: `assets/site.js` rewritten for the markup that now exists — i18n,
the language menu with its keyboard handling, header state, scroll reveal,
mobile menu, back-to-top and a scroll-spy that sets `aria-current`. The theme
switch, the tab widget, the ecosystem-hub animation, the print expander and
the cursor ribbon are gone: none of them had markup left to act on. A still
frame of the planet (29 KB) now stands in where the scene cannot run, and an
inline probe decides before first paint whether WebGL and module support are
both present, so only the machines that need the still ever fetch it.
VERIFIED: a Playwright probe drove four contexts and read the DOM in each.
Baseline: 2 canvases, no still fetched, 75 reveals still below the fold.
No WebGL: still frame served, 1 canvas, identical document height.
No JavaScript: still frame, **0 reveals hidden** — the whole page reads, in
English, from the markup. Reduced motion: scene runs, 0 reveals hidden.
No page errors in any of the four.
PARTIAL / BROKEN: — none —
NEXT: contrast and keyboard measured against the painted pixel, then the
per-locale translation pass.

## 11 — Accessibility, measured
WHAT CHANGED: focus now reveals its block immediately rather than after the
staggered delay; on narrow screens each mapping cell names its own side.
VERIFIED: contrast measured against the painted pixel — the glyphs are made
transparent, the page screenshotted, and the median luminance inside each text
box taken as its true background, panel fill over planet over star field.
65 text boxes across five scroll positions: all pass. Tab order: 26 stops,
every one on screen with a visible focus ring.
⭐ Two findings my own probe manufactured before it found the real one.
  1. Fifteen stops read OFFSCREEN because `scroll-behavior: smooth` was still
     carrying the element into view when the reading was taken. Turning smooth
     scrolling off for the walk cleared all fifteen.
  2. Then three read `opacity: 0`, which looked like the same artifact and was
     not: focus was landing on a reveal block that waits out a 0.27s delay
     before a 0.7s fade, so a keyboard user stood on something invisible for
     the better part of a second. That one was real, and is fixed.
The narrow-screen mapping had a real defect too: both column headings stacked
above everything and labelled nothing.
PARTIAL / BROKEN: — none —
NEXT: the per-locale translation pass, one language per iteration.

## 12 — The two pages that are not the homepage
WHAT CHANGED: `404.html` rebuilt on the Gateway system, still self-contained
and still carrying its inlined twenty-locale table, so an error page costs one
request and renders in the visitor's language. `assets/og.html` rebuilt and
`og-cover.png` re-rendered from it, using the same still the page falls back
to, so a shared link looks like the page it opens. The seven IBM Plex faces
are removed: nothing referenced them once the card was rebuilt (144 KB).
`assets/valo-symbol-teal.png` is kept — it is a brand mark rather than dead
code, and the brand kit is not the place to prune by reference count.
VERIFIED: `--check` green on both files. Chrome at 1440x900 for the 404 and at
1200x630 for the card.
⭐ The first card render had a visible vertical seam where the veil gradient
ended: the card's radial ground and the still's own ground are different
colours, and the image is opaque. Flattening the card's ground to exactly the
still's `#080a10` removed it; the depth is painted over the top instead.
PARTIAL / BROKEN: — none —
NEXT: the per-locale translation pass, one language per iteration.
