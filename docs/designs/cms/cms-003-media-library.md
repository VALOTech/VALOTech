---
code: CMS-003
title: Media library
domain: cms
prd_refs: [CMS-003, CMS-R06, SEC-R01, DATA-R02]
depends_on: [CMS-001, SEC-001]
depended_by: [CMS-002, DECK-001, POST-001, RPT-001]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R06, SEC-R01, DATA-R02, A11Y-R02]
status: in-progress
inert_until:
  reason: A file can be uploaded, listed, deleted, and served under the audience of the item referencing it. Nothing yet writes that reference, so every stored file serves a 404 and the library reports every one of them as used by nothing.
  unblocks_when: CMS-001/T7
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

    POST /admin/media/upload    multipart, one file

The route is a path of its own rather than the segment's, because the segment
carries the page the control lives on and a segment holds one or the other. It
is the console's own shape: `ADMIN-001`'s invite route sits beside its form the
same way.

1. Read the bytes. **Sniff the type from the bytes**, never from the filename
   and never from the declared content type — both are supplied by whoever is
   uploading (`SEC-001`).
2. Accept only `image/png`, `image/jpeg` and `application/pdf`. Anything else is
   refused by type, not by extension — including WebP, for as long as no encoder
   here can rewrite one ([`CMS-DEC-06`](../../decisions-log.md#CMS-DEC-06)).
3. **Re-encode raster images** through `jimp` (`CMS-DEC-03`). A PNG in is a PNG
   out, produced by the encoder, which strips EXIF — including the GPS
   coordinates of wherever the screenshot was taken (`DATA-R02`) — and drops
   anything a decoder would have treated as payload. It happens **inside**
   `storeMedia`, before the bytes are hashed, so the stored file, the `sha256`
   it is keyed by and what a serve returns are one thing and no caller can
   reach around it. Bytes that sniffed as a raster and then will not decode are
   refused rather than stored unread.
4. **Strip a PDF's metadata** through `pdf-lib` (`CMS-DEC-05`), inside
   `storeMedia` and before the bytes are hashed, for the same reason step 3 is
   there. The Info dictionary is removed **whole** rather than blanked field by
   field — a dictionary that is gone cannot keep an entry nobody thought to name,
   so the author and producer the decision names go, and the creation and
   modification dates and any local path a design tool wrote into `/Producer` go
   with them. The XMP packet is removed from the catalogue **and from every
   page**, and each packet's stream object is deleted from the document rather
   than merely unlinked: an unlinked packet stays in the file, where a text
   extractor finds the city a photograph was taken in while every structural read
   reports it gone. **What this does not reach** is the metadata of images
   embedded inside the PDF, which `CMS-DEC-05` names as the depth the library
   affords rather than a promise; a PDF therefore leaks less than it did and not
   yet as little as a re-encoded raster (`DATA-R02`). A file that carries the
   header and will not parse is refused rather than stored unread.
5. **SVG is refused** (`CMS-DEC-03`). An SVG is a document that can carry script
   and external references, and there is no sanitiser here to trust: it is not an
   accepted type, so it is turned away like any other. A logo arrives as a raster.
   **WebP is refused too**, for the opposite reason — not what it can carry but
   what cannot be done to it: `jimp` decodes none, so accepting one would store
   the single format step 3 does not reach (`CMS-DEC-06`).
6. Cap at 10 MB, stated in the control before the file is chosen, and refused
   again on the server from the bytes that arrived rather than from a
   `Content-Length` the uploader also writes.
7. Store under `sha256`; a duplicate returns the existing row.

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

Refused while any `media_refs` row exists, and the refusal names the items by
their **titles**: the store refuses with ids, which is the right currency inside
a transaction and the wrong one for somebody deciding what they nearly broke. A
file with no references can be deleted, and the deletion is audited
(`media.delete`) because it can break a published document if the reference
count was wrong.

The act runs through the console's one destructive control (`ADMIN-002/T3`),
which asks for the subject's name typed because deleting a file is among the
three acts nothing undoes. The name it asks for is the file's **id**, since a
file here has no other: the store is keyed by the bytes, so two uploads of one
picture under different names are one row and no filename is kept. The typed
name is checked again at the route, because a posted body is whatever the caller
sent and the control holding Confirm off is a courtesy rather than the gate.

### The library, listed

An admin sees what is stored: the kind, the size, when it arrived, who brought
it, and how many items point at it. The last column is the one that decides
anything, because a file nothing points at can go and a file something points at
cannot. It is a staff read and composes no audience predicate — the question is
what the library holds, not what any one person may see — and only the console
reaches it.

**No thumbnail.** Showing the picture would be the better page, and it would
mean serving a file to an admin who neither uploaded it nor can reach an item
that references it — which is exactly the predicate above. Widening who may read
a stored file is not a layout decision, so the list says what a file is rather
than showing it, and the question stays open rather than answered by a page.

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
- **`DATA-R02`** — EXIF in a raster and metadata in a PDF, and the location in
  either, do not survive upload (`CMS-DEC-03`, `CMS-DEC-05`).
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
- **The library lists files rather than showing them.** A thumbnail would be the
  better page and it would mean serving a stored file to an admin who may reach no
  item that references it, which is `CMS-006`’s question about who may read one
  rather than a layout choice. The kind, the size, the date and the uploader
  distinguish a few dozen files; reopen with a staff-scoped serve path when they
  no longer do.
- **SVG is not accepted, and that was a judgement call** (`CMS-DEC-03`). It is
  the right format for a logo and the format most likely to carry something
  unpleasant, and for a few dozen admin uploads there is no sanitiser here worth
  trusting — so the honest move is the one this takes: refuse it, and let a logo
  arrive as PNG. Reopen for a sanitiser if a real SVG need arrives.

## 7. Task list

- `CMS-003/T1` — Upload sniffs the type from the bytes, and refuses anything outside the accepted set
- `CMS-003/T2` — Raster images are re-encoded, so EXIF and its location do not survive
- `CMS-003/T3` — SVG is refused rather than sanitised
- `CMS-003/T4` — Storage keyed by content hash, so a duplicate upload is one row
- `CMS-003/T5` — Serving joins through references and composes the audience predicate, answering `404` on no match
- `CMS-003/T6` — Cache headers follow the audience; nothing gated is cacheable
- `CMS-003/T7` — Deletion is refused while a reference exists, and is audited when it is not
- `CMS-003/T8` — An uploaded PDF's metadata is stripped before storage
- `CMS-003/T9` — The upload route and the admin control that posts to it, capped at 10 MB and refusing by sniffed type
- `CMS-003/T10` — The library lists what is stored, and deleting from it names the items using a file when it refuses
