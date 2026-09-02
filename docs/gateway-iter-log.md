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
