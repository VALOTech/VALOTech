---
code: INV-001
title: Investor hall shell
domain: inv
prd_refs: [INV-001, SEC-R01, DATA-R05]
depends_on: [ADMIN-001, AUTH-002, CMS-006, CMS-007, POST-002, RPT-002]
depended_by: [INV-003]
layers_touched: [api, frontend, ui]
cross_cutting_rules: [SEC-R01, DATA-R05, I18N-R01, A11Y-R01, A11Y-R02, A11Y-R03]
status: in-progress
---

# `INV-001` — Investor hall shell

## 1. Purpose and PRD refs

What a signed-in investor lands on, and how they reach everything else. Realizes
`INV-001`.

The PRD settles the layout question before this design starts: **an investor
signs in to find out what has happened since they last looked**, so the landing
surface is the update stream and not the deck. A hall that opens on a document
they read a month ago has answered a question nobody asked.

## 2. Layer walkthrough

**Down.** No new storage. One route resolves the reader, asks for the stream's
first page, the current report, the progress board and the unread count, and
renders.

**Up.** One column, four things, in the order an investor wants them.

## 3. Contracts

### The landing surface

    GET /hall

| Order | What | Why here |
|---|---|---|
| 1 | **What is new** — the unread count and the stream's first page | The question they came with |
| 2 | **Where things stand** — the progress board (`INV-003`) | The answer when they have no time to read |
| 3 | **The current report** — period, title, whether they have read it | Expected on a schedule; one line, not the document |
| 4 | **Your decks** — what they have been granted | Read once, so it is present rather than prominent |

The hall's own chrome carries the mark, the locale control, the account control,
sign-out — and the search. Which filters the search offers belongs to `CMS-007`
and is named there rather than counted here: a number restated on this page is a
number that disagrees with its own feature the first time one is added.

**The field is on the chrome rather than on the landing**, because looking
something up is a thing an investor does from wherever they are, and a field
that sits on one page is one they navigate back to before they can use it. It is
a disclosure that opens on demand, so the control costs a line of the frame
rather than a block of the page, and it opens already showing what the reader
last asked for whenever the hall is narrowed.

### Who the reader is

The hall serves two people whose reasons for being here are opposite: somebody
who has already invested and comes to find out what has happened, and somebody
still deciding who comes to be convinced. `accounts.investor_type` says which
(`INV-DEC-02`), and the four blocks are the same four in a different order:

| | `current` | `prospect` | null |
|---|---|---|---|
| 1 | Since your last visit | Your decks | What is new |
| 2 | The stream | Where things stand | Where things stand |
| 3 | Where things stand | The current report | The current report |
| 4 | The current report | The stream | Your decks |
| 5 | Your decks | — | — |

**Null is not `prospect`.** An account nobody has classified gets the order the
table above this one sets, because a reader the company has not described is one
the hall should not be guessing about — and the guess that costs most is showing
the persuasion order to somebody who has already paid.

**The type orders the page and never gates it.** What a reader may read stays
entirely with `content_grants` and `audience` through `CMS-006`. A second thing
that could withhold a document would be a second access model, and the second one
is the one that goes stale when the rule changes; a reader set to the wrong type
sees an oddly ordered page and never a document that is not theirs.

**The gated gateway chapters** (`INV-002`) are reachable from here as a link back
to the public page, where they now render. They are not duplicated into the hall:
a chapter that exists in two places is a chapter that will disagree with itself.

### Nothing to show

Each of the four states its own absence in its own words. "No updates yet" under
a heading that says what updates are, rather than an empty area — a first-time
investor's hall is legitimately near-empty, and an empty area is
indistinguishable from a failed load (`A11Y` and the U-axis both).

An empty state and an error state are different renderings and never the same
one. A stream that failed to load says so and offers to retry; a stream with
nothing in it says the company has not posted yet.

### Navigation

Flat. `/hall`, `/hall/reports`, `/hall/decks`, `/hall/account`. Four
destinations, no nested menus, and the current one marked. A hall with four
places does not need a hierarchy, and a hierarchy imposed on four places makes
them harder to find.

### The chrome

The header is the gateway's header with the hall's links — the same mark, the
same type, the same ground (`brand/GUIDELINES.md`). An investor who signs in
should be somewhere continuous with the page they came from, and a differently
styled application behind a sign-in reads as a different company's product.

**No scene.** The world belongs to the argument. The hall is where somebody
works, and the ground is plain.

### Session

Every response is `no-store` (`AUTH-004`). An expired session on any hall route
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
- **`I18N-R01`** — the hall is translated like the gateway; the content inside
  it follows `CMS-005`.
- **`A11Y-R01`** — landmarks, a skip link, keyboard reach, visible focus.
- **`A11Y-R02`** — the unread count is announced, not only rendered as a dot.
- **`A11Y-R03`** — contrast on the hall's own ground.
- **Presentation** — the landing is scannable before it is read: what is new,
  where things stand and what is waiting are shown as distinct things rather
  than as a list of sentences ([`INV-DEC-01`](../../decisions-log.md#INV-DEC-01)).

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
- `INV-001/T4` — The hall's chrome is the gateway's, with no scene
- `INV-001/T5` — An expired session returns the reader to where they were going
- `INV-001/T6` — The landing's blocks are ordered by who the reader is, and an unclassified reader has an order of their own
