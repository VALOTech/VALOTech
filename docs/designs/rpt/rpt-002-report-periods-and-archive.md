---
code: RPT-002
title: Report periods and archive
domain: rpt
prd_refs: [RPT-002, CMS-R03, SEC-R04]
depends_on: [RPT-001, CMS-004, CMS-006]
depended_by: [RPT-003, INV-001]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R03, SEC-R04, DATA-R05, A11Y-R01, I18N-R01]
status: design-ready
---

# `RPT-002` — Report periods and archive

## 1. Purpose and PRD refs

One published report per period, and a way to walk backwards through them.
Realizes `RPT-002`.

The whole design turns on a single sentence: **"the Q3 report" must name one
document.** Everything below follows from making that true, and from making it
true in the database rather than in a convention that holds until two admins are
working on the same afternoon.

## 2. Layer walkthrough

**Down.** A partial unique index over `(type, period)` for published reports.
Partial, because drafts for the same period are legitimate — an author working on
a replacement should not be blocked by the one that is live.

**Up.** The current report is surfaced by the room; the rest are a list by
period, newest first, grouped by year. A period with no report shows as absent
rather than being omitted, because a gap an investor can see is information and a
gap they cannot see is a room that looks complete.

## 3. Contracts

### The constraint

    CREATE UNIQUE INDEX one_published_report_per_period
      ON content_items (type, period)
      WHERE type = 'report' AND current_revision_id IS NOT NULL;

Publishing a second report for a period fails at the database, and the surface
turns that failure into a sentence naming the report that already holds the
period and offering the two real choices: withdraw that one, or pick another
period.

**Replacing a published report is a revision of it**, not a second item
(`CMS-R01`). That is why the constraint is on the item and not on the revision:
a corrected Q3 report is still the Q3 report, and its earlier revision remains
readable to anyone reconstructing what was sent.

### The archive

    GET /room/reports            list, newest first, grouped by year
    GET /room/reports/<period>   one report

The list shows, per period: the period, the title, the publication date, and
whether the reader has read it. Periods between the first report and now with no
published report appear as an explicit gap.

Every query composes `CMS-006`'s predicate, so a report an investor may not read
is not in the list and its period appears as a gap rather than as a refusal —
which is the same answer they would get if it did not exist, deliberately.

### The current report

The room's landing surface (`INV-001`) shows the most recent published report the
reader may read, by period rather than by publication date. Those differ when a
late report is published after a newer one, and the period is what an investor
means by "the latest".

### Withdrawal

Withdrawing the published report for a period frees the constraint immediately.
The archive then shows that period as a gap, and the room's current report falls
back to the previous period. The confirmation says both of those things before it
happens, because "withdraw" is easy to read as "hide from the list" and it is
also "the room now presents a different document as current".

### Reading state

Whether a reader has opened a report is stored per account, and it is the one
piece of behavioural data this product keeps. It exists because "have I read
this" is the question an investor has in front of a list of twelve documents, and
for no other purpose: it is not reported to an admin, not aggregated, and deleted
with the account (`DATA-R03`).

## 4. Integration

**`RPT-001`** creates the item and fixes the period. **`CMS-004`** is what
publishes and withdraws; this design supplies the constraint it can fail on and
the sentence that failure becomes. **`CMS-006`** is the predicate every list
composes. **`RPT-003`** is the reading view. **`INV-001`** surfaces the current
report.

## 5. Cross-cutting compliance

- **`CMS-R03`** — the audience is in the query; a gap is what a refusal looks
  like.
- **`SEC-R04`** — publish and withdraw audited by `CMS-004`.
- **`DATA-R05`** — every list takes the reader.
- **`DATA-R03`** — the read-state rows go with the account.
- **`A11Y-R01`**, **`I18N-R01`** — the archive is a list, navigable by keyboard,
  with labels and period formats from the dictionary.

## 6. Open questions and trade-offs

- **Period format is fixed to quarters or months.** A report covering "the
  first half of 2026" cannot be filed. That is deliberate: a free-text period
  cannot be ordered, cannot be compared and cannot be constrained, and the
  ordering is what makes the archive an archive. If a half-year report is
  genuinely wanted, the answer is to add `YYYY-Hn` to the format rather than to
  make the field free.
- **Keeping a read state at all.** It is behavioural data about a named person
  and this product otherwise keeps none. It is kept because the alternative is a
  list of twelve documents with no way to tell which are new, and that is the
  problem the room exists to solve. It is stated in the privacy posture
  (`LEGAL-SG-001`) rather than left for someone to discover.

## 7. Task list

- `RPT-002/T1` — A partial unique index gives one published report per period, and drafts are exempt
- `RPT-002/T2` — Publishing into a taken period fails with the report that holds it and the two real choices
- `RPT-002/T3` — The archive lists by period, groups by year, and shows a period with no report as a gap
- `RPT-002/T4` — The room's current report is the most recent period the reader may read, not the most recent publication
- `RPT-002/T5` — Withdrawal states that the period becomes a gap and which report becomes current
- `RPT-002/T6` — A per-account read state, used only in the list, and deleted with the account
