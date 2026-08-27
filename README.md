# VALO Tech

Corporate homepage and ecosystem hub for **VALO TECH PTE. LTD.** (Singapore), served as a static site from GitHub Pages at **[valotech.org](https://valotech.org)**.

The page leads with **ValoLab** — a multi-agent AI workforce deployed on a client's own clean data, audit-defensible by design — and presents the six products of the VALO ecosystem.

## Highlights

- **Zero-dependency static site.** Hand-authored HTML, CSS, and vanilla JavaScript — no framework, no bundler, no runtime dependencies. The repository is the deployed artifact, served verbatim. One dev-time generator writes the English copy into the markup (below); nothing is compiled to serve the page.
- **"Lattice" design system.** A teal-themed member of the VALO family languages: CSS-variable tokens, three-way light / dark / system theming, an animated brand logo and ecosystem hub, and a custom cursor ribbon — all motion-safe.
- **20-language localization.** Dependency-free runtime locale switching with RTL support. English is the source of truth: it is generated into the markup so the whole page reads without JavaScript, and swapped for the visitor's locale on load. Vietnamese, CJK, Thai, Arabic and the Indic scripts each get their own leading, tracking and font stack.
- **Accessible by default.** Localized skip link and `aria-label`s, ARIA tabs that still read as plain stacked sections without JavaScript, a real comparison table, semantic landmarks, and `prefers-reduced-motion` support. Text and non-text contrast are measured against the painted pixel in both themes, focus is always visible and never lands on something invisible, and a print stylesheet puts the whole page on paper in black on white.

## Tech stack

| Concern | Choice |
|---|---|
| Markup | Semantic HTML — `index.html`, `404.html` |
| Styling | Vanilla CSS design system — `assets/site.css` |
| Behaviour | Dependency-free vanilla JS — `assets/site.js` |
| i18n | 20-locale dictionaries + runtime switch — `assets/i18n.js` |
| Type | IBM Plex Sans + Plex Mono, self-hosted — `assets/fonts/` |
| Icons | Phosphor, inlined as an SVG sprite in `index.html` |
| Hosting | GitHub Pages, custom domain `valotech.org` |

## Repository layout

```
index.html              Markup + inline SVG sprite (Phosphor icons + 6 product brand marks)
404.html                Custom not-found page — self-contained, themed, localized in all 20 locales
assets/
  site.css              "Lattice" design system — tokens, layout, components, theming
  site.js               Behaviour — i18n, language switcher, theme, scroll-reveal,
                        mobile menu, tabs, ecosystem-hub animation, cursor ribbon
  i18n.js               20-locale configuration + dictionaries (English is the source)
  fonts/                Self-hosted IBM Plex Sans (400-700) + Plex Mono (400-600), woff2
                        Latin, Latin-ext, Vietnamese, Cyrillic; other scripts use system stacks
  icons/                Source Phosphor SVGs, inlined into the sprite in index.html
  flags/                20 locale flag SVGs for the language switcher
  og.html               Render source for the social-share card (og-cover.png, 1200x630)
  *.png / favicon.*     Brand marks, favicons, and the social-share image
scripts/
  sync-static-copy.mjs  Writes the English dictionary into index.html and 404.html;
                        --check fails on drift, on a broken locale, and on a lost node
glossary-vi.json        Authoritative Vietnamese glossary — concept → approved / forbidden term (machine-checkable)
glossary-vi.md          Provenance + voice notes behind each glossary-vi.json rendering, cited by i18n key
.claude/skills/         Reviewed localization tooling — EN → locale translation + native EN / ZH / VI writing
CNAME · robots.txt · sitemap.xml · .nojekyll   GitHub Pages and SEO configuration
```

## Internationalization

20 ecosystem locales, with order, RTL, and endonyms synced to the VALO standard:
SEA-priority `en zh zt vi th id ms tl` + global `hi es ar fr bn pt ru ur de ja tr ko`.

- **English is the source of truth.** Every other locale is authored in full to a formal, natural register; product names and technical terms stay in English.
- Page copy, the skip link, the tab title, and control / region / diagram `aria-label`s are localized and applied by `site.js` through `data-i18n` / `data-i18n-html` / `data-i18n-aria`.
- **The served markup carries the English text**, generated from the dictionary by `scripts/sync-static-copy.mjs`, so a reader without JavaScript — a crawler that does not run it, a social-card scraper, a printed page — gets the whole page rather than empty headings. The pre-push hook fails if the two drift apart — **once armed** (`core.hooksPath` is per-clone local config; see Git hooks below).
- `404.html` is self-contained: the same generator inlines its 20-locale table, so an error page costs one request and still renders in the visitor's language, falling back to English without JavaScript.
- RTL (`ar`, `ur`) flips `dir`. The visitor's choice persists in `localStorage`; otherwise the browser language is matched.
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

## Deployment

GitHub Pages serves the site from the `main` branch (root folder) at the `valotech.org` custom domain set in `CNAME`. Pushing to `main` publishes. The canonical URL, Open Graph tags, `sitemap.xml`, `robots.txt`, and the JSON-LD organization block all reference `https://valotech.org/`.

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

## License

Proprietary. © VALO TECH PTE. LTD. All rights reserved.
