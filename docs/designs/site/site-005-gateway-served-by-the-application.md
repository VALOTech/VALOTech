---
code: SITE-005
title: The gateway served by the application
domain: site
prd_refs: [SITE-005, SITE-001, SEC-R01, I18N-R02]
depends_on: [AUTH-002, POST-002, SITE-001]
depended_by: [INV-002, OPS-001]
layers_touched: [infra, api, frontend, ui]
cross_cutting_rules: [SEC-R01, I18N-R01, I18N-R02, I18N-R03, A11Y-R01, A11Y-R03, SCENE-R01, SCENE-R05]
status: design-ready
---

# `SITE-005` — The gateway served by the application

## 1. Purpose and PRD refs

The same page, served by the application instead of GitHub Pages. Realizes
`SITE-005`.

It exists for one reason: **`INV-002` needs a server that knows who is asking.**
A static host cannot render a page differently for a signed-in reader, so as long
as GitHub Pages serves valotech.org the gate on the two chapters is a stylesheet
and the material is in the source. Everything else about this task is the cost of
that one capability, and the design's job is to keep that cost at zero visible
change.

## 2. Layer walkthrough

**Down.** The markup becomes a server-rendered template over the same dictionary.
The stylesheet, the fonts, the scene modules and the images are the same files,
served with the same paths so nothing cached anywhere breaks.

**Up.** A visitor sees the page they saw yesterday. That is the acceptance
criterion, and it is measured rather than assumed.

## 3. Contracts

### What must not change

| Thing | Why it is on this list |
|---|---|
| Every URL | `valotech.org/`, `/404.html`, every asset path. A moved asset is a broken cache and a broken external link |
| The markup, node for node | The parity gate counts 245 localized nodes; a template that emits 244 has dropped a sentence |
| The twenty locales | Same dictionary, same keys, same runtime swap without a reload |
| The scene | Same modules, same measured constants. The scene is `SCENE-001`'s and this task does not touch it |
| First paint | Measured before and after at the same viewport on the same machine |

### What changes

- The document is rendered by the server, with the reader resolved first
  (`INV-002`).
- `assets/i18n.js` splits so the gated keys are a second catalogue
  (`INV-002/T4`).
- Public updates render in a news section (`POST-002`).
- The response carries the security headers (`SEC-001`), which a static host
  could only approximate through the CDN.

### The parity gate survives the move

`scripts/sync-static-copy.mjs` compares `index.html` against `assets/i18n.js`.
After the move there is no `index.html` — there is a template. The gate is
**pointed at the rendered output** rather than retired: it requests the page from
a running server, for an anonymous reader and for a signed-in one, and counts
against both catalogues.

Retiring it instead would be the tempting move and the wrong one: it is the check
that has kept markup and dictionary in step through every change to this page,
and the moment the page becomes dynamic is the moment drift gets easier.

### Caching

The public page is cached at the edge for anonymous readers and never for
signed-in ones — the `Vary` on the session cookie is what makes that safe, and it
is the single line whose absence would serve one investor's gated chapters to the
next visitor. It is verified by requesting the page twice through the CDN, once
with a cookie and once without, and comparing.

### The fallback

Until `OPS-001`, `main` keeps serving. The application is developed and run
locally, and the switch is a DNS change the owner makes with the static site
still there to return to. **Nothing about the transition may leave valotech.org
degraded for an hour**, and the way that is guaranteed is that the old site keeps
existing on a branch that is still deployable.

## 4. Integration

**`SITE-001`** through **`SITE-004`** describe the page this serves; none of them
changes. **`SCENE-001`** to **`SCENE-006`** are untouched and their designs stay
the record (`SCENE-R01`). **`INV-002`** is the feature that needs this.
**`POST-002`** adds the news section. **`SEC-001`** supplies the headers.
**`OPS-001`** is the DNS change, and is a separate decision.

## 5. Cross-cutting compliance

- **`SEC-R01`** — this is what makes the gate real.
- **`I18N-R01`**, **`I18N-R02`**, **`I18N-R03`** — twenty locales, complete, ICU
  where a string takes a value.
- **`A11Y-R01`**, **`A11Y-R03`** — the accessibility work in `A11Y-001` is
  markup and stylesheet, and survives the move; it is re-verified rather than
  assumed.
- **`SCENE-R01`**, **`SCENE-R05`** — the scene's designs govern it, and this
  task changes nothing in them.

## 6. Open questions and trade-offs

- **Server-rendering a page that was static costs its best property.** A static
  file on a CDN cannot be slow and cannot be down. The mitigation is edge caching
  for anonymous readers, which restores most of it, and the honest statement is
  that availability now depends on an origin that did not exist before. That is
  the price of `INV-002`, and `INV-002` is the reason the current gate is a
  claim the PRD refuses to make.
- **The page could stay static and only the room be dynamic.** That was
  considered and settled at `INFRA-DEC-01`: it leaves the gated chapters in the
  public source forever, which is the exposure this whole line of work exists to
  remove.

## 7. Task list

- `SITE-005/T1` — The page is server-rendered from the same dictionary, at the same URLs, with the same asset paths
- `SITE-005/T2` — The parity gate is pointed at the rendered output and counts both catalogues, for both readers
- `SITE-005/T3` — Node-for-node comparison of the rendered page against the static one, at three viewports
- `SITE-005/T4` — Edge caching for anonymous readers, `Vary` on the session cookie, verified through the CDN with and without one
- `SITE-005/T5` — First paint measured before and after, at the same viewport on the same machine
- `SITE-005/T6` — `main` stays deployable as the fallback until the owner answers `INFRA-DEC-03`
