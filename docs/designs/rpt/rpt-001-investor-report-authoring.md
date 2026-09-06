---
code: RPT-001
title: Investor report authoring
domain: rpt
prd_refs: [RPT-001, CMS-R01, CMS-R04]
depends_on: [CMS-002, CMS-003]
depended_by: [RPT-002]
layers_touched: [domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R01, CMS-R04, SEC-R04, I18N-R01, A11Y-R02]
status: design-ready
---

# `RPT-001` — Investor report authoring

## 1. Purpose and PRD refs

Composing the periodic report — the document an investor expects on a schedule
and files when it arrives. Realizes `RPT-001`.

This is the content type the owner named first, and it is the one with the
strongest shape: a report is *about a period*, it says the same kinds of things
every time, and its value to a reader comes from being comparable with the last
one. So this design is mostly about the parts that make two reports comparable,
and almost nothing about editing — that is `CMS-002`.

## 2. Layer walkthrough

**Down.** A `content_items` row with `type = 'report'` and a `period`. Its
revision's blocks are the body. Nothing here is a new table.

**Up.** A new report opens **prefilled from the previous period's structure** —
the same section headings, empty — because a report that arrives in a different
shape each time cannot be read as a series.

## 3. Contracts

### The period

`period` is `YYYY-Qn` or `YYYY-MM`, chosen when the report is created and not
editable afterwards. It is the report's identity: an investor asks for "the Q3
report", and a period that could be edited would let one document quietly become
another.

Creating a report for a period that already has one is refused, with a link to
the existing one (`RPT-002` holds the constraint).

### The suggested structure

A new report is created with these headings, in this order, each an empty
`heading` block an author can delete:

| Section | What belongs in it |
|---|---|
| The period in one paragraph | What an investor should take away if they read nothing else |
| Where each product stands | Six short entries; the same six every time |
| What shipped | Evidence, not intentions |
| Numbers | A `figure` block per metric, carrying the numbers as data |
| What we are working on next | |
| Asks | What the company wants from its investors this period, or that there is nothing |

It is a **starting point and not a template that must be followed**: the headings
are ordinary blocks and an author may delete or reorder any of them. What the
prefill buys is that the default is comparable with last time, which is the thing
authors do not do when starting from an empty page.

### Numbers

A metric goes in a `figure` block, which carries its numbers as data alongside its
caption (`CMS-001`). Two reasons: a screen reader can read the values rather than
skipping an image, and a later feature that charts a metric across periods has
something to read. A number that exists only inside a picture is a number the
next report cannot compare against.

### Carrying forward

    POST /admin/reports    { period }

Copies the **structure** of the previous period's published report — its heading
blocks, in order — and none of its text. Copying text would produce a report
that says last quarter's things until somebody notices, which is the failure this
is trying to avoid rather than one to introduce.

### Audience

A report defaults to `investor`. It can be set to `granted` for a report that
goes to some investors and not others, and to `public` deliberately — the
confirmation for making a report public says, in words, that it will be readable
by anyone including a competitor.

## 4. Integration

**`CMS-002`** is the editor. **`CMS-003`** holds the images and the charts.
**`CMS-004`** previews and publishes it. **`RPT-002`** owns the period constraint
and the archive. **`INV-003`**'s progress board is the state that the "where each
product stands" section narrates — the two should agree, and the authoring
surface shows the board's current values beside that section so a discrepancy is
visible while writing rather than after publishing.

## 5. Cross-cutting compliance

- **`CMS-R01`** — an edit after publication is a new revision.
- **`CMS-R04`** — blocks, from `CMS-002`'s vocabulary.
- **`SEC-R04`** — creation, publication and audience change are audited.
- **`A11Y-R02`** — a figure carries its numbers, so it is readable without
  seeing it.
- **`I18N-R01`** — every label from the dictionary; the report's own text is
  content and follows `CMS-005`.

## 6. Open questions and trade-offs

- **The structure is a suggestion, not a schema.** A schema would guarantee
  comparability and would make the report a form. Reports written to a form read
  like a form, and the thing an investor is buying is the sense that a person
  wrote it. The prefill is the compromise and it may prove too weak; the signal
  would be three consecutive reports with different section sets.
- **No automatic assembly from the update stream.** A report generated from the
  quarter's updates is an obvious idea and a bad one: an update is written for
  the day it happened, and a quarter read as a list of days is not an argument.

## 7. Task list

- `RPT-001/T1` — Create a report against a period, with the period fixed at creation
- `RPT-001/T2` — A new report is prefilled with the previous period's structure and none of its text
- `RPT-001/T3` — Metrics are `figure` blocks carrying their numbers as data
- `RPT-001/T4` — The progress board's current values are shown beside the section that narrates them
- `RPT-001/T5` — Making a report public states in words what that means
