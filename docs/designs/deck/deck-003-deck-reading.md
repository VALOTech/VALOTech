---
code: DECK-003
title: Deck reading
domain: deck
prd_refs: [DECK-003, CMS-R05, A11Y-R01, A11Y-R03]
depends_on: [CMS-005, DECK-002]
depended_by: []
layers_touched: [frontend, ui]
cross_cutting_rules: [CMS-R05, I18N-R01, I18N-R04, A11Y-R01, A11Y-R02, A11Y-R03, SCENE-R04]
status: design-ready
---

# `DECK-003` — Deck reading

## 1. Purpose and PRD refs

The investor's view of a deck. Realizes `DECK-003`.

A deck is the one document here that is read in two incompatible ways: alone, on
a phone, scrolling; and together, on a screen, section by section, while somebody
talks. This design serves the first and does not pretend to serve the second —
a presentation mode is `DECK-001`'s speaker context plus a browser's full screen,
and building a slide runtime would be building the thing `DECK-001` explicitly
decided a deck is not.

## 2. Layer walkthrough

**Down.** Nothing. It renders the resolved version's blocks, with the speaker
context already stripped by the repository function rather than by this view.

**Up.** One column, sections separated, a contents list that follows the reader,
and the version stated on the page.

## 3. Contracts

### The page

| Element | Notes |
|---|---|
| Title and version | The version number and its publication date, on the page and not only in chrome |
| Change notice | Once, when an unpinned reader's version has moved since their last visit (`DECK-002`) |
| Contents | Section headings, marking the current one, and jumping without a reload |
| Body | Sections in order, one column at the reading measure |
| Locale notice | Only when falling back (`CMS-005`) |

### The contents list

It marks the current section by **reading position**, not by an intersection
threshold. A flick of the wheel that carries several sections past in one frame
crosses no threshold, and a contents list that then points at where the reader
used to be is worse than none — this is the same defect `A11Y-001/T4` fixed on
the gateway, and it is recorded here because it is the kind that comes back.

On a phone the contents collapse to a control rather than occupying the column.

### Sequence

Sections are separated by space and a rule, not by pagination. A "next section"
control exists for keyboard and for reading on a screen at a distance, and it
moves the reading position rather than loading anything.

There is deliberately **no forced pagination**: a reader on a phone scrolls, and
a document that makes them tap forty times is a document they stop reading.

### Print

Black on white, sections beginning on a new page, the version and date in a
repeating header, figures as tables, links with their targets. Same rules as
`RPT-003`, and the same stylesheet where they are the same — a second print
stylesheet that drifts from the first is two documents to keep true.

### The scene

None, as in the rest of the room.

## 4. Integration

**`DECK-002`** resolves which version this reader gets and supplies the change
notice. **`CMS-005`** resolves the locale. **`CMS-006`** decided this reader may
be here. **`INV-001`** is the chrome.

## 5. Cross-cutting compliance

- **`CMS-R05`** — no machine draft reaches this view.
- **`I18N-R01`**, **`I18N-R04`** — chrome translated; fallback announced.
- **`A11Y-R01`** — every control operable by keyboard, including the contents
  and the next-section control.
- **`A11Y-R02`** — images carry their descriptions.
- **`A11Y-R03`** — contrast on the ground this renders on.
- **`SCENE-R04`** — nothing moves.

## 6. Open questions and trade-offs

- **No presentation mode.** A full-screen, one-section-at-a-time view with the
  speaker context on a second screen is what a presenter wants. It is a
  different application, and the person presenting is an admin who can read
  their context from the overview. If the company presents this deck often
  enough for that to hurt, it is worth building then, as its own code.
- **No download.** Print-to-PDF gives the investor a file. An explicit download
  would be a second rendering path, and a PDF that leaves the room takes its
  audience rule with it — which is to say it does not.

## 7. Task list

- `DECK-003/T1` — One column with sections in order, the version and date on the page
- `DECK-003/T2` — A contents list that marks the current section by reading position, not by a threshold
- `DECK-003/T3` — A next-section control that moves the reading position and nothing else
- `DECK-003/T4` — The change notice for an unpinned reader whose version moved
- `DECK-003/T5` — The print stylesheet shared with `RPT-003` where the rules are the same
