---
code: DECK-001
title: Deck authoring
domain: deck
prd_refs: [DECK-001, CMS-R04]
depends_on: [CMS-002, CMS-003]
depended_by: [DECK-002]
layers_touched: [domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R01, CMS-R04, SEC-R04, I18N-R01, A11Y-R02]
status: design-ready
---

# `DECK-001` — Deck authoring

## 1. Purpose and PRD refs

Composing the presentation an investor is asked to read. Realizes `DECK-001`.

A deck differs from the other two content types in one way that matters here: it
is **read in sequence, once, at the start of a conversation**, and its author is
building an argument rather than filing a document. So the authoring surface is
about order and about seeing the whole thing at once, and about very little else.

## 2. Layer walkthrough

**Down.** A `content_items` row with `type = 'deck'`. Its revision's blocks are
the sections in order. No new tables and no per-slide row: a section is a run of
blocks between headings, and a deck is one document.

**Up.** Two views of the same draft. A linear editor, which is `CMS-002`. And an
overview — every section as a card, in order, draggable — because the failure a
deck author actually has is that section four should come second, and that is
invisible while scrolling.

## 3. Contracts

### Sections

A section is a level-2 heading and everything until the next one. The overview
derives them; nothing is stored twice. Reordering in the overview reorders the
underlying block array, which keeps the two views the same object rather than
two representations to reconcile.

### The overview

    GET /admin/decks/<id>/overview

Cards in order, each showing the section heading, its first line, and whether it
carries an image or a figure. Drag to reorder; the drag is also a keyboard
operation — select a card, move it with the arrow keys — because reordering by
drag alone excludes anyone who cannot (`A11Y-R01`).

The overview is where a deck is judged, so it shows the count: sections, words,
and figures. A deck of thirty sections is a document, and the number is how its
author finds that out before an investor does.

### Speaker context

Each section may carry a `context` field: what the person presenting says that is
not on the page. It is stored on the section's heading block, it is **never
served to an investor**, and it is visible in the overview and in print-for-the-
presenter. The reason it exists is that a deck read alone and a deck presented
are different documents, and writing both in one place is how they stay in step.

Because it is never served, it is subject to the same discipline as everything
else that is never served: the read path for an investor strips it in the
repository function, not in the template (`CMS-R03`'s spirit applied to a field
rather than to a row).

### What a deck is not

- **Not slides.** No fixed canvas, no positioning, no per-slide layout. A deck
  here is a sequence of sections rendered as a readable document, because it is
  read on a phone at least as often as it is presented.
- **Not exportable to PowerPoint.** That is a rendering pipeline into a format
  whose fidelity nobody can verify, and an investor who wants a file can print
  to PDF (`DECK-003`).

## 4. Integration

**`CMS-002`** is the linear editor and its block vocabulary. **`CMS-003`** holds
the images. **`DECK-002`** publishes a version and is where the versioning
constraint lives. **`DECK-003`** is the reading view. **`DECK-004`** decides who
may read it.

## 5. Cross-cutting compliance

- **`CMS-R01`**, **`CMS-R04`** — revisions and blocks.
- **`SEC-R04`** — publish, withdraw and grant changes audited.
- **`A11Y-R01`** — reordering is operable without a pointer.
- **`A11Y-R02`** — an image still requires its description.
- **`I18N-R01`** — chrome from the dictionary.

## 6. Open questions and trade-offs

- **Sections derived from headings rather than stored as rows.** A section table
  would make reordering a single update instead of a rewrite of the block array.
  It would also mean two sources for the same structure, and a heading edited in
  the linear editor that does not move its section. One document, derived twice.
- **Speaker context inside the content.** It could be a separate table, which
  would make "never serve it" structural rather than a strip in the read path.
  It is kept inline because it belongs to a section and moves with it under
  reordering, and the strip is one function with a test that proves an investor
  read never contains the field.

## 7. Task list

- `DECK-001/T1` — Sections derived from level-2 headings, with the block array the single source
- `DECK-001/T2` — An overview of section cards in order, showing heading, first line and what each carries
- `DECK-001/T3` — Reordering by drag and by keyboard, writing back to the block array
- `DECK-001/T4` — Section, word and figure counts in the overview
- `DECK-001/T5` — Speaker context per section, stripped in the investor read path and proven by a test
