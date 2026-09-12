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
 * What is not here: the re-encode that strips EXIF from a raster (`CMS-003/T2`)
 * waits on its library — `CMS-DEC-03` settled it to `jimp`, pure JavaScript, run
 * before `storeMedia` once the upload route exists, so a file with its EXIF
 * intact never reaches storage. SVG is not accepted at all (`CMS-003/T3`): the
 * same decision refused it rather than trust a sanitiser, so an `<svg>` document
 * sniffs to `null` and the upload turns it away like any other unaccepted type.
 */

import { createHash } from 'node:crypto';

import type { Actor } from '../auth/gate';
import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';

import { visibleTo } from './access';

/**
 * The types the library accepts, by what the bytes are and not what they are
 * called (`CMS-003` §3). Anything else is refused.
 */
export const ACCEPTED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

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
 * of them (`CMS-003/T1`). The raster and document types have a fixed signature;
 * WebP is a RIFF container whose form appears four bytes in.
 */
export function sniffType(bytes: Uint8Array): AcceptedMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp';
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return 'application/pdf';
  }
  // SVG is refused rather than sanitised (`CMS-DEC-03`): an `<svg>` document is
  // none of the accepted types, so it sniffs to null and the upload turns it away.
  return null;
}

/** Where a stored file lives, and whether this call created it or found it. */
export interface StoredMedia {
  readonly id: string;
  readonly deduped: boolean;
}

/**
 * Store bytes under their SHA-256, returning the row's id (`CMS-003/T4`). The
 * same bytes stored twice are one row: the insert yields to an existing `sha256`
 * rather than failing, so two uploads of one file racing each other settle on
 * the same row instead of one erroring. `deduped` tells the caller whether it
 * created the row, which the upload route reports as "already here".
 *
 * The bytes are stored as given; any re-encoding (`CMS-003/T2`) has happened
 * before this is called.
 */
export async function storeMedia(
  bytes: Uint8Array,
  mime: AcceptedMime,
  uploaderId: string,
): Promise<StoredMedia> {
  const buffer = Buffer.from(bytes);
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
