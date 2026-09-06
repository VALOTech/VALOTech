---
code: CMS-001
title: Content model and revisions
domain: cms
prd_refs: [CMS-001, CMS-R01, CMS-R04, DATA-R05]
depends_on: [AUTH-002, DATA-001]
depended_by: [CMS-002, CMS-003, CMS-004, CMS-005, CMS-006, CMS-007]
layers_touched: [data, domain, service]
cross_cutting_rules: [CMS-R01, CMS-R04, DATA-R05, SEC-R04]
status: design-ready
---

# `CMS-001` — Content model and revisions

## 1. Purpose and PRD refs

The one shape every piece of investor-facing writing takes, and the one way it
changes. Realizes `CMS-001` and carries `CMS-R01`.

Everything above this design — the editor, the media library, the preview, the
locale states, the audience rule, the search — is written once and used by
reports, updates and decks alike. That is the whole argument for this file
existing: **the three content types differ in how an investor reaches them and
not at all in how they are written**, and building three of anything below the
reading surface would give three revision histories, three locale states and
three implementations of the audience rule.

## 2. Layer walkthrough

**Down.** `content_items` names a thing; `content_revisions` holds every version
of its body; `content_items.current_revision_id` names the one a reader sees.
Publishing moves that pointer. Nothing is ever edited in place and nothing is
soft-deleted — the pointer is the state, and the archive is a side effect of
never overwriting.

**Up.** A reader asks for an item and gets the published revision in their
locale, or the authored language, or nothing at all — decided by `CMS-006` at
the query, never by the template. An author asks for an item and gets the
latest revision, published or not.

## 3. Contracts

### The item, the revision, the pointer

    content_items      id, type, slug, title, kind, period, audience,
                       current_revision_id, created_at, updated_at
    content_revisions  id, item_id, blocks, author_id, created_at, published_at

Three rules, and each of them is a defect this design exists to prevent:

1. **A revision is immutable once published.** An edit to published content
   inserts a new revision. What an investor read is still on disk, byte for byte.
2. **Publication is a pointer move**, so withdrawal is a pointer move back and
   costs nothing. There is no `is_published` boolean to disagree with reality.
3. **`current_revision_id` is the only thing a reader query consults.** Not
   `published_at`, not a status column. One source, so there is no state where
   two of them disagree and the reader sees the answer from the wrong one.

### Blocks

A revision's `blocks` is an ordered array. Each element is one of a **closed set**
of shapes:

| Block | Fields | Notes |
|---|---|---|
| `heading` | `level` (2 or 3), `text` | Level 1 is the item's title and is not a block |
| `paragraph` | `text`, `marks` | Marks are offsets and a type — never embedded markup |
| `list` | `ordered`, `items[]` | |
| `quote` | `text`, `attribution` | |
| `image` | `media_id`, `alt`, `caption` | `alt` is required; a block with no alternative text fails validation rather than shipping an unlabelled image (`A11Y-R02`) |
| `figure` | `media_id`, `caption`, `data[]` | A chart or a metric; `data` is the numbers so the same figure can be read by a screen reader |
| `divider` | — | |

**Closed, and validated on write.** An unknown block type is rejected at the
write, not skipped at the read: a renderer that skips what it does not understand
publishes a document with a hole in it and reports success (`CMS-R04`).

Marks are `{start, end, type}` over the paragraph's text, where type is `strong`,
`em`, `code` or `link`. Storing offsets rather than nested markup is what makes a
paragraph translatable as a string and renderable without an HTML parser, and it
is what keeps a form from being an injection surface.

### The write path

    saveDraft(itemId, blocks, authorId)   -> new revision, published_at null
    publish(itemId, revisionId, actorId)  -> validates, moves the pointer, audits
    withdraw(itemId, actorId)             -> moves the pointer to the previous
                                             published revision, or to null

`saveDraft` on an item with unpublished changes **replaces the open draft** rather
than accumulating one revision per keystroke. A revision is created per editing
session, not per save, and the boundary is the author leaving the editor. The
archive people care about is the published one.

### Reading

    forReader(itemId, reader)      -> the published revision, or null
    forAuthor(itemId, actor)       -> the latest revision, published or not

Every read function takes the reader as an argument (`DATA-R05`). There is no
function that returns content without one, so omitting the check is a type error
rather than a leak.

## 4. Integration

**`DATA-001`** declares the tables. **`AUTH-002`** supplies the reader whose role
these functions take. **`CMS-002`** is the editor that produces blocks and the
validator that rejects an unknown one. **`CMS-004`** owns `publish` and
`withdraw` and the audit rows they write. **`CMS-005`** attaches locale rows to a
revision. **`CMS-006`** is where `audience` becomes a query predicate.
**`RPT-001`**, **`POST-001`** and **`DECK-001`** are three authoring surfaces
over this one model.

## 5. Cross-cutting compliance

- **`CMS-R01`** — no in-place edit; the published revision survives.
- **`CMS-R04`** — structured blocks, closed set, validated on write.
- **`DATA-R05`** — every read takes the reader.
- **`SEC-R04`** — publish and withdraw are privileged writes and audited by
  `CMS-004`.
- **`A11Y-R02`** — an image block without alternative text does not validate.

## 6. Open questions and trade-offs

- **One revision per editing session, not per save.** An autosave-per-keystroke
  history would let an author recover a sentence they deleted five minutes ago.
  It is not built because it makes the revision table mostly noise, and the
  question the archive is actually asked — what was published, and when — is
  answered by the published revisions alone. The editor keeps unsaved state in
  the browser for the smaller case.
- **Blocks rather than Markdown.** Markdown is faster to build and is what most
  small systems use. It is rejected because a paragraph in Markdown is a string
  that must be re-parsed to be translated, re-parsed to be searched and
  re-parsed to be rendered — and every parser disagrees slightly, so a locale can
  drift from its source in a way nothing detects. Offsets over plain text make
  translation and search operate on the same object the renderer does.
- **No draft branching.** One open draft per item. Two people editing the same
  report at once is a problem this team does not have, and a merge UI is a
  substantial feature that would be built for nobody.

## 7. Task list

- `CMS-001/T1` — Items, revisions, and a published pointer that is the only thing a reader query consults
- `CMS-001/T2` — The closed block vocabulary and its validator, rejecting an unknown block on write
- `CMS-001/T3` — Marks as offsets over plain text, so a paragraph stays one translatable string
- `CMS-001/T4` — `saveDraft` replaces the open draft rather than accumulating a revision per save
- `CMS-001/T5` — `publish` and `withdraw` as pointer moves, with the previous revision intact
- `CMS-001/T6` — Every read function takes the reader; none exists that does not
