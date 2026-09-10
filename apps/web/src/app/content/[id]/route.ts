/**
 * `GET /content/<id>` — a published content item's body, as this reader may see
 * it (`CMS-006/T4`, `T6`, `CMS-R02`, `CMS-R03`, `SEC-R01`).
 *
 * The audience is not decided here. `forReader` composes the one predicate
 * (`content/access.ts`'s `visibleTo`) and returns the item's published revision
 * only when this reader may see it, or `null`. A reader who may not see it, an
 * item with no published revision, and an item that does not exist are one
 * `null`, which this route answers as one `404` — never a `403`, which would
 * confirm to a guess that the id names something real (`CMS-006` §2).
 *
 * The id reaches here straight from the URL and an item's id is a uuid, so a
 * value that is not a uuid would raise `invalid input syntax for type uuid` and
 * answer `500`, repeating the supplied value back (`DATA-R02`).
 * The shape is checked first, so a garbage path is the same `404` a missing item
 * gets, not a `500`.
 *
 * The response is the revision narrowed to what a reader needs — its id, its
 * blocks and when it was published — and not `author_id`, a staff identifier no
 * reader needs and that `forReader` still carries on the row. Fixing the shape
 * here is why it is fixed before a reader surface (`INV-001`, `POST-002`,
 * `RPT-002`) comes to depend on the wider row.
 *
 * Caching follows the audience. A `public` item is served with a short lifetime,
 * so a later narrowing away from public is bounded rather than cached forever
 * (`CMS-006/T6`); anything else is `private, no-store`, because a gated body a
 * shared cache holds is a gated body it serves to whoever asks next. The session
 * is resolved without sliding it (`accountForToken`): reading an item is not the
 * act that should extend a session, and `proxy.ts` additionally answers any
 * cookie-bearing request `no-store`, so a gated body is never cacheable for a
 * signed-in reader whatever this route computed.
 */

import { accountForToken, presentedToken } from '../../../auth/gate';
import { forReader } from '../../../content/read';
import { withRequestId } from '../../../ops/request-context';

/**
 * How long a public item may be cached. Ten minutes matches the window the
 * media route and the gateway's edge carry, and it bounds how long a reader
 * holds an item whose audience has since been narrowed away from public.
 */
const PUBLIC_MAX_AGE_SECONDS = 600;

/** The shape an item's id takes, checked before the value reaches a uuid column. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `404` a missing item and an unreadable one share. One function, so the two
 * are identical by construction, and `no-store` because the answer is a property
 * of who asked rather than of what was asked for.
 */
function notFound(): Response {
  return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

async function handleRead(request: Request, id: string): Promise<Response> {
  if (!UUID.test(id)) {
    return notFound();
  }

  const reader = await accountForToken(presentedToken(request.headers));

  const view = await forReader(id, reader);
  if (view === null) {
    return notFound();
  }

  const body = JSON.stringify({
    id: view.revision.id,
    blocks: view.revision.blocks,
    publishedAt: view.revision.published_at,
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control':
        view.item.audience === 'public' ? `public, max-age=${PUBLIC_MAX_AGE_SECONDS}` : 'private, no-store',
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withRequestId((scoped: Request) => handleRead(scoped, id))(request);
}
