# Security Policy

VALO Tech is a static marketing site — hand-authored HTML, CSS, and vanilla JavaScript served from GitHub Pages at [valotech.org](https://valotech.org). It has no application backend, no accounts, and collects no visitor data; the repository is the deployed artifact. The attack surface is therefore the published site and this repository itself, and we take a report about either one seriously.

## Reporting a vulnerability

**Do not open a public issue.** Email **security@valotech.org** with:

- what you found and where — the URL, page, or file,
- how to reproduce it, and
- what an attacker could achieve with it.

You will get an acknowledgement within **3 business days** and an assessment with a remediation plan within **10 business days**. If a fix will take longer, we will tell you honestly why.

## Scope

In scope — the `valotech.org` static site and this repository:

- defacement or content injection into the published pages,
- cross-site scripting or DOM injection in the hand-authored JavaScript (`assets/site.js`, `assets/i18n.js`),
- Content-Security-Policy and subresource-integrity weaknesses in the site's own configuration,
- open-redirect, SEO poisoning, or link abuse through the site, `robots.txt`, `sitemap.xml`, or `CNAME`.

The site ships **zero runtime dependencies** — no framework, no CDN, no third-party script — so there is no package supply-chain surface. A report that this posture has silently regressed, with a remote script, style, or font loading from the page, is in scope and welcome.

Out of scope:

- the individual VALO products — VALO Ads, VALO Pocket, Shimmra, Amavo, Farola, and Verdiq — and their applications and backends; each has its own repository and security contact, so report those there,
- social engineering of our people, and physical attacks,
- volumetric denial-of-service against GitHub Pages' shared infrastructure, and HTTP response headers that GitHub Pages, not this repository, controls — report those to GitHub.

## Safe harbor

We will not pursue legal action against a researcher who reports in good faith, stays within the scope above, does not degrade the service for others, and gives us a reasonable window to fix an issue before disclosing it publicly.
