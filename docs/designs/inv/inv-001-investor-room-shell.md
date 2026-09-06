---
code: INV-001
title: Investor room shell
domain: inv
prd_refs: [INV-001, SEC-R01, DATA-R05]
depends_on: [AUTH-002, CMS-006, CMS-007, POST-002, RPT-002]
depended_by: [INV-003]
layers_touched: [api, frontend, ui]
cross_cutting_rules: [SEC-R01, DATA-R05, I18N-R01, A11Y-R01, A11Y-R02, A11Y-R03]
status: design-ready
---

# `INV-001` — Investor room shell

## 1. Purpose and PRD refs

What a signed-in investor lands on, and how they reach everything else. Realizes
`INV-001`.

The PRD settles the layout question before this design starts: **an investor
signs in to find out what has happened since they last looked**, so the landing
surface is the update stream and not the deck. A room that opens on a document
they read a month ago has answered a question nobody asked.

## 2. Layer walkthrough

**Down.** No new storage. One route resolves the reader, asks for the stream's
first page, the current report, the progress board and the unread count, and
renders.

**Up.** One column, four things, in the order an investor wants them.

## 3. Contracts

### The landing surface

    GET /room

| Order | What | Why here |
|---|---|---|
| 1 | **What is new** — the unread count and the stream's first page | The question they came with |
| 2 | **Where things stand** — the progress board (`INV-003`) | The answer when they have no time to read |
| 3 | **The current report** — period, title, whether they have read it | Expected on a schedule; one line, not the document |
| 4 | **Your decks** — what they have been granted | Read once, so it is present rather than prominent |

Below those, the search field and the two filters. Above them, the room's own
chrome: the mark, the locale control, the account control, sign-out.

**The gated gateway chapters** (`INV-002`) are reachable from here as a link back
to the public page, where they now render. They are not duplicated into the room:
a chapter that exists in two places is a chapter that will disagree with itself.

### Nothing to show

Each of the four states its own absence in its own words. "No updates yet" under
a heading that says what updates are, rather than an empty area — a first-time
investor's room is legitimately near-empty, and an empty area is
indistinguishable from a failed load (`A11Y` and the U-axis both).

An empty state and an error state are different renderings and never the same
one. A stream that failed to load says so and offers to retry; a stream with
nothing in it says the company has not posted yet.

### Navigation

Flat. `/room`, `/room/reports`, `/room/decks`, `/room/account`. Four
destinations, no nested menus, and the current one marked. A room with four
places does not need a hierarchy, and a hierarchy imposed on four places makes
them harder to find.

### The chrome

The header is the gateway's header with the room's links — the same mark, the
same type, the same ground (`brand/GUIDELINES.md`). An investor who signs in
should be somewhere continuous with the page they came from, and a differently
styled application behind a sign-in reads as a different company's product.

**No scene.** The world belongs to the argument. The room is where somebody
works, and the ground is plain.

### Session

Every response is `no-store` (`AUTH-004`). An expired session on any room route
redirects to sign-in with the destination remembered, and returns there
afterwards — an investor who followed a link from a report and was made to sign
in should land on the report.

## 4. Integration

**`AUTH-002`** resolves the reader and the role. **`POST-002`** supplies the
stream and the unread marking. **`RPT-002`** supplies the current report by
period. **`INV-003`** is the progress board. **`DECK-004`**'s grants are what
"your decks" lists. **`CMS-007`** is the search. **`INV-002`** is linked, not
inlined.

## 5. Cross-cutting compliance

- **`SEC-R01`** — every route here is behind the server-side gate.
- **`DATA-R05`** — each of the four reads takes the reader.
- **`I18N-R01`** — the room is translated like the gateway; the content inside
  it follows `CMS-005`.
- **`A11Y-R01`** — landmarks, a skip link, keyboard reach, visible focus.
- **`A11Y-R02`** — the unread count is announced, not only rendered as a dot.
- **`A11Y-R03`** — contrast on the room's own ground.

## 6. Open questions and trade-offs

- **The progress board above the report.** The report is the more formal
  document and a conventional layout would lead with it. The order here follows
  what the PRD says an investor is doing: catching up. The board is a state they
  can absorb in ten seconds; the report is twenty minutes they may not have now.
- **No dashboard, no charts on the landing surface.** A summary that
  aggregates across products is a fifth thing to keep true, and the progress
  board already is that summary. Adding a chart of anything would mean choosing
  a metric to be judged on, which is a decision for the owner and not a layout.

## 7. Task list

- `INV-001/T1` — The landing surface: what is new, where things stand, the current report, your decks
- `INV-001/T2` — Empty and error states are different renderings, each saying which it is
- `INV-001/T3` — Flat navigation over four destinations, with the current one marked
- `INV-001/T4` — The room's chrome is the gateway's, with no scene
- `INV-001/T5` — An expired session returns the reader to where they were going
