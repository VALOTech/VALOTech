/**
 * The media library's store (`CMS-003`): what a file's type is, how it is stored
 * once and reused, and when it may be deleted.
 *
 * Four things live here, and the upload and serve routes (`CMS-003` §3) compose
 * them. The type is sniffed from the bytes, never the filename or the declared
 * content type, because both are the uploader's to write (`SEC-001`). Storage is
 * keyed by the bytes' own SHA-256, so the same file uploaded twice is one row.
 * Serving answers who may read a file by the audience of what references it: the
 * reader sees it when they uploaded it, or when an item they may read points at
 * it, and that join composes `visibleTo` rather than restating an audience rule.
 * Deletion is refused while anything references the file, because `media_refs`
 * cascades from `media` — a file deleted out from under a published document
 * would take its references with it rather than be refused.
 *
 * Nothing is stored as it arrived. A raster is decoded and re-encoded through
 * `jimp` (`CMS-003/T2`, `CMS-DEC-03`) and a PDF has its metadata removed through
 * `pdf-lib` (`CMS-003/T8`, `CMS-DEC-05`), both inside `storeMedia` and before it
 * hashes anything, so what is stored is this module's own output and the EXIF, the
 * author, the producer and the local paths that came with the upload are in none
 * of it (`DATA-R02`). Both are inside the store rather than in front of it because
 * there is no upload route yet to put them in front of, and a guarantee that
 * depends on a caller arriving later and remembering is not one.
 *
 * SVG is not accepted at all (`CMS-003/T3`): `CMS-DEC-03` refused it rather than
 * trust a sanitiser, so an `<svg>` document sniffs to `null` and the upload turns
 * it away like any other unaccepted type. WebP is turned away for a different
 * reason and only until somebody decides otherwise — `jimp` cannot decode it, so
 * accepting it would store the one format whose metadata nothing here strips.
 * Which way that goes is `CMS-DEC-06`; refusing is the fail-closed answer this
 * ships in the meantime.
 */

import { createHash } from 'node:crypto';

import { Jimp } from 'jimp';
import { PDFDocument, PDFName, PDFRef } from 'pdf-lib';

import type { Actor } from '../auth/gate';
import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';

import { visibleTo } from './access';

/**
 * The types the library accepts, by what the bytes are and not what they are
 * called (`CMS-003` §3). Anything else is refused.
 */
export const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'application/pdf'] as const;

/**
 * The accepted types the encoder can produce, which is what makes them safe to
 * accept: a file of one of these is stored as `jimp`'s own output rather than as
 * the bytes somebody uploaded.
 */
const REENCODED_MIME = ['image/png', 'image/jpeg'] as const;

export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

/** Whether `bytes` begins with `signature`. */
function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * The accepted type of a file, sniffed from its bytes, or `null` when it is none
 * of them (`CMS-003/T1`). Each accepted type has a fixed signature at the front.
 */
export function sniffType(bytes: Uint8Array): AcceptedMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return 'application/pdf';
  }
  // SVG is refused rather than sanitised (`CMS-DEC-03`), and a WebP is refused
  // because no encoder here can rewrite it (`CMS-DEC-06`). Neither is an accepted
  // type, so both sniff to null and the upload turns them away like anything else.
  return null;
}

/** Where a stored file lives, and whether this call created it or found it. */
export interface StoredMedia {
  readonly id: string;
  readonly deduped: boolean;
}

/**
 * A file whose bytes the decoder could not read.
 *
 * It is a refusal and not a pass-through: bytes that sniffed as one of the
 * accepted types and then would not parse are not that file, and storing them
 * unread would store exactly the payload the scrub exists to drop.
 */
export class UndecodableImageError extends Error {
  readonly mime: string;

  constructor(mime: string) {
    super(`the bytes sniffed as ${mime} and could not be decoded`);
    this.name = 'UndecodableImageError';
    this.mime = mime;
  }
}

/**
 * A raster as the encoder writes it, which is the only form of it that is
 * stored (`CMS-003/T2`, `CMS-DEC-03`).
 *
 * Decoding to pixels and encoding again is what makes this work: EXIF, XMP, a
 * colour profile and any trailing bytes a decoder would have treated as payload
 * are all outside the pixels, so none of them survives being thrown away and
 * written fresh. A PNG in is a PNG out — the type is not converted, because an
 * admin who uploads a screenshot should get the format back that they chose.
 */
async function reencoded(bytes: Uint8Array, mime: AcceptedMime): Promise<Buffer> {
  try {
    const image = await Jimp.read(Buffer.from(bytes));

    return await image.getBuffer(mime as (typeof REENCODED_MIME)[number]);
  } catch {
    // The decoder's own message can carry the file's bytes, so it is not passed
    // on; what a caller needs is the type it claimed to be (`DATA-R02`).
    throw new UndecodableImageError(mime);
  }
}

/** The key a PDF hangs its XMP packet from, on the catalogue and on a page. */
const METADATA_KEY = PDFName.of('Metadata');

/**
 * A PDF with nothing about its author left in it (`CMS-003/T8`, `CMS-DEC-05`).
 *
 * Three things go, and each was measured rather than assumed. The **Info
 * dictionary** is removed whole rather than blanked field by field, because a
 * removed dictionary cannot keep an entry nobody thought to name — the author and
 * the producer the decision names, and with them the creation and modification
 * dates and any local path a design tool wrote into `/Producer`. The **XMP
 * packet** goes from the catalogue and from every page, since some tools write one
 * per page. And each packet's **stream object is deleted from the document**, not
 * merely unlinked: unlinking leaves the object orphaned and `pdf-lib` still writes
 * it out, so the city an image was shot in stays in the file where any text
 * extractor finds it while every structural read says it is gone. That is the
 * failure this function is shaped around.
 *
 * The file does not announce the tool that scrubbed it either, and that falls out
 * of removing the dictionary rather than being arranged: `pdf-lib` writes its own
 * `/Producer` and a fresh `/ModDate` into the Info dictionary at save, and there
 * is no longer one to write them into. Measured both ways — the bytes are
 * identical with and without the library's `updateMetadata` option, because the
 * dictionary is gone before it could apply.
 *
 * What it does not reach is the metadata of images embedded inside the PDF, which
 * `CMS-DEC-05` names as the depth the library affords rather than a promise.
 */
async function withoutMetadata(bytes: Uint8Array): Promise<Buffer> {
  // The whole scrub is the boundary, not the parse alone. `load` accepts a file
  // that carries the header and nothing a reader would call a document, and hands
  // back one with no catalogue at all; the failure then surfaces further down as a
  // raw `TypeError` about a property nobody named. Wrapping only the parse would
  // let that escape `storeMedia` as a crash instead of a refusal.
  try {
    const document = await PDFDocument.load(Buffer.from(bytes));

    const info: unknown = document.context.trailerInfo.Info;
    if (info instanceof PDFRef) {
      document.context.delete(info);
      delete document.context.trailerInfo.Info;
    }

    for (const holder of [document.catalog, ...document.getPages().map((page) => page.node)]) {
      const packet = holder.get(METADATA_KEY);
      holder.delete(METADATA_KEY);

      if (packet instanceof PDFRef) {
        document.context.delete(packet);
      }
    }

    return Buffer.from(await document.save());
  } catch {
    // The parser's own message quotes the bytes it choked on (`DATA-R02`), so what
    // is reported is the type the file claimed to be and nothing out of it.
    throw new UndecodableImageError('application/pdf');
  }
}

/** The bytes as this module writes them, which is the only form it stores. */
async function scrubbed(bytes: Uint8Array, mime: AcceptedMime): Promise<Buffer> {
  if ((REENCODED_MIME as readonly string[]).includes(mime)) {
    return reencoded(bytes, mime);
  }

  return withoutMetadata(bytes);
}

/**
 * Store bytes under their SHA-256, returning the row's id (`CMS-003/T4`). The
 * same bytes stored twice are one row: the insert yields to an existing `sha256`
 * rather than failing, so two uploads of one file racing each other settle on
 * the same row instead of one erroring. `deduped` tells the caller whether it
 * created the row, which the upload route reports as "already here".
 *
 * The bytes are scrubbed first and the hash is taken of what that produced, so
 * the stored file, the `sha256` it is keyed by and what a serve hands back are
 * one thing (`CMS-003/T2`, `CMS-003/T8`). Two uploads of one screenshot that
 * differ only in their EXIF therefore land on one row, and so do two of one
 * report that differ only in who exported it: after the scrub they are one file.
 */
export async function storeMedia(
  bytes: Uint8Array,
  mime: AcceptedMime,
  uploaderId: string,
): Promise<StoredMedia> {
  const buffer = await scrubbed(bytes, mime);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  const inserted = await getDb()
    .insertInto('media')
    .values({
      sha256,
      mime,
      byte_size: String(buffer.length),
      bytes: buffer,
      uploaded_by: uploaderId,
    })
    .onConflict((oc) => oc.column('sha256').doNothing())
    .returning('id')
    .executeTakeFirst();

  if (inserted !== undefined) {
    return { id: inserted.id, deduped: false };
  }

  // The insert found an existing row for these bytes and did nothing; read it.
  const existing = await getDb()
    .selectFrom('media')
    .select('id')
    .where('sha256', '=', sha256)
    .executeTakeFirstOrThrow();

  return { id: existing.id, deduped: true };
}

/** The bytes of a uuid, as a serve reads it straight from the URL. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The stored file a serve needs: its type, its bytes, and who uploaded it. */
export interface ServableMedia {
  readonly mime: string;
  readonly bytes: Buffer;
  readonly uploadedBy: string | null;
}

/**
 * The file at `mediaId`, or `null` when none is there — including when `mediaId`
 * is not a uuid at all (`CMS-003/T5`). The id reaches here straight from the URL
 * and `media.id` is a uuid column: a value that is not one would make the
 * comparison raise `invalid input syntax for type uuid` and answer `500`, where
 * the contract is the `404` that tells a prober nothing (`CMS-003` §3). A shape
 * that can never name a row is not found, so it is refused as not found here
 * rather than surfacing as an error.
 */
export async function mediaForServing(mediaId: string): Promise<ServableMedia | null> {
  if (!UUID.test(mediaId)) {
    return null;
  }

  const row = await getDb()
    .selectFrom('media')
    .select(['mime', 'bytes', 'uploaded_by'])
    .where('id', '=', mediaId)
    .executeTakeFirst();

  return row === undefined
    ? null
    : { mime: row.mime, bytes: row.bytes, uploadedBy: row.uploaded_by };
}

/**
 * Whether an item this reader may read references the file (`CMS-003/T5`,
 * `CMS-R06`) — and, asked with `reader` of `null`, whether a *public* published
 * item does, which is the serve route's cache decision (`CMS-003/T6`).
 *
 * The audience is `visibleTo`'s, composed rather than copied, so a file inherits
 * the audience of what uses it by the one predicate every content read shares.
 * The link is a correlated `EXISTS` over `media_refs`, the shape `visibleTo`
 * itself uses for a grant, so several references to one item do not multiply the
 * row and turn a single match into a `DISTINCT` a caller has to remember.
 *
 * It lives in this module because the join reads `content_items`, which only the
 * content library may name (`check-content-access.py`); the route composes this
 * rather than holding a second copy of the audience rule the design exists to
 * have exactly one of.
 */
export async function isReferencedByVisibleItem(
  mediaId: string,
  reader: Actor | null,
): Promise<boolean> {
  const referenced = await getDb()
    .selectFrom('content_items')
    .select((eb) => eb.lit(1).as('one'))
    .where(visibleTo(reader))
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('media_refs')
          .select((ref) => ref.lit(1).as('one'))
          .whereRef('media_refs.item_id', '=', 'content_items.id')
          .where('media_refs.media_id', '=', mediaId),
      ),
    )
    .executeTakeFirst();

  return referenced !== undefined;
}

/** The outcome of a delete: done, or refused with the items that still use it. */
export type DeleteResult = { readonly ok: true } | { readonly ok: false; readonly referencedBy: string[] };

/**
 * Delete a file, refused while anything references it (`CMS-003/T7`).
 *
 * `media_refs.media_id` is `ON DELETE CASCADE`, so a plain delete of a referenced
 * file would not be refused by the database — it would quietly take the
 * references with it and break the documents that used them. So the file is the
 * thing checked, and the check must be race-safe: the row is locked `FOR UPDATE`,
 * which conflicts with the `FOR KEY SHARE` a `media_refs` insert takes on it, so
 * a reference being added in another transaction either lands before the lock —
 * and is seen, and the delete is refused — or waits behind it and then fails
 * against the row this delete removed. Either way no referenced file is deleted.
 *
 * Returns the items that still use it when refused. A file with no references is
 * deleted and the deletion is audited (`media.delete`, `SEC-R04`), because it can
 * break a published document if the reference count was ever wrong. An id no row
 * holds is a no-op — nothing to delete, nothing referenced — and writes nothing.
 */
export async function deleteMedia(mediaId: string, actorId: string): Promise<DeleteResult> {
  return getDb()
    .transaction()
    .execute(async (trx): Promise<DeleteResult> => {
      const media = await trx
        .selectFrom('media')
        .select('id')
        .where('id', '=', mediaId)
        .forUpdate()
        .executeTakeFirst();

      if (media === undefined) {
        return { ok: true };
      }

      const refs = await trx
        .selectFrom('media_refs')
        .select('item_id')
        .where('media_id', '=', mediaId)
        .execute();

      if (refs.length > 0) {
        return { ok: false, referencedBy: refs.map((ref) => ref.item_id) };
      }

      await trx.deleteFrom('media').where('id', '=', mediaId).execute();

      await recordAudit(trx, {
        actorId,
        action: 'media.delete',
        subjectType: 'media',
        subjectId: mediaId,
      });

      return { ok: true };
    });
}
