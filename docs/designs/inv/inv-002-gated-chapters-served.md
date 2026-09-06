---
code: INV-002
title: Gated gateway chapters, served
domain: inv
prd_refs: [INV-002, SITE-002, SEC-R01, DATA-R05]
depends_on: [AUTH-002, SITE-005]
depended_by: []
layers_touched: [api, frontend, ui]
cross_cutting_rules: [SEC-R01, DATA-R05, I18N-R01, A11Y-R01, SCENE-R05]
status: design-ready
---

# `INV-002` — Gated gateway chapters, served

## 1. Purpose and PRD refs

The two hidden chapters and the seven mechanisms, delivered by the server to a
reader who is entitled to them and to nobody else. Realizes `INV-002` and is what
turns `SITE-002` from a demonstration into a control.

The gateway today hides *How we deliver* and *The portfolio*, and the mechanism
detail under each of seven trust claims, with a stylesheet. **The material is in
the page source**, and anyone who opens the developer tools or reads the HTML has
it. The site's own stylesheet says as much in a comment, and the PRD says it in
`P-02`: until the server enforces it, nothing is described as protected.

This design is the smallest change that makes the claim true, and it is the one
task in the plan that removes an existing exposure rather than adding a feature.

## 2. Layer walkthrough

**Down.** The gated markup is not rendered for a reader who may not see it. Not
rendered — not rendered-and-hidden, not rendered-and-stripped-by-script. The
server's response to an anonymous request does not contain the words.

**Up.** A visitor sees the seven chapters they always saw, and where the two
gated ones would be, a short block saying what is behind the sign-in and offering
it. A signed-in reader sees nine chapters and the mechanism detail inline.

## 3. Contracts

### What is gated

| Surface | Anonymous | Signed in |
|---|---|---|
| `#deliver` — the five-phase engagement | absent, replaced by an invitation to sign in | present |
| `#ecosystem` — the portfolio and where each product stands | absent, same replacement | present |
| The three mechanisms under each of seven trust claims | absent | present |
| Everything else | present | present |

### The rendering rule

The page is server-rendered (`SITE-005`). The reader is resolved before the
markup is built, and the gated components are **not called** for a reader who may
not have them. There is no `hidden` attribute, no `display: none`, no
`aria-hidden`, and no client-side removal.

The verification for this is not a code review. It is: request the page with no
cookie, and grep the response body for a sentence that appears only inside a
gated chapter. The absence of that string is the whole proof, and it is the
test that ships with the task.

### The journey

The scene's route already handles a folded chapter: a station whose chapter has
no layout box is dropped, and the world's journey spans the gap
(`SCENE-001/T2`, `SITE-003/T2`). That mechanism was built for the CSS gate and it
is what makes this change small — the scene does not need to know why a chapter
is absent, only that it is.

The nav's two gated links follow the same rule: not rendered rather than hidden.

### The invitation

Where a gated chapter would be, a visitor gets a short block: what the chapter
covers, one sentence, and a sign-in control. Not a paywall, not a teaser with
blurred text — `P-01` says the public argument is complete on its own, so this
block adds depth rather than withholding the point.

It carries no fragment of the gated content, including as a preview image.

### Locales

The gated chapters' copy stays in the twenty-locale dictionary
(`I18N-001`) and is served the same way. Moving it into the content system would
put the company's own argument behind an editor and would break the parity gate
that keeps markup and dictionary in step; `CMS-DEC-01` settles that the gateway's
words are not CMS content.

That means the gated copy **is** in the published dictionary file, which anyone
can fetch. So the dictionary is split: the gated keys move into a second
catalogue the server sends only to an entitled reader. Without that split, this
design closes the HTML door and leaves the JSON one open — which is exactly the
shape of defect it exists to remove.

## 4. Integration

**`SITE-005`** is what makes server rendering possible at all; this design is
the first thing that needs it. **`AUTH-002`** resolves the reader.
**`SITE-002`** is the feature this completes. **`I18N-001`** holds the copy and
gains the split catalogue. **`SCENE-001`** already spans a folded chapter.

## 5. Cross-cutting compliance

- **`SEC-R01`** — the gate is the server, and the proof is the response body.
- **`DATA-R05`** — the reader is resolved before the markup is built.
- **`I18N-R01`** — the gated copy stays translated in all twenty locales.
- **`A11Y-R01`** — the sign-in invitation is a real control, reachable and named.
- **`SCENE-R05`** — the world stays in sight across the gap a folded chapter
  leaves.

## 6. Open questions and trade-offs

- **Splitting the dictionary is the expensive part.** The parity gate
  (`I18N-002`) counts localized nodes in one file against one catalogue; two
  catalogues means it counts two, and the split has to be by key rather than by
  hand. The alternative — leaving the gated copy in the public catalogue — is not
  an alternative, it is the defect.
- **The invitation block is the one piece of new copy.** Two sentences, in
  twenty locales, and they are the first strings this project adds since the
  gateway shipped. They go through the same authoring and the same gate.

## 7. Task list

- `INV-002/T1` — The gated components are not called for a reader who may not see them
- `INV-002/T2` — A test requests the page with no cookie and proves a gated sentence is absent from the body
- `INV-002/T3` — The nav's gated links are not rendered rather than hidden
- `INV-002/T4` — The dictionary splits, and the gated catalogue is sent only to an entitled reader
- `INV-002/T5` — The parity gate counts both catalogues
- `INV-002/T6` — The invitation block, in twenty locales, carrying no fragment of what it invites to
