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
