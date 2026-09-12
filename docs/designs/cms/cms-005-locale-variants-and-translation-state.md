---
code: CMS-005
title: Locale variants and translation state
domain: cms
prd_refs: [CMS-005, CMS-R05, I18N-R02, I18N-R04]
depends_on: [CMS-001, I18N-001]
depended_by: [CMS-004, DECK-003, RPT-003]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R05, I18N-R01, I18N-R02, I18N-R04, I18N-R05]
status: design-ready
---

# `CMS-005` — Locale variants and translation state

## 1. Purpose and PRD refs

The same content in another language, and the state that says whether a person
has read it. Realizes `CMS-005` and carries `CMS-R05`.

Two decisions settle what this design implements. `I18N-DEC-01` fixes what a
reader sees: a locale becomes servable only when an admin has reviewed it, and
until then the reader gets the authored language — reconciling `P-05`'s twenty
languages with `I18N-R04`'s fallback, because an unreviewed draft is not a
translation and showing the source language is exactly what the fallback
describes. `CMS-DEC-04` fixes what a draft is: the room runs no translation
service, so drafting **seeds** the target locale with the source blocks, marks
intact, and the admin writes the translation in the review screen. Nothing
machine-made is ever produced or served.

## 2. Layer walkthrough

**Down.** A `content_locales` row per revision per locale, carrying the same
block array translated and a `state` of `machine` or `reviewed`. The serving
query filters on `state = 'reviewed'` — a single column, not an inference from
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

There is no fourth state and no partial one: a locale is either reviewed by a
person or it is not shown. The pre-review row — `machine` in the schema, a name
the source seed outgrew (`CMS-DEC-04`) — holds the source blocks a human has not
yet translated, and serving it would claim a translation exists where none does.
The eleven locales still open at `I18N-001/T4` are the same caution on the
gateway.

### Translating

    POST /admin/content/<id>/locales/<locale>/draft

Seeds the locale: copies the revision's blocks into a new `content_locales` row
with their text and **marks intact** (`CMS-DEC-04`), so a `heading` stays a
`heading`, an `image`'s `media_id` is untouched, and a paragraph's marks keep
their offsets over the source text the reviewer is about to replace. The seed is
the source language under the target locale's label, in the pre-review state,
served to nobody.

The admin writes the translation in the review screen, editing the text within
each mark rather than re-deriving it. The span-by-span reassembly a programmatic
translator would need — translating a marked span as a unit so the emphasis lands
on the right words — is the self-hosted-service path `CMS-DEC-04` did not take;
under the seed-and-review path the human keeps the marks the seed carried and
changes only the words. No external general-purpose model is used in the product.

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
- `CMS-005/T3` — Drafting seeds the locale with the source blocks, marks intact, for the reviewer to translate
- `CMS-005/T4` — The review screen shows source beside translation, editable, marked one locale at a time
- `CMS-005/T5` — Serving falls back to the authored language and says so to the reader
- `CMS-005/T6` — A new revision starts with no locale rows, and the grid shows it
