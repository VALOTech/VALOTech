/**
 * `POST /admin/media/upload` — the one way a file enters the library
 * (`CMS-003/T9`).
 *
 * The handler owns the refusals a request can earn and nothing else. What a file
 * *is* comes from its bytes (`apps/web/src/content/media.ts:sniffType`), never
 * from the filename or the declared content type, because both are written by
 * whoever is uploading (`SEC-001`); and what is stored is the store's own output,
 * since `storeMedia` re-encodes a raster and strips a PDF's metadata before it
 * hashes anything (`CMS-003/T2`, `CMS-003/T8`). So this reads the bytes, refuses
 * them by size and by type, and hands the rest over.
 *
 * The caller gate, the origin refusal and the `no-store` answer are the other
 * admin routes' and for their reasons: a route handler inherits no segment
 * layout, so it asks `requireAdmin` itself and a non-admin gets the `404` the
 * console gives a guess; a cross-site `Origin` is refused before anything else,
 * the `SameSite=Lax` cookie being the first lock.
 *
 * The size is checked after the bytes are read rather than from
 * `Content-Length`, which the uploader also writes. Reading a body this route
 * will refuse is the cost of not trusting a header about its own length.
 */

import { requireAdmin } from '../../../../auth/gate';
import { getConfig } from '../../../../config/index';
import { sniffType, storeMedia, UndecodableImageError } from '../../../../content/media';
import { MAX_UPLOAD_BYTES } from '../../../../content/upload-limits';
import { withRequestId } from '../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  // The answer names a file this admin may not be able to see a moment later,
  // and it is about one request; no cache has any business holding it.
  'Cache-Control': 'no-store',
};

const CROSS_ORIGIN = JSON.stringify({ error: 'cross_origin' });
const NO_FILE = JSON.stringify({ error: 'no_file' });
const TOO_LARGE = JSON.stringify({ error: 'too_large' });
const UNACCEPTED_TYPE = JSON.stringify({ error: 'unaccepted_type' });

function json(status: number, body: string): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

async function handleUpload(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, CROSS_ORIGIN);
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // The parse error's only content is where the caller's own body broke; the
    // refusal stands for it and it is not echoed back.
    return json(400, NO_FILE);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return json(400, NO_FILE);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return json(413, TOO_LARGE);
  }

  const mime = sniffType(bytes);
  if (mime === null) {
    return json(415, UNACCEPTED_TYPE);
  }

  try {
    const stored = await storeMedia(bytes, mime, actor.id);

    return json(200, JSON.stringify({ id: stored.id, deduped: stored.deduped, mime }));
  } catch (error) {
    if (error instanceof UndecodableImageError) {
      // The bytes carried an accepted type's signature and then would not
      // decode, so they are not that file. It is the same answer an unaccepted
      // type gets, because it is the same fact about the upload.
      return json(415, UNACCEPTED_TYPE);
    }

    throw error;
  }
}

export async function POST(request: Request): Promise<Response> {
  return withRequestId(handleUpload)(request);
}
