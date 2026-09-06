---
code: POST-001
title: Update authoring
domain: post
prd_refs: [POST-001, CMS-R04]
depends_on: [CMS-002, CMS-003]
depended_by: [POST-002]
layers_touched: [domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R01, CMS-R04, SEC-R04, I18N-R01, A11Y-R02]
status: design-ready
---

# `POST-001` — Update authoring

## 1. Purpose and PRD refs

Writing a short update — the thing an investor comes back for. Realizes
`POST-001`.

Its whole design problem is the opposite of the report's. A report is long,
periodic and expected, so the work is in making it comparable. An update is
short, occasional and unscheduled, so the work is in **making it cheap enough
that it actually gets written.** An update surface that takes twenty minutes
produces a room with four entries a year, which is a room nobody signs in to.

## 2. Layer walkthrough

**Down.** A `content_items` row with `type = 'update'` and a `kind`. One
revision, usually one paragraph. No new tables.

**Up.** A composer that opens empty with the cursor in it, three kind buttons,
and a publish control. The whole surface fits without scrolling.

## 3. Contracts

### The three kinds

| Kind | What it is | What it is not |
|---|---|---|
| `announcement` | Something the company is telling investors: a hire, a partnership, a raise | Not a result |
| `achievement` | Something that happened, with evidence: a launch, a certification, a customer | Not a plan |
| `progress` | A number that moved, or a milestone reached on a product | Not news |

The kind is **required** and is chosen before writing, not after. Chosen first
because it changes what the author writes — an announcement that has to be
reclassified as progress is usually an announcement that was padding.

An investor scanning for one kind should not have to read the other two, which is
the reason the kind exists at all. It is a filter in `CMS-007` and a visible
marker in the stream.

### The product tag

Optional, one of the six, plus "the company". It is what lets an investor follow
one product, and it is what `RPT-001`'s "where each product stands" section is
assembled from by a person reading the quarter's updates.

### The composer

    POST /admin/updates    { kind, product?, title, blocks }

- Opens with the cursor in the body. The title is derived from the first line
  until the author edits it separately — a required title field before any
  writing is where a short update goes to die.
- The full block vocabulary is available, and the default is a paragraph. An
  update that wants an image or a figure gets `CMS-002`'s controls; an update
  that is two sentences never sees them.
- Publish is one control, and it goes through `CMS-004` like everything else —
  the same preview, the same audit, the same withdraw.

### Length

Nothing enforces one. A soft marker at around 200 words says an update this long
is probably a report section, with a control that moves it into the current draft
report — because the honest answer to "this got long" is usually not "make it
shorter".

### What publishing does not do

It does not mail anybody (`CMS-004`). An update that notifies on publish is an
update nobody dares to write, and `MAIL-001` is a deliberate separate act.

## 4. Integration

**`CMS-002`** is the editor. **`CMS-004`** previews, publishes and withdraws.
**`POST-002`** owns the audience and the stream ordering. **`RPT-001`** is where
a too-long update goes. **`INV-003`**'s progress board is the state a `progress`
update narrates; the composer shows the board's current value for the tagged
product so an update saying a number moved is written beside the number.

## 5. Cross-cutting compliance

- **`CMS-R01`**, **`CMS-R04`** — revisions and blocks, as everywhere.
- **`SEC-R04`** — publish and withdraw audited.
- **`A11Y-R02`** — an image still requires its description; brevity is not an
  exemption.
- **`I18N-R01`** — the composer's chrome from the dictionary.

## 6. Open questions and trade-offs

- **Three kinds and no more.** A fourth would be added the first time something
  does not fit, and then a fifth, and the filter stops meaning anything. The
  discipline is that an update that fits none of the three is probably a report
  section or a deck slide.
- **No scheduling and no drafts folder.** An update is written and published in
  one sitting. Drafts exist because `CMS-001` gives them for free, and they are
  not surfaced as a workflow — a drafts folder is where updates go to be
  forgotten.

## 7. Task list

- `POST-001/T1` — A composer that opens with the cursor in the body and fits without scrolling
- `POST-001/T2` — Kind is required and chosen before writing; three kinds, no more
- `POST-001/T3` — An optional product tag from the six, plus the company
- `POST-001/T4` — The title derives from the first line until it is edited separately
- `POST-001/T5` — A soft length marker that offers to move the text into the current draft report
- `POST-001/T6` — The tagged product's current progress value is shown beside the composer
