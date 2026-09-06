---
code: CMS-005
title: Locale variants and translation state
domain: cms
prd_refs: [CMS-005, CMS-R05, I18N-R02, I18N-R04]
depends_on: [CMS-001, I18N-001]
depended_by: [CMS-004, RPT-003, DECK-003]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R05, I18N-R01, I18N-R02, I18N-R04, I18N-R05]
status: design-ready
---

# `CMS-005` — Locale variants and translation state

## 1. Purpose and PRD refs

The same content in another language, and the state that says whether a person
has read it. Realizes `CMS-005` and carries `CMS-R05`.

`I18N-DEC-01` settles the question this design implements: a machine draft is
produced, is shown to nobody, and becomes servable only when an admin has read
that locale and marked it reviewed. Until then the reader gets the authored
language. The decision reconciles two principles that appeared to conflict —
`P-05`'s twenty languages and `I18N-R04`'s English fallback — by observing that a
machine draft is not a translation, so publishing one would breach the first
while showing the source language is exactly what the second describes.

## 2. Layer walkthrough

**Down.** A `content_locales` row per revision per locale, carrying the same
block array translated and a `state` of `machine` or `reviewed`. The serving
query filters on `state = 'reviewed'` — an indexed column, not an inference from
a null timestamp.

**Up.** A reader gets their locale when it is reviewed, and the authored language
otherwise, with a quiet line saying which language they are reading and why. An
admin sees a grid: twenty locales down, the item's revisions across, and every
cell one of three colours.

## 3. Contracts

### The three states

| State | Row exists | Served |
|---|---|---|
| not started | no | — |
| `machine` | yes | **never** |
| `reviewed` | yes | yes |

There is no fourth state and no partial one. A locale is either a person has read
it or it is not shown, because the failure this prevents is a machine sentence
that reads grammatically and lifelessly on the company's material — and no
mechanical check in this repository can tell the difference. The eleven locales
still open at `I18N-001/T4` exist for precisely that reason.

### Translating

    POST /admin/content/<id>/locales/<locale>/draft

Takes the revision's blocks, sends the **text of each block** for translation, and
writes the result back into the same block structure. The structure is never
translated — a `heading` stays a `heading`, an `image`'s `media_id` is untouched,
a paragraph's marks keep their offsets recomputed against the new text.

That last point is where this breaks if it is done casually: marks are offsets
over the source string (`CMS-001`), and a translation has different lengths. A
mark is carried by translating the marked span as a unit and reassembling, not by
translating the whole paragraph and guessing where the emphasis went.

The carrier is a self-hosted translation service or an admin pasting a draft in.
Which one is not settled here and does not need to be: the state machine is the
same either way, and no external general-purpose model is used in the product
(PRD §1.6 in `.claude/CLAUDE.md`).

### Reviewing

    POST /admin/content/<id>/locales/<locale>/review

Sets `state = 'reviewed'`, `reviewed_by`, `reviewed_at`. The admin screen shows
the source and the translation side by side and lets the text be edited before it
is marked. **Marking is a deliberate act on one locale.** There is no "mark all
reviewed" control, because that control's only function is to make the state
lie.

### Serving

    localeFor(revision, requested) ->
      reviewed row for `requested`
      or reviewed row for the requested language without its region
      or the authored language

An item in Traditional Chinese does not fall back to Simplified and vice versa;
they are separate locales here as they are in `I18N-001`, and treating one as a
fallback for the other is how a reader gets a script they cannot read.

The fallback is **announced**, once, in a line above the content: the reader is
told they are reading English because their language is not ready. Silently
serving a different language than the interface is in reads as a bug.

### Invalidation

Editing a published revision creates a new revision (`CMS-001`), and **a new
revision has no locale rows.** The translations do not carry forward, because a
translation of the previous text is a translation of something the reader is no
longer being shown. The admin grid makes that visible immediately: a new
revision starts with one language and nineteen empty cells.

This is expensive and it is correct. The alternative — carrying locales forward
and marking them stale — produces a state where a reviewed-but-stale row is
served, which is the exact failure `I18N-002`'s freshness check exists to catch
on the gateway.

## 4. Integration

**`CMS-001`** owns the blocks these rows mirror. **`I18N-001`** owns the locale
list, the twenty codes, and the interface strings around the content.
**`CMS-004`** reads the counts to show in the publish confirmation.
**`RPT-003`** and **`DECK-003`** are the reading views that call `localeFor`.

## 5. Cross-cutting compliance

- **`CMS-R05`** — a `machine` row is never served.
- **`I18N-R02`** — twenty locales, and a served translation is one a person
  authored or approved.
- **`I18N-R04`** — the fallback is the authored language, never a raw key, and
  it is announced.
- **`I18N-R05`** — typography follows the locale; RTL locales lay out
  accordingly, which the gateway already does.

## 6. Open questions and trade-offs

- **Are twenty locales right for the investor room at all?** The gateway needs
  them because a visitor arrives from anywhere. Investors are named people, and
  most of them read English or Vietnamese. This design supports twenty and
  requires none: an admin translates the locales their investors read and leaves
  the rest empty, which costs nothing. If the answer turns out to be always two,
  the grid is the thing that will have said so.
- **Translations do not survive a revision.** Stated above as correct; it is
  also the single biggest cost in this design, and it will be felt the first time
  a typo fix in English discards nineteen reviewed locales. The mitigation to
  build if that hurts is a per-block carry-forward — a block whose source text is
  byte-identical keeps its reviewed translation — and it is deliberately not
  built now, because it is only sound if block identity is stable and that is not
  yet proven.

## 7. Task list

- `CMS-005/T1` — Locale rows per revision, with a state a query filters on rather than infers
- `CMS-005/T2` — A `machine` row is never reachable by any reader path
- `CMS-005/T3` — Drafting translates block text and reassembles marks by span, never by offset arithmetic
- `CMS-005/T4` — The review screen shows source beside translation, editable, marked one locale at a time
- `CMS-005/T5` — Serving falls back to the authored language and says so to the reader
- `CMS-005/T6` — A new revision starts with no locale rows, and the grid shows it
