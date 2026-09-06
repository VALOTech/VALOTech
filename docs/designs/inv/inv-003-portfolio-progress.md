---
code: INV-003
title: Portfolio progress
domain: inv
prd_refs: [INV-003, CMS-R03, SEC-R04, DATA-R05]
depends_on: [INV-001, SEC-002]
depended_by: []
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R03, SEC-R04, DATA-R05, I18N-R01, A11Y-R01, A11Y-R02]
status: design-ready
---

# `INV-003` — Portfolio progress

## 1. Purpose and PRD refs

Where each of the six products stands, right now. Realizes `INV-003`.

It is the thing an investor opens the room to check when they have no time to
read, and it is the one surface here that is a **state rather than a history**.
The update stream says what happened; this says where things are. An investor
asked to reconstruct the second from the first is being asked to do the company's
work.

## 2. Layer walkthrough

**Down.** One row per product in `portfolio` — stage, headline, updated. Six
rows, forever. No revisions, because the current state is the whole content and
its history is the audit trail.

**Up.** Six entries, each a product, its stage, one line, and when it last
changed. Ordered by the ecosystem's own order, not by recency — a board that
reorders itself cannot be scanned twice.

## 3. Contracts

### The row

| Column | Notes |
|---|---|
| `product` | One of the six, constrained. Not free text: a seventh product is a schema change and a conversation |
| `stage` | A closed vocabulary, below |
| `headline` | One line, at most 140 characters, in the authored language |
| `updated_at`, `updated_by` | Shown to the reader, because a board with no date is a board nobody believes |

### The stages

`building` · `in private use` · `in market` · `paused`

Closed, ordered, and constrained in the database. Four words, chosen so that
every one of them is a thing an investor can act on: three of them are progress
and `paused` is the one nobody wants to write, which is exactly why it must
exist. A board that cannot say a product is paused is a board that says nothing
when one is.

There is no percentage and no traffic light. A number invented to look like
measurement is worse than a word that is true.

### Editing

    PUT /admin/portfolio/<product>   { stage, headline }

Admin only, one product at a time. Every change writes `portfolio.change` to the
audit with the previous stage and headline (`SEC-R04`), which is how the board's
history exists without a revision table: the audit trail already records
before-and-after for privileged writes, and this is one.

Changing a stage prompts — not blocks — the author to write a `progress` update
about it (`POST-001`), because a board that moves silently is a board an investor
has to poll. The prompt is a link with the product and the new stage prefilled,
and it can be declined.

### Audience

The board is `investor`. The public page's own portfolio chapter is `#ecosystem`,
which is gated (`INV-002`) and is prose rather than state — the two say related
things at different resolutions, and the board is the one that is kept current.

### Rendering

Six entries, always all six, including a paused one. A product omitted because
its row is missing reads as a product that no longer exists, so the read fills
absent rows with `building` and a null headline rather than dropping them, and
the admin surface shows the gap.

Stage is a word, not a colour alone: colour carries it for the sighted and the
word carries it for everyone (`A11Y-R02`).

## 4. Integration

**`INV-001`** places the board second on the landing surface. **`SEC-002`**
records every change and is the board's history. **`RPT-001`** shows the current
values beside the report section that narrates them, so a report and the board
cannot quietly disagree. **`POST-001`** offers the prefilled update.

## 5. Cross-cutting compliance

- **`CMS-R03`** — the board's audience is a query predicate like everything
  else, even though it is a fixed six rows.
- **`SEC-R04`** — every change audited with before and after.
- **`DATA-R05`** — the read takes the reader.
- **`I18N-R01`** — stage names and labels from the dictionary; the headline is
  content and follows `CMS-005`'s fallback.
- **`A11Y-R01`**, **`A11Y-R02`** — the board is a list, each entry named, and
  the stage is readable without colour.

## 6. Open questions and trade-offs

- **No metrics on the board.** Revenue, users, runway — an investor wants them
  and this shows none. That is the owner's decision to make and not a layout's:
  publishing a number commits the company to publishing it every period, and the
  period where it goes the wrong way is the one that matters. `RPT-001`'s figure
  blocks are where numbers live, deliberately inside a document with context.
- **A headline rather than a paragraph.** 140 characters forces the sentence to
  be the point. The cost is that nuance goes into the report instead, which is
  where a reader with time already is.
- **Six products, hardcoded.** A seventh means a migration and a decision entry.
  That friction is intentional: the six are the ecosystem, and a board that grows
  by an admin typing a name is a board that will contain a project.

## 7. Task list

- `INV-003/T1` — Six rows, a constrained product and a closed four-word stage vocabulary
- `INV-003/T2` — Editing one product at a time, audited with the previous stage and headline
- `INV-003/T3` — A changed stage offers a prefilled progress update, and can be declined
- `INV-003/T4` — All six always render, including paused, with an absent row filled rather than dropped
- `INV-003/T5` — Stage is carried by a word as well as by colour, and the board states when it last changed
