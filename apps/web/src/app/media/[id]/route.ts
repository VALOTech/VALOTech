/**
 * `GET /media/<id>` — a stored file, served only to a reader who may read
 * something that references it (`CMS-003/T5`, `T6`, `CMS-R06`).
 *
 * A file inherits the audience of what uses it. A reader may see it when they
 * uploaded it — the clause that lets an admin fetch a file they have just
 * uploaded and not yet placed — or when an item they are entitled to read
 * references it. Neither is decided here: the audience predicate lives in the
 * media library, the one place the tables it reads may be named, and this route
 * composes it rather than holding a second copy of the rule.
 *
 * A file a reader may not see is answered with the same `404` a file that does
 * not exist gets, byte for byte. A `403` would tell a prober that the id names
 * something real, which is the whole of what a guessed URL was asking.
 *
 * Caching follows the audience. A file a *public* item references is cacheable
 * for a short window; anything else is `private, no-store`, because a gated file
 * a CDN has cached is a gated file the CDN serves to whoever asks next. The
 * window is short rather than absent because the audience can change under the
 * cache: an item narrowed away from public narrows what may read its file, and a
 * reader holding a cached copy keeps it only until the window elapses.
 *
 * The session is resolved without sliding it (`accountForToken`): fetching a
 * sub-resource must not extend a session the reader did not act in, and an
 * absent or expired cookie resolves to nobody — a visitor, who sees only public
 * files. `nosniff` is set by the proxy on every response and set here too, so it
 * is present whether or not the proxy ran; the proxy also answers a
 * cookie-bearing request with `no-store` regardless, which is what keeps a gated
 * file uncacheable for a signed-in reader whatever this route computed.
 */

import { accountForToken, presentedToken } from '../../../auth/gate';
import { isReferencedByVisibleItem, mediaForServing } from '../../../content/media';

/**
 * How long a public file may be cached. Ten minutes matches the window the
 * gateway's own HTML carries at the edge, and it bounds how long a reader keeps
 * a file whose item has since been narrowed away from public.
 */
const PUBLIC_MAX_AGE_SECONDS = 600;

/** The filename extension a stored type is served under; the id carries the name. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

/**
 * The `404` a missing file and an unreadable one share. One function, so the two
 * are identical by construction, and `no-store` because the answer is a property
 * of who asked rather than of what was asked for — a shared cache holding it
 * would answer the next reader with it.
 */
function notFound(): Response {
  return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

/** A sanitised download name: the uuid and the type's extension, both safe. */
function filenameFor(id: string, mime: string): string {
  const extension = EXTENSIONS[mime];
  return extension === undefined ? id : `${id}.${extension}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const media = await mediaForServing(id);
  if (media === null) {
    return notFound();
  }

  const reader = await accountForToken(presentedToken(request.headers));

  const referencedForReader = await isReferencedByVisibleItem(id, reader);
  const visible = media.uploadedBy === reader?.id || referencedForReader;
  if (!visible) {
    return notFound();
  }

  // Cacheable only when a public item references the file. For a visitor that is
  // the very question already answered — an item a visitor may read is a public
  // published one — so the answer is reused rather than asked a second time.
  const publiclyReferenced =
    reader === null ? referencedForReader : await isReferencedByVisibleItem(id, null);

  // A fresh Uint8Array rather than the Node Buffer: a Buffer's backing store is
  // typed `ArrayBufferLike`, which the web `BodyInit` does not admit, and this is
  // a copy into a plain `ArrayBuffer`-backed view of exactly these bytes.
  return new Response(new Uint8Array(media.bytes), {
    status: 200,
    headers: {
      'Content-Type': media.mime,
      'Content-Disposition': `inline; filename="${filenameFor(id, media.mime)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': publiclyReferenced
        ? `public, max-age=${PUBLIC_MAX_AGE_SECONDS}`
        : 'private, no-store',
    },
  });
}
