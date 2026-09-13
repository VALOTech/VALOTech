---
code: POST-001
title: Update authoring
domain: post
prd_refs: [POST-001, CMS-R04]
depends_on: [CMS-002, CMS-003]
depended_by: [POST-002]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R01, CMS-R04, SEC-R04, I18N-R01, A11Y-R02]
status: implemented
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

**Down.** A `content_items` row with `type = 'update'`, a `kind`, and an
optional `product`. One revision, usually one paragraph. No new tables: `kind`
was already there and `product` is a column beside it, held to the six plus the
company and, by a table constraint, to updates alone — the same shape `kind`
has, because it answers the same sort of question about the same sort of row.

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

    POST /admin/updates/compose    { kind, product?, title, blocks }

The composer is served at `/admin/updates` and posts to `/admin/updates/compose`,
because one path in the App Router is either a page or a handler and never
both. It is the split the item surfaces already make — `/admin/content/new`
is the form and `/admin/content/create` is what it posts to.

- Opens with the cursor in the body. The title is derived from the first line
  until the author edits it separately — a required title field before any
  writing is where a short update goes to die.
- The body is plain text and becomes a paragraph per blank-line run, which is
  `CMS-002`'s own paste rule rather than a second one. The full block vocabulary
  is one navigation on, in the editor: an update that wants an image or a figure
  goes there and gets `CMS-002`'s controls, and an update that is two sentences
  never sees them. Putting them on this screen would be the wall of controls the
  surface exists to avoid.
- Publish is one control, and it goes through `CMS-004` like everything else —
  the same preview, the same audit, the same withdraw.

### Length

Nothing enforces one. A soft marker at around 200 words says an update this long
is probably a report section, with a control that moves it into the current draft
report — because the honest answer to "this got long" is usually not "make it
shorter".

    POST /admin/updates/to-report    { blocks }

The request carries the words and **no destination**. `RPT-001`'s own read picks
the report — the greatest period holding an unpublished revision — because a
route that took an item id would let an admin append text to any item in the
room through a surface whose purpose is one. It appends and never replaces, it
publishes nothing, and it answers `409` when no report is being drafted, which
is an ordinary state the composer says plainly rather than a failure.

Appending changes the report's words, so `CMS-005` drops that draft's
translations — the same rule a save obeys. The count comes back and both the
control and the answer say it, because the person who reviewed those locales is
rarely the person moving the text.

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
- **`I18N-R01`** — governs what a *visitor* reads. The composer is console
  chrome and is English, the exception `ADMIN-002/T5` states and the reason it
  gives: both admins read English, and a translated console is twenty catalogues
  maintained for two people. What an investor eventually reads of an update is
  the update's own words, which `CMS-005` translates like any other content.

## 6. Open questions and trade-offs

- **Three kinds and no more.** A fourth would be added the first time something
  does not fit, and then a fifth, and the filter stops meaning anything. The
  discipline is that an update that fits none of the three is probably a report
  section or a deck slide.
- **No scheduling and no drafts folder.** An update is written and published in
  one sitting. Drafts exist because `CMS-001` gives them for free, and they are
  not surfaced as a workflow — a drafts folder is where updates go to be
  forgotten.
- **The cursor is in the body and the kind is still chosen first.** Those two
  read as a contradiction and are resolved by placement rather than by force:
  the kinds sit above the body, nothing is preselected, and the file control
  refuses without one. Disabling the body until a kind is picked would honour
  the second sentence and break the first, and the first is the one that
  decides whether anybody writes anything.
- **Two features are read here and neither is a `depends_on`, for two different
  reasons.** `depends_on` computes build order, and this was built before either
  mattered: `T1` to `T4` shipped with neither edge.
  
  `INV-003` cannot be declared at all. The composer shows the tagged product's
  standing (`T6`), which is that design's state, but `INV-003` depends on
  `INV-001`, which depends on `POST-002`, which depends on this — so the edge
  would close a cycle, and `§3.4` forbids one outside a declared bootstrap
  cluster.
  
  `RPT-001` could be declared and should not be. `T5` moves a long update into
  the report being drafted, which uses that design's module, but it is a thing
  one surface does to another at runtime rather than an order they had to be
  built in — and declaring it moves three designs into a wave band the policy
  does not define, which is the graph saying plainly that the claim is wrong.
  Both relationships are written in prose, here and in `INV-003` `§4`, where an
  operator asking what a change reaches will actually look.
- **The address is derived silently, and is the one thing here a reader keeps.**
  An author never sees it before it exists, which is the cost of not asking; the
  answer shows it, and the item page is where it can be reconsidered. A title
  with no Latin letters or digits in it yields no address at all, so such an
  update is filed under `update`, `update-2` and so on — honest, and poor
  enough to be worth saying out loud rather than discovering.

## 7. Task list

- `POST-001/T1` — A composer that opens with the cursor in the body and fits without scrolling
- `POST-001/T2` — Kind is required and chosen before writing; three kinds, no more
- `POST-001/T3` — An optional product tag from the six, plus the company
- `POST-001/T4` — The title derives from the first line until it is edited separately
- `POST-001/T5` — A soft length marker that offers to move the text into the current draft report
- `POST-001/T6` — The tagged product's current progress value is shown beside the composer
