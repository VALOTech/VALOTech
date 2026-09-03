# VALO Tech

Corporate homepage and ecosystem hub for **VALO TECH PTE. LTD.** (Singapore), served as a static site from GitHub Pages at **[valotech.org](https://valotech.org)**.

The page leads with **ValoLab** — a multi-agent AI workforce deployed on a client's own clean data, audit-defensible by design — and presents the six products of the VALO ecosystem.

## Highlights

- **No build step.** Hand-authored HTML, CSS and vanilla JavaScript; the repository is the deployed artifact, served verbatim. One graphics library is vendored under `assets/scene/`, and one dev-time generator writes the English copy into the markup (below). Nothing is compiled to serve the page.
- **"Gateway" design system.** Deep space with condensed display type and glass panels held in a planet's orbit — the design language authored by our product designer, recorded in [docs/design-gateway.md](docs/design-gateway.md). One theme: the page is dark, because everything in it is lit.
- **A planet that grows as you read.** A cratered lunar sphere becomes a living Earth across the scroll — NASA Blue Marble surface, a cloud shell at the 15 km base, a Rayleigh atmosphere at the 100 km line, and one dithered frontier so each pixel belongs to exactly one surface. It turns on its own axis at 3.2° a second whether or not you scroll. It loads only where WebGL and module support are both present; everywhere else a still frame of the same planet stands in and the page reads identically.
- **A sky that agrees with itself.** A star field in three parallax tiers, meteors crossing it at random about every twenty seconds, and a sun that keeps station with the planet as the page runs. The sun is not decoration: one vector derived from where its disc is drawn lights the lunar terminator, the Earth's day and night, the clouds and the atmosphere's limb — move the disc and the whole sky follows.
- **20-language localization.** Dependency-free runtime locale switching with RTL support. English is the source of truth: it is generated into the markup so the whole page reads without JavaScript, and swapped for the visitor's locale on load. Each script is set in a face designed for it rather than in whatever the system calls `monospace`.
- **Accessible by default.** Localized skip link and `aria-label`s, semantic landmarks, `prefers-reduced-motion` support, and a print stylesheet that puts the page on paper in black on white. Text contrast is measured against the painted pixel — panel fill over planet over star field — rather than token against token; focus is always visible, and never lands on something still fading in.

## Tech stack

| Concern | Choice |
|---|---|
| Markup | Semantic HTML — `index.html`, `404.html` |
| Styling | Vanilla CSS design system — `assets/site.css` |
| Behaviour | Dependency-free vanilla JS — `assets/site.js` |
| Scene | three.js 0.166 (MIT), vendored and dynamically imported — `assets/scene/` |
| i18n | 20-locale dictionaries + runtime switch — `assets/i18n.js` |
| Type | Roboto Condensed + DM Mono, self-hosted; IBM Plex Mono for Vietnamese — `assets/fonts/` |
| Icons | Phosphor, inlined as an SVG sprite in `index.html` |
| Hosting | GitHub Pages, custom domain `valotech.org` |

## Repository layout

```
index.html              Markup + inline SVG sprite (Phosphor icons + 6 product brand marks)
404.html                Custom not-found page — self-contained, themed, localized in all 20 locales
assets/
  site.css              "Gateway" design system — tokens, layout, components, per-script type
  site.js               Behaviour — i18n, language switcher, scroll reveal, mobile menu, scroll-spy
  i18n.js               20-locale configuration + dictionaries (English is the source)
  fonts.css             @font-face declarations, generated from the served subsets
  scene/
    boot.js             Capability gate; places the planet and the sun, and derives
                        the light direction from where the sun was drawn
    planet.js           The lunar-to-Earth scene — geometry, materials, lighting, the scrub
    three.module.min.js three.js 0.166.0, vendored (MIT — see three.LICENSE beside it)
    stars.js            The star field and the meteors, on 2D canvases so both run
                        without WebGL
  textures/             Planet surfaces (WebP) + the still that stands in for the scene
  fonts/                Self-hosted woff2 — Roboto Condensed, DM Mono, IBM Plex Mono
  icons/                Source Phosphor SVGs, inlined into the sprite in index.html
  flags/                20 locale flag SVGs for the language switcher
  og.html               Render source for the social-share card (og-cover.png, 1200x630)
  *.png / favicon.*     Brand marks, favicons, and the social-share image
scripts/
  sync-static-copy.mjs  Writes the English dictionary into index.html and 404.html;
                        --check fails on drift, on a broken locale, and on a lost node
docs/
  design-gateway.md     The design system — palette, type, the scene, the chapters
  gateway-iter-log.md   Working log of the rebuild (newest 20 entries)
glossary-vi.json        Authoritative Vietnamese glossary — concept → approved / forbidden term
glossary-vi.md          Provenance + voice notes behind each glossary-vi.json rendering
.claude/skills/         Reviewed localization tooling — EN → locale translation + native writing
CNAME · robots.txt · sitemap.xml · .nojekyll   GitHub Pages and SEO configuration
```

## Internationalization

20 ecosystem locales, with order, RTL, and endonyms synced to the VALO standard:
SEA-priority `en zh zt vi th id ms tl` + global `hi es ar fr bn pt ru ur de ja tr ko`.

- **English is the source of truth.** Every other locale is authored in full to a formal, natural register; product names and technical terms stay in English.
- Page copy, the skip link, the tab title, and control / region `aria-label`s are localized and applied by `site.js` through `data-i18n` / `data-i18n-html` / `data-i18n-aria`.
- **The served markup carries the English text**, generated from the dictionary by `scripts/sync-static-copy.mjs`, so a reader without JavaScript — a crawler that does not run it, a social-card scraper, a printed page — gets the whole page rather than empty headings. The pre-push hook fails if the two drift apart — **once armed** (`core.hooksPath` is per-clone local config; see Git hooks below).
- `404.html` is self-contained: the same generator inlines its 20-locale table, so an error page costs one request and still renders in the visitor's language, falling back to English without JavaScript.
- RTL (`ar`, `ur`) flips `dir`. The visitor's choice persists in `localStorage`; otherwise the browser language is matched.
- **Each script is set in a face chosen for it.** Roboto Condensed and DM Mono carry Latin, Latin-ext, Cyrillic and Vietnamese between them; Chinese, Japanese, Korean, Thai, Arabic and the Indic scripts name their own stacks in `assets/site.css`. Vietnamese takes IBM Plex Mono for the whole mono role, because DM Mono has no Vietnamese and a line set in two typefaces is worse than one set in a different one.
- Vietnamese terminology is fixed by `glossary-vi.json`, with the reasoning behind each rendering in `glossary-vi.md`. Check any Vietnamese output against it before shipping:

```bash
python3 .claude/skills/translate-english-to-native-locales/scripts/check_glossary.py <file> glossary-vi.json
```

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

No build or install step is required. After editing `assets/i18n.js`, regenerate the served English copy:

```bash
node scripts/sync-static-copy.mjs
```

`--check` is the gate the pre-push hook runs: it fails on drift between the markup and the dictionary, on a locale that has fallen out of parity, and on a localized node that has gone missing from the markup.

## Deployment

GitHub Pages serves the site from the `main` branch (root folder) at the `valotech.org` custom domain set in `CNAME`. Pushing to `main` publishes. The canonical URL, Open Graph tags, `sitemap.xml`, `robots.txt`, and the JSON-LD organization block all reference `https://valotech.org/`.

The social-share card is rendered from `assets/og.html` at 1200×630 — reopen it at that size and screenshot the body whenever the hero copy or the design changes, so a shared link looks like the page it opens.

## Git hooks

The repository ships a `pre-push` guard (`.githooks/pre-push`) that refuses force-pushes, branch deletions, pushes to any branch other than `main`, and any push whose generated markup has drifted from the English dictionary or whose twenty locale dictionaries have fallen out of parity — because pushing to `main` publishes, the deployed history is the audit trail. `core.hooksPath` (and the pull / push / merge safety below) is per-clone local config and is never committed, so arm it once after cloning:

```bash
git config core.hooksPath .githooks     # pre-push guard (force-push / deletion / non-main refusal)
git config pull.ff only                 # git pull fast-forwards or stops — never a surprise merge commit
git config push.default simple          # git push sends only the current branch to its same-name upstream
git config rerere.enabled true          # record a conflict resolution once, replay it if it recurs
git config merge.conflictStyle zdiff3   # conflict markers show the common ancestor (git >= 2.35)
```

Undo the hook with `git config --unset core.hooksPath`.

## Ecosystem

VALO Tech is the parent of the **VALO ecosystem** — five consumer products and one B2B line, each with its own brand and domain:

| Product | Domain | What it is |
|---|---|---|
| VALO Ads | [valoads.io](https://valoads.io) | Ad network, affiliate and commerce hub; the platform substrate |
| VALO Pocket | [valopocket.io](https://valopocket.io) | Consumer e-wallet; the money and identity layer |
| Shimmra | [shimmra.live](https://shimmra.live) | Video social network for idols & fans |
| Amavo | [amavo.app](https://amavo.app) | Play-together dating with 1:1 video dates |
| Farola | [farola.io](https://farola.io) | Vietnam ↔ Europe mobility platform; relocation, study and work |
| Verdiq | [verdiq.io](https://verdiq.io) | B2B GRC and compliance platform |

## Credits

The Earth surface is an optimized derivative of NASA Earth Observatory's August *Blue Marble: Next Generation* global base map, and the cloud shell of NASA's *Blue Marble: Clouds* composite. Used as imagery without implying endorsement.

three.js is © the three.js authors, MIT — the licence travels with it at `assets/scene/three.LICENSE`. All three self-hosted families are SIL Open Font License 1.1: Roboto Condensed (`googlefonts/roboto-3-classic`), DM Mono (`googlefonts/dm-fonts`) and IBM Plex Mono (`IBM/plex`).

## License

Proprietary. © VALO TECH PTE. LTD. All rights reserved.
