---
code: CMS-007
title: Search and filter in the room
domain: cms
prd_refs: [CMS-007, CMS-R03, DATA-R05]
depends_on: [CMS-001, CMS-006]
depended_by: [INV-001]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R03, DATA-R05, I18N-R01, A11Y-R01, A11Y-R02]
status: design-ready
---

# `CMS-007` — Search and filter in the room

## 1. Purpose and PRD refs

Finding one thing in a room that has been accumulating for two years. Realizes
`CMS-007`.

It is filed after the audience rule and depends on it directly, because search is
the classic way a gated document leaks. An index built outside the access model
answers with a title and a first sentence to somebody who may not read the
document — and it does so quietly, in a feature nobody thinks of as a boundary.

## 2. Layer walkthrough

**Down.** A generated `tsvector` column on `content_revisions`, over the
flattened text of the blocks. PostgreSQL's own full-text search; no second
service, no index to keep in step, no second copy of the content to secure.

**Up.** One field and three filters — kind, product, period — above the stream.
Results are the same components the stream uses, so a search result and a stream
entry are the same object seen through the same lens.

## 3. Contracts

### The index

    ALTER TABLE content_revisions
      ADD COLUMN search tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', blocks_text(blocks))) STORED;

`blocks_text` flattens the block array to its text: headings, paragraph text,
list items, quotes, captions and alternative text. It is a function of the same
`blocks` column, **generated**, so the index cannot drift from the content — the
usual failure, where a document is edited and the index still answers about the
previous version, is not expressible here.

`'simple'` rather than `'english'`: the content is in twenty possible languages
and a stemmer for the wrong one is worse than none. Matching is prefix-based on
the query terms, which is what a person typing three letters of a product name
actually wants.

### The query

    SELECT ... FROM content_items i
      JOIN content_revisions r ON r.id = i.current_revision_id
     WHERE <CMS-006 predicate for reader>
       AND r.search @@ websearch_to_tsquery('simple', $q)

**The predicate is first and it is the same function `CMS-006` exports.** Not a
copy, not a similar clause — the same one, so a change to the access rule reaches
search in the same commit. A gate refuses SQL naming `content_items` outside the
repository module (`CMS-006/T5`), and this query lives inside it for that reason.

Searching **only** the published revision, through `current_revision_id`. A draft
is not findable, including by its author through this route — the author finds
their draft in the admin console where drafts are listed.

### Filters

| Filter | Values | Notes |
|---|---|---|
| Kind | announcement · achievement · progress | `update` items only |
| Product | the six | Derived from a `product` tag on the item |
| Period | a quarter | `report` items only |
| Type | report · update · deck | |

Filters compose with each other and with the text query, and every combination is
one SQL statement. A filter that is applied after the fetch would page wrongly —
the second page of a filtered list would be the second page of the unfiltered
one with some rows missing, which reads as content that vanished.

### Empty results

An empty result says which of the query and the filters produced it, and offers
to drop the narrowest one. "No results" alone is indistinguishable from a broken
search, and an investor who concludes the room is broken does not ask.

### Locale

The search runs against the **authored** text, not the locale variants, so a
reader searching in Vietnamese for an English-authored report finds it by the
product name and the numbers rather than by prose. That is a stated limitation
rather than a silent one: the field's placeholder says what it searches.

## 4. Integration

**`CMS-006`** provides the predicate. **`CMS-001`** provides the blocks and the
pointer. **`INV-001`** is the surface this appears on. **`DATA-001`** carries the
generated column and its index.

## 5. Cross-cutting compliance

- **`CMS-R03`** — the audience predicate is the first clause of the query.
- **`DATA-R05`** — the reader is an argument, as everywhere else.
- **`A11Y-R01`**, **`A11Y-R02`** — the field is labelled, the filters are
  operable by keyboard, and the result count is announced to a screen reader
  rather than only rendered.
- **`I18N-R01`** — every label and the empty state from the dictionary.

## 6. Open questions and trade-offs

- **PostgreSQL rather than a search service.** A dedicated engine gives better
  ranking, fuzzy matching and highlighting. It also gives a second store holding
  a copy of gated content, with its own access model to get right, for a corpus
  measured in hundreds of documents. The trade is not close at this size.
- **Searching only the authored text.** Indexing every locale would multiply the
  index by twenty and would search text a reader may not be shown, which then has
  to be filtered by locale state as well as by audience — two predicates where
  one is already the dangerous one. Revisit when the room is genuinely
  multilingual in its content rather than in its chrome.
- **No ranking beyond the default.** Results are ordered by recency, not by
  relevance score, because in a room of updates the newest match is nearly
  always the wanted one and a relevance order that puts a 2024 note first reads
  as wrong.

## 7. Task list

- `CMS-007/T1` — A generated `tsvector` over flattened block text, so the index cannot drift from the content
- `CMS-007/T2` — The search query composes `CMS-006`'s predicate as its first clause, and lives in the repository module
- `CMS-007/T3` — Kind, product, period and type filters, composing into one statement
- `CMS-007/T4` — Only the published revision is findable; a draft is not, including by its author
- `CMS-007/T5` — The empty state names what narrowed the result and offers to widen it
- `CMS-007/T6` — The field is labelled, keyboard-operable, and announces its result count
