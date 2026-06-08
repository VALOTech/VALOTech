# VALO Tech homepage

Static marketing homepage for **VALO Tech Pte. Ltd.** (Singapore), served as-is from GitHub Pages. No build step, no framework, no runtime dependencies.

VALO Tech is the parent of the **VALO ecosystem**. This page leads with **ValoLab** (a multi-agent AI workforce deployed on a client's own clean data, audit-defensible by design) and showcases the five ecosystem products: VALO Ads, VALO Pocket, Shimmra, Amavo, and **VALO Compliance**.

## Design language: "Lattice"

A teal-themed sibling of the VALO family languages (VALO Ads "Aurora", VALO Pocket "Verdant", Shimmra "Halo", Amavo "Ember"). It shares the family's chrome so all sites read as one ecosystem:

- **Token architecture** (CSS variables), brand teal `#0D5A54` sampled from the logo + jade accent, three-way **light / dark / system** theming.
- **Sticky blur header** with brand lockup, anchor nav, **20-language switcher**, a **3-way light/dark/auto** segmented toggle, and the primary CTA.
- **Ecosystem-strip footer** linking every VALO product (each keeps its own brand mark + color).
- **Custom teal scrollbar**, themed **SVG cursors + a cursor wake-ribbon**, scroll-reveal at `cubic-bezier(.16,1,.3,1)`, hover-lift + glow.
- **Animated brand logo** in the hero (circuit traces draw in, nodes pulse, data sparks converge, breathing glow, orbit ring).
- **Animated ecosystem hub** (VALO Tech at the center, products orbiting with flowing particles).
- Type: **IBM Plex Sans + Plex Mono** (self-hosted). Icons: **Phosphor** (inline sprite).
- Fully accessible: skip link, focus-visible rings, ARIA tabs, native `<details>` accordion, semantic landmarks; everything respects `prefers-reduced-motion` and is readable without JS.

## Structure

```
index.html              Markup + inline SVG sprite (icons + 6 brand marks)
assets/
  site.css              The full Lattice design system
  site.js               Behavior: i18n apply, language switcher, 3-way theme,
                        scroll-reveal, header scroll, cursor ribbon, mobile menu,
                        tabs, back-to-top, ecosystem-hub particle animation
  i18n.js               20-locale config + English & Vietnamese dictionaries
  valo-symbol-teal.png  Brand mark, teal (light surfaces)
  valo-symbol-white.png Brand mark, white (dark / teal surfaces)
  valo-lockup-white.png Full vertical lockup, white
  icon-512 / apple-touch / favicon.ico / -16 / -32 / -48
  og-cover.png          1200x630 social-share card  (og.html is its render source)
  fonts/                Self-hosted IBM Plex Sans (400-700) + Mono (400-600), woff2
  icons/                Source Phosphor SVGs (inlined into the sprite at build)
404.html · robots.txt · sitemap.xml · .nojekyll
VALO Tech Logo.jpg                   Original logo (asset source of truth)
VALO Tech Content for Homepage.html  BD-prepared source content
```

## Internationalization

20 ecosystem locales (order, RTL, endonyms synced with the VALO standard):
SEA-priority `en zh zt vi th id ms tl` + Global `hi es ar fr bn pt ru ur de ja tr ko`.

- The switcher lists all 20. **English and Vietnamese are authored in full** (every visible string).
- The other 18 are **seeded**: the switcher works and the page falls back to English (marked `EN` in the menu) until each is translated through the ecosystem LibreTranslate + admin-review path. This matches how the sibling products ship translations.
- RTL (`ar`, `ur`) flips `dir`; the user's choice persists in `localStorage`, otherwise the browser language is matched.

## Preview locally

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

## Deploy to GitHub Pages

1. Push to GitHub (branch `main`).
2. **Settings -> Pages**: Source = *Deploy from a branch*, Branch = **main**, Folder = **/ (root)**, Save.
3. For the `valotech.org` custom domain: add it under Settings -> Pages -> Custom domain (creates a `CNAME`), then point DNS at GitHub Pages.

## Confirm before going live

- **Contact email** `hello@valotech.org` (every CTA + footer).
- **Production URL** `https://valotech.org/` (canonical, Open Graph, `sitemap.xml`, `robots.txt`, JSON-LD).
- **VALO Compliance** is shown as a new product with no outbound link yet (a "New" badge). Add its URL once the site is live.
- The four live products link to `valoads.io`, `valopocket.io`, `shimmra.live`, `amavo.app`. (To keep the whole ecosystem in sync, add a VALO Compliance card to the other four products' footer strips too.)
- More languages: add a `vi`-style block to `assets/i18n.js` `dict` for any locale.
