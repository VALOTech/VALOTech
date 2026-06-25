# VALO Tech

Corporate homepage and ecosystem hub for **VALO TECH PTE. LTD.** (Singapore), served as a static site from GitHub Pages at **[valotech.org](https://valotech.org)**.

The page leads with **ValoLab** — a multi-agent AI workforce deployed on a client's own clean data, audit-defensible by design — and presents the five products of the VALO ecosystem.

## Highlights

- **Zero-dependency static site.** Hand-authored HTML, CSS, and vanilla JavaScript — no framework, no build step, no runtime dependencies. The repository is the deployed artifact.
- **"Lattice" design system.** A teal-themed member of the VALO family languages: CSS-variable tokens, three-way light / dark / system theming, an animated brand logo and ecosystem hub, and a custom cursor ribbon — all motion-safe.
- **20-language localization.** Runtime locale switching with RTL support; the page is fully readable without JavaScript.
- **Accessible by default.** Localized skip link and `aria-label`s, visible focus, ARIA tabs, semantic landmarks, WCAG AA contrast, and `prefers-reduced-motion` support.

## Tech

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
404.html                Custom not-found page
assets/
  site.css              "Lattice" design system — tokens, layout, components, theming
  site.js               Behaviour — i18n, language switcher, theme, scroll-reveal,
                        mobile menu, tabs, ecosystem-hub animation, cursor ribbon
  i18n.js               20-locale configuration + dictionaries (English is the source)
  fonts/                Self-hosted IBM Plex Sans (400-700) + Plex Mono (400-600), woff2
  icons/                Source Phosphor SVGs, inlined into the sprite in index.html
  flags/                20 locale flag SVGs for the language switcher
  og.html               Render source for the social-share card (og-cover.png, 1200x630)
  *.png / favicon.*     Brand marks, favicons, and the social-share image
CNAME · robots.txt · sitemap.xml · .nojekyll   GitHub Pages and SEO configuration
```

## Internationalization

20 ecosystem locales, with order, RTL, and endonyms synced to the VALO standard:
SEA-priority `en zh zt vi th id ms tl` + global `hi es ar fr bn pt ru ur de ja tr ko`.

- **English is the source of truth.** Every other locale is authored in full to a formal, natural register; product names and technical terms stay in English.
- Page copy, the skip link, and control / region / diagram `aria-label`s are localized and applied by `site.js` through `data-i18n` / `data-i18n-html` / `data-i18n-aria`.
- RTL (`ar`, `ur`) flips `dir`. The visitor's choice persists in `localStorage`; otherwise the browser language is matched.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

No build or install step is required.

## Deployment

GitHub Pages serves the site from the `main` branch (root folder) at the `valotech.org` custom domain set in `CNAME`. Pushing to `main` publishes. The canonical URL, Open Graph tags, `sitemap.xml`, `robots.txt`, and the JSON-LD organization block all reference `https://valotech.org/`.

## Ecosystem

VALO Tech is the parent of the **VALO ecosystem** — four consumer products and one B2B line, each with its own brand and domain:

| Product | Domain | What it is |
|---|---|---|
| VALO Ads | [valoads.io](https://valoads.io) | Ad network, affiliate and commerce hub; the platform substrate |
| VALO Pocket | [valopocket.io](https://valopocket.io) | Consumer e-wallet; the money and identity layer |
| Shimmra | [shimmra.live](https://shimmra.live) | Idol live-streaming platform |
| Amavo | [amavo.app](https://amavo.app) | Online dating with 1:1 video dates |
| VALO Compliance | [valocompliance.io](https://valocompliance.io) | B2B GRC and compliance platform |

## License

Proprietary. © VALO TECH PTE. LTD. All rights reserved.
