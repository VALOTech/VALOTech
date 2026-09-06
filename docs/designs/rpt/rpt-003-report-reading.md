---
code: RPT-003
title: Report reading
domain: rpt
prd_refs: [RPT-003, CMS-R05, A11Y-R01, A11Y-R03]
depends_on: [RPT-002, CMS-005]
depended_by: []
layers_touched: [frontend, ui]
cross_cutting_rules: [CMS-R05, I18N-R01, I18N-R04, A11Y-R01, A11Y-R02, A11Y-R03, SCENE-R04]
status: design-ready
---

# `RPT-003` — Report reading

## 1. Purpose and PRD refs

The investor's view of a report. Realizes `RPT-003`.

An investor reads this on a phone between meetings, or prints it to take into
one. Both cases are ordinary and both are usually broken, so both are in the
task list rather than in a note about future work.

## 2. Layer walkthrough

**Down.** Nothing. This design writes no data; it renders the blocks
`CMS-001` stores, in the locale `CMS-005` resolves.

**Up.** One column, the room's chrome above it, and the period and publication
date on the page itself rather than only in the navigation that led here — a
printed page, a forwarded PDF and a screenshot all lose the chrome.

## 3. Contracts

### The page

| Element | Notes |
|---|---|
| Period and title | The period is stated as words, in the reader's locale |
| Published date | The date the current revision became current, not when the item was created |
| Body | The blocks, one column, measured for reading rather than for the frame |
| Locale notice | Present only when falling back (`CMS-005`) |
| Previous and next period | By period, skipping gaps, and absent at the ends rather than disabled |

### The measure

One column at the reading measure, not the full frame. The gateway's `--maxw` is
tuned for a page that shares the frame with a scene; a report shares it with
nothing, and a paragraph running the width of a 3840 frame is unreadable at any
type size. The report column is narrower than the gateway's and it is the one
place in this product where that is true.

### The scene

**There is no scene here.** The room is where somebody works, and the world
belongs to the page that argues. A dark ground and the same type, and nothing
that moves — which also means this surface has nothing to slow under
`prefers-reduced-motion` beyond the reveals, and it has none of those either
(`SCENE-R04` is satisfied by there being no motion to reduce).

### Print

A print stylesheet, and it is a real deliverable rather than a courtesy:

- Black on white, the room's chrome gone, the body at a print measure.
- The period, the title and the publication date in a header that repeats.
- Images at their natural size, figures with their numbers **as a table**, so a
  chart that is illegible in greyscale is still readable.
- Links printed with their target after the text, since a printed link that
  cannot be followed and cannot be read is a gap in the sentence.

### The phone

The same column, the same order. The reading experience on a phone is the
default that everything else is a widening of, not an adaptation applied
afterwards. Figures scroll horizontally inside their own container; the page
never does.

### Locale

`CMS-005`'s resolution decides what is shown. When the reader's locale is not
reviewed they get the authored language and a single line saying so — placed
above the content, not below it, because a notice under a document is a notice
read after the reader has already been confused.

## 4. Integration

**`RPT-002`** provides the archive navigation and the period ordering.
**`CMS-005`** resolves the locale and supplies the fallback notice.
**`CMS-006`** decided, before this view runs, that this reader may be here.
**`INV-001`** is the chrome around it.

## 5. Cross-cutting compliance

- **`CMS-R05`** — a machine draft never reaches this view.
- **`I18N-R01`**, **`I18N-R04`** — chrome from the dictionary; the fallback is
  the authored language and it is announced.
- **`A11Y-R01`** — the whole page is reachable and operable by keyboard.
- **`A11Y-R02`** — every image carries the description `CMS-002` required.
- **`A11Y-R03`** — contrast measured on the ground this actually renders on.
- **`SCENE-R04`** — satisfied by there being no motion.

## 6. Open questions and trade-offs

- **No PDF export.** Print-to-PDF from the browser produces the same document
  the print stylesheet defines, and a server-side renderer is a second rendering
  path that will drift from the first. The cost is that the file an investor
  saves is named by their browser rather than by us.
- **No table of contents.** A report is six sections; a contents list would be
  longer than the sections it indexes. It becomes right if reports grow, and the
  signal is a report that does not fit two screens.

## 7. Task list

- `RPT-003/T1` — One column at a reading measure, with the period, title and date on the page itself
- `RPT-003/T2` — Previous and next by period, skipping gaps, absent rather than disabled at the ends
- `RPT-003/T3` — A print stylesheet: black on white, repeating header, figures as tables, links with their targets
- `RPT-003/T4` — The phone layout is the default; only figures scroll horizontally, never the page
- `RPT-003/T5` — The locale fallback notice sits above the content
