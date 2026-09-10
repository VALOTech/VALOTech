/**
 * The media library's store (`CMS-003`): what a file's type is, how it is stored
 * once and reused, and when it may be deleted.
 *
 * Three things live here, and the upload and serve routes (`CMS-003` §3) compose
 * them. The type is sniffed from the bytes, never the filename or the declared
 * content type, because both are the uploader's to write (`SEC-001`). Storage is
 * keyed by the bytes' own SHA-256, so the same file uploaded twice is one row.
 * Deletion is refused while anything references the file, because `media_refs`
 * cascades from `media` — a file deleted out from under a published document
 * would take its references with it rather than be refused.
 *
 * What is not here: the re-encode that strips EXIF from a raster and the SVG
 * sanitiser (`CMS-003/T2`, `T3`) wait on [`CMS-DEC-03`](../../docs/decisions-log.md#CMS-DEC-03);
 * until the upload route exists it re-encodes before it calls `storeMedia`, so a
 * file with its EXIF intact never reaches storage.
 */

import { createHash } from 'node:crypto';

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';

/**
 * The types the library accepts, by what the bytes are and not what they are
 * called (`CMS-003` §3). Anything else is refused.
 */
export const ACCEPTED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
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
 * An SVG is XML, so it has no single magic number; it is recognised by an `<svg>`
 * root reachable past an optional byte-order mark, an XML declaration and
 * comments, and nothing else before it. This only decides the *type* — the parse
 * that strips script and external references, or refuses, is `CMS-003/T3`.
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('utf8');
  return /^\s*(<\?xml\b[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s/>]/i.test(head);
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
  if (looksLikeSvg(bytes)) {
    return 'image/svg+xml';
  }
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
