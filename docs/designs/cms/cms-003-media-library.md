---
code: CMS-003
title: Media library
domain: cms
prd_refs: [CMS-003, CMS-R06, SEC-R01, DATA-R02]
depends_on: [CMS-001, SEC-001]
depended_by: [CMS-002, RPT-001, POST-001, DECK-001]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R06, SEC-R01, DATA-R02, A11Y-R02]
status: design-ready
---

# `CMS-003` — Media library

## 1. Purpose and PRD refs

The images content references: uploaded once, re-used, and readable only by
somebody who may read something that references them. Realizes `CMS-003` and
carries `CMS-R06`.

The rule that shapes the whole design is the last clause. **An investor-only
screenshot must not be readable by anyone who has its URL** — and a URL is
guessable, forwardable, and cached by every intermediary that ever sees it. A
media store that is public because "the filenames are random" is a store whose
access control is a hope.

## 2. Layer walkthrough

**Down.** Bytes go in a `media` row keyed by their own SHA-256, so the same file
uploaded twice is one row. A `media_refs` row ties a file to the item that uses
it, and that link is the only thing an access check reads.

**Up.** The route that serves a file resolves the reader, joins to the items
referencing it, and applies `CMS-006`'s predicate. No match is a `404`.

## 3. Contracts

### Upload

    POST /admin/media    multipart, one file

1. Read the bytes. **Sniff the type from the bytes**, never from the filename
   and never from the declared content type — both are supplied by whoever is
   uploading (`SEC-001`).
2. Accept only `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` and
   `application/pdf`. Anything else is refused by type, not by extension.
3. **Re-encode raster images.** A PNG in is a PNG out, produced by the encoder,
   which strips EXIF — including the GPS coordinates of wherever the screenshot
   was taken (`DATA-R02`) — and drops anything a decoder would have treated as
   payload.
4. **SVG is sanitised or refused.** An SVG is a document that can carry script
   and external references; it is parsed, stripped to shape and text elements,
   and refused if anything survives that should not. If that turns out to be
   fragile in practice, the honest move is to stop accepting SVG rather than to
   trust the sanitiser.
5. Cap at 10 MB, stated in the control before the file is chosen.
6. Store under `sha256`; a duplicate returns the existing row.

### Serving

    GET /media/<id>

    visible(media, reader) :=
      EXISTS ( SELECT 1 FROM media_refs r JOIN content_items i ON i.id = r.item_id
                WHERE r.media_id = media.id AND <CMS-006 predicate for reader> )
      OR media.uploaded_by = reader.id

The second clause is what lets an admin see a file they have just uploaded and
not yet placed in anything. It is deliberately the uploader and not "any admin",
so an unplaced file is not a quiet shared drop.

Responses carry `Content-Type` from the **stored** type, `X-Content-Type-Options:
nosniff`, and `Content-Disposition: inline` with a sanitised filename.

**Caching follows the audience.** A `public` item's media is cacheable; anything
else is `private, no-store`. A gated image behind a CDN cache is a gated image
served by the CDN to the next person who asks.

### Deleting

Refused while any `media_refs` row exists. The admin is shown which items use it.
A file with no references can be deleted, and the deletion is audited
(`media.delete`) because it can break a published document if the reference
count was wrong.

### Alternative text

Not stored on the media row. It lives on the `image` block (`CMS-002`), because
the same picture means different things in different documents and a single
stored description would be right in one of them.

## 4. Integration

**`CMS-001`** owns `media_refs` through the block that names a `media_id`.
**`CMS-006`** supplies the predicate the serving route composes — the same one,
not a copy. **`SEC-001`** owns the upload validation rules this design applies.
**`CMS-002`** is the surface that uploads and picks.

## 5. Cross-cutting compliance

- **`CMS-R06`** — media inherits the audience of what references it, by join.
- **`SEC-R01`** — the check is at the server, on every request, including the
  ones a CDN would otherwise answer.
- **`DATA-R02`** — EXIF, and the location in it, does not survive upload.
- **`A11Y-R02`** — the description lives with the use, and `CMS-002` requires
  it.

## 6. Open questions and trade-offs

- **Bytes in PostgreSQL** rather than an object store. Argued in `DATA-001` §6:
  one backup, one access rule, no second credential. It becomes wrong at a few
  hundred megabytes or the first video.
- **No derivatives.** One stored size, served as uploaded. A responsive image
  set would cut bytes on a phone; it is not built because the volume is a few
  dozen images and generating variants is a pipeline with its own failure
  modes. The upload control states a sensible maximum width instead.
- **Accepting SVG at all is a judgement call.** It is the right format for a
  logo and it is the format most likely to carry something unpleasant. The
  position here is to sanitise and to be willing to drop support entirely rather
  than to keep patching a sanitiser.

## 7. Task list

- `CMS-003/T1` — Upload sniffs the type from the bytes, and refuses anything outside the accepted set
- `CMS-003/T2` — Raster images are re-encoded, so EXIF and its location do not survive
- `CMS-003/T3` — SVG is parsed and stripped to shape and text, or refused
- `CMS-003/T4` — Storage keyed by content hash, so a duplicate upload is one row
- `CMS-003/T5` — Serving joins through references and composes the audience predicate, answering `404` on no match
- `CMS-003/T6` — Cache headers follow the audience; nothing gated is cacheable
- `CMS-003/T7` — Deletion is refused while a reference exists, and is audited when it is not
