/**
 * `POST /admin/content/<id>/locales/<locale>/review` — store a translation and
 * mark that locale reviewed (`CMS-005/T4`).
 *
 * **The body carries strings, never blocks.** `fields` is one array of values per
 * source block, in the order the review screen shows them, and the document is
 * rebuilt on the server from the source: the same blocks in the same order, the
 * same picture naming the same file, with only the words replaced. A body of
 * blocks would let one language's structure drift from the others — a dropped
 * section, a different image — and no reader compares the two, so nothing would
 * ever say so.
 *
 * Marking is one deliberate act on one locale (`CMS-005` section 3), and this
 * route is the whole of it: there is no control that marks twenty at once,
 * because such a control's only function is to make the state lie. The text and
 * the approval arrive together, so no row is ever marked reviewed while holding
 * something nobody read.
 *
 * A route handler inherits no segment layout, so this asks the gate itself
 * (`requireAdmin`), and an `Origin` present and not ours is refused before
 * anything else — the same two locks the other console routes carry
 * (`ADMIN-002`, `AUTH-001`).
 */

import { requireAdmin } from '../../../../../../../auth/gate';
import { getConfig } from '../../../../../../../config/index';
import { BlockValidationError } from '../../../../../../../content/blocks';
import { markReviewed } from '../../../../../../../content/locales';
import { DEFAULT_LOCALE, isLocale } from '../../../../../../../i18n/locales';
import { withRequestId } from '../../../../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** One array of strings per source block, and nothing else. */
function asFields(value: unknown): readonly (readonly string[])[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const perBlock of value) {
    if (!Array.isArray(perBlock) || perBlock.some((entry) => typeof entry !== 'string')) {
      return null;
    }
  }

  return value as readonly (readonly string[])[];
}

async function handleReview(request: Request, itemId: string, locale: string): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, { error: 'cross_origin' });
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  if (!isLocale(locale) || locale === DEFAULT_LOCALE) {
    return json(400, { error: isLocale(locale) ? 'authored_locale' : 'unknown_locale' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }

  const fields = asFields((body as { fields?: unknown } | null)?.fields);
  if (fields === null) {
    return json(400, { error: 'invalid_request' });
  }

  try {
    const outcome = await markReviewed(itemId, locale, fields, actor.id);
    return outcome.ok
      ? json(200, { revisionId: outcome.revisionId, locale })
      : json(409, { error: 'not_started' });
  } catch (error) {
    // The source document is validated on the way through, and a translation
    // that would not survive that is the author's to fix rather than a 500.
    if (error instanceof BlockValidationError) {
      return json(422, { error: 'invalid_blocks', detail: error.message });
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; locale: string }> },
): Promise<Response> {
  const { id, locale } = await params;
  return withRequestId((scoped: Request) => handleReview(scoped, id, locale))(request);
}
