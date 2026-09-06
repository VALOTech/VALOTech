---
code: POST-002
title: Update publishing and audience
domain: post
prd_refs: [POST-002, CMS-R03, SEC-R01, DATA-R05]
depends_on: [POST-001, CMS-004, CMS-006]
depended_by: [INV-001, SITE-005]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R03, SEC-R01, DATA-R05, SEC-R04, I18N-R01, A11Y-R01]
status: design-ready
---

# `POST-002` — Update publishing and audience

## 1. Purpose and PRD refs

Who sees an update, and in what order. Realizes `POST-002`.

Updates are the one content type with a genuinely public audience, so this is
where the room's access model meets the public page. Getting it wrong in one
direction shows an investor-only note to the market; in the other it hides the
company's news from the people it was written for.

## 2. Layer walkthrough

**Down.** `audience` on the item, and `CMS-006`'s predicate on every read. The
stream is one query with a cursor, not a fetch-then-filter.

**Up.** Two surfaces read this: the room's stream (`INV-001`) and, for public
updates, the gateway (`SITE-005`). They are the same query with a different
reader.

## 3. Contracts

### The three audiences

| `audience` | Who | Where it appears |
|---|---|---|
| `public` | anyone | The gateway's news section and the room's stream |
| `investor` | investors and admins | The room's stream only |
| `granted` | named investors and admins | The room's stream, for those readers only |

`granted` is available and expected to be rare — an update about one investor's
own portfolio company, say. It exists because the mechanism is already there in
`CMS-006`, not because a use case demanded it.

### The stream

    GET /room/stream?kind=&product=&cursor=

    SELECT ... FROM content_items i
      JOIN content_revisions r ON r.id = i.current_revision_id
     WHERE i.type = 'update'
       AND <CMS-006 predicate for reader>
       AND (r.published_at, i.id) < ($cursorTime, $cursorId)
     ORDER BY r.published_at DESC, i.id DESC
     LIMIT 21

**Keyset pagination on `(published_at, id)`, not `OFFSET`.** With an offset, an
update published while the reader is on page one shifts every later page by one
and an entry is silently skipped — in a reverse-chronological feed that is the
most recent thing they had not read. The composite cursor also settles ties when
two updates share a second.

Twenty-one rows for a page of twenty: the twenty-first is how the surface knows
there is a next page without a second count query.

**Ordered by publication, not by creation.** An update drafted in March and
published in June belongs in June, where the reader will look for it.

### The gateway's news

`SITE-005` renders public updates on the public page. The same query with an
anonymous reader, which means the predicate reduces to `audience = 'public' AND
current_revision_id IS NOT NULL` — and that reduction happens inside `CMS-006`
rather than as a separate simpler query written for the public page. A second
query is a second place to forget the published check.

Public updates are cached briefly and the cache is purged on publish and on
withdraw (`CMS-004`).

### Narrowing an audience

`investor` to `granted`, or `public` to `investor`, takes effect on the next
read. It does not recall what has been served: a public update may sit in a CDN,
a search index or somebody's tab. The confirmation says so plainly, and the
change is audited (`content.audience_change`).

Widening — `investor` to `public` — carries a stronger confirmation, naming that
the update becomes readable by anyone including competitors and that it will be
indexed.

### Unread

The stream marks what has arrived since the reader's last visit, using the same
per-account read state `RPT-002` defines. It is the answer to the question the
room exists for — *what has happened since I last looked* — and it is why the
room's landing surface is this stream rather than a document.

## 4. Integration

**`POST-001`** authors. **`CMS-004`** publishes and withdraws, and purges the
public cache. **`CMS-006`** is the predicate — the same function for both
surfaces. **`INV-001`** is the room's stream. **`SITE-005`** is the public one.
**`CMS-007`** filters the same query.

## 5. Cross-cutting compliance

- **`CMS-R03`**, **`SEC-R01`**, **`DATA-R05`** — the audience is a predicate,
  at the server, taking the reader.
- **`SEC-R04`** — an audience change is a privileged write.
- **`A11Y-R01`** — the stream pages by a control, not by infinite scroll, which
  is unusable from a keyboard and unreachable at its end.
- **`I18N-R01`** — kind labels, dates and the empty state from the dictionary.

## 6. Open questions and trade-offs

- **Paging by a control rather than infinite scroll.** Infinite scroll reads
  better on a phone and makes the end of the list unreachable, breaks the back
  button, and cannot be operated from a keyboard. A "more" control is worse for
  one case and correct for the rest.
- **No per-update notification.** Deliberate, and it is the decision the room's
  whole shape rests on: an investor comes back and finds what is new, rather
  than being interrupted per item. `MAIL-001` covers the case where something
  genuinely should interrupt them, as an act somebody takes.

## 7. Task list

- `POST-002/T1` — Audience on the item, with the predicate from `CMS-006` on every read
- `POST-002/T2` — The stream pages by keyset on `(published_at, id)`, never by offset
- `POST-002/T3` — Ordered by publication rather than creation
- `POST-002/T4` — The gateway's public news is the same query with an anonymous reader
- `POST-002/T5` — Narrowing states what it cannot recall; widening states what becomes public
- `POST-002/T6` — Unread marking from the per-account read state, and a paging control rather than infinite scroll
