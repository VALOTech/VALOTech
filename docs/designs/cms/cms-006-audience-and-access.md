---
code: CMS-006
title: Audience and access
domain: cms
prd_refs: [CMS-006, CMS-R03, CMS-R02, SEC-R01, DATA-R05]
depends_on: [CMS-001, AUTH-002]
depended_by: [CMS-007, POST-002, RPT-002, DECK-004, INV-001]
layers_touched: [data, domain, service, api]
cross_cutting_rules: [CMS-R02, CMS-R03, SEC-R01, DATA-R05, SEC-R04]
status: design-ready
---

# `CMS-006` — Audience and access

## 1. Purpose and PRD refs

Who may read which item, decided in the query that fetches it. Realizes
`CMS-006` and carries `CMS-R03`, `CMS-R02` and `SEC-R01`.

This is the single most dangerous design in the repository. Everything else here
fails visibly: a broken editor cannot save, a broken preview shows the wrong
thing to its author, a broken search returns nothing. **This one fails
invisibly** — a page renders, somebody reads it, and nobody learns that they
should not have. So it is one function, and every path goes through it.

## 2. Layer walkthrough

**Down.** One predicate builder turns a reader into a SQL `WHERE` clause. Every
content query composes it. There is no query in the codebase that selects from
`content_items` without it, and that is enforced rather than agreed.

**Up.** A reader who may not see an item gets a `404`, not a `403`. A `403` on a
specific slug confirms the item exists, which is the whole of what an attacker
was asking.

## 3. Contracts

### The four audiences

| `audience` | Who reads it |
|---|---|
| `public` | Anyone, signed in or not |
| `investor` | Any account whose role is `investor` or `admin` |
| `granted` | An account with a row in `content_grants` for this item, plus any admin |
| — (no published revision) | The author, and only through `forAuthor` |

`granted` exists for the case decks were built around: a deck shown to one
investor and not another. It is deliberately not the default, because a per-item
grant list that nobody maintains becomes a room where an investor sees nothing.

### The predicate

    visibleTo(reader) -> SQL fragment

    anonymous  ->  audience = 'public'
                   AND current_revision_id IS NOT NULL

    investor   ->  current_revision_id IS NOT NULL
                   AND ( audience IN ('public','investor')
                      OR ( audience = 'granted'
                           AND EXISTS (SELECT 1 FROM content_grants g
                                        WHERE g.item_id = content_items.id
                                          AND g.account_id = $reader) ) )

    admin      ->  TRUE      -- including unpublished, for the author surfaces

Three properties are load-bearing:

1. **`current_revision_id IS NOT NULL` is inside the predicate**, not a separate
   filter a caller may forget. A draft is not a low-audience item; it is an item
   with no audience at all (`CMS-R02`).
2. **The admin branch is `TRUE` and is therefore never used by a reader route.**
   Author surfaces call `forAuthor`; reader surfaces call `forReader`. The two
   are different functions so that "the admin sees everything" cannot leak into
   a path a non-admin also uses.
3. **The grant check is a subquery, not a join.** A join multiplies rows when an
   item has several grants, and the duplicate is usually noticed as a rendering
   bug and fixed with `DISTINCT` — which is how a filter comes to be applied
   after the fact instead of inside the predicate.

### Enforcement that a query cannot skip it

The repository layer exposes no raw table access. Content is reachable only
through functions that take a `Reader` and compose `visibleTo` themselves. A gate
in CI refuses any SQL string in the tree naming `content_items` outside that one
module — because the rule "always filter" is exactly the kind that holds for a
year and then does not, in a route written under time pressure at the end of a
day.

### Media

An image is visible to a reader who may read **some item that references it**
(`CMS-R06`). `CMS-003` owns the route; the predicate it composes is this one,
through `media_refs`. An unreferenced upload is visible to its uploader alone.

### Changing an audience

Narrowing an audience — `public` to `investor`, `investor` to `granted` — takes
effect immediately for new reads. It does **not** un-send what a reader already
has: a page they have open stays rendered, and a CDN may hold a copy of something
that was public. So public content is served with a short cache lifetime, and
narrowing writes `content.audience_change` to the audit so the window is
recorded rather than assumed away.

## 4. Integration

**`CMS-001`** provides the read functions this predicate lives inside.
**`AUTH-002`** supplies the reader. **`DECK-004`** is the admin surface over
`content_grants`. **`POST-002`** and **`RPT-002`** set an item's audience.
**`CMS-007`**'s search composes the same predicate — a search index that answers
from outside this rule is the classic way a gated document leaks its title and
its first sentence.

## 5. Cross-cutting compliance

- **`CMS-R03`** — the audience is a query predicate. There is no template filter.
- **`CMS-R02`** — a draft reaches nobody but its author, including by URL.
- **`SEC-R01`** — the gate is the server. Nothing here is presentational.
- **`DATA-R05`** — every read is scoped by the reader at the query.
- **`SEC-R04`** — a grant, a revocation and an audience change are audited.

## 6. Open questions and trade-offs

- **`404` rather than `403`.** It costs a signed-in investor a clear message
  when an admin genuinely has revoked their access, and they will ask why a link
  stopped working. The alternative confirms which slugs exist to anyone who
  guesses, and this room's slugs are things like `2026-q3` — guessable by design.
- **No time-limited access.** A grant that expires would suit a deck shown
  during a diligence window. It is not built because an expiry that nobody
  notices is an investor locked out mid-conversation, and revocation is already
  one action. File it if a diligence process actually asks.
- **The CI gate on raw SQL is a blunt instrument.** It will refuse a legitimate
  migration or an admin report that names the table. Those live in named files
  the gate exempts by path, and each exemption is a line somebody has to write
  and justify — which is the intended friction.

## 7. Task list

- `CMS-006/T1` — One predicate builder from a reader, with the published check inside it
- `CMS-006/T2` — Reader and author read paths as separate functions, so admin-sees-all cannot leak into a shared one
- `CMS-006/T3` — The grant subquery, and the admin surface that writes and revokes grants
- `CMS-006/T4` — A refusal is a `404`, and it is the same `404` for an item that does not exist
- `CMS-006/T5` — A CI gate refuses SQL naming `content_items` outside the repository module
- `CMS-006/T6` — Narrowing an audience is audited, and public content carries a short cache lifetime
