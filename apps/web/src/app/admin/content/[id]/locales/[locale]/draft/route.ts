/**
 * `POST /admin/content/<id>/locales/<locale>/draft` — start a translation
 * (`CMS-005/T3`).
 *
 * It seeds the locale with the source blocks and nothing more. The hall runs no
 * translation service (`CMS-DEC-04`), so what this creates is the English under
 * another language's label, in the pre-review state, served to no reader
 * (`CMS-R05`) — the thing an admin then translates in the review screen.
 *
 * Three refusals are the caller's to fix and are answered rather than raised.
 * **English** is refused because the authored language holds no locale row: the
 * revision's own blocks are it, and a row claiming otherwise would be a second
 * copy of the source that nothing keeps in step. **A locale outside the twenty**
 * is refused against `I18N-001`'s own list rather than stored, so the table
 * cannot grow a language the application has no interface for. **A locale already
 * started** is refused because re-seeding would overwrite a translation in
 * progress with the English it came from.
 *
 * A route handler inherits no segment layout, so the `/admin` layout's admin
 * check (`ADMIN-002`) does not run here: this handler asks the gate itself
 * (`requireAdmin`), which answers a non-admin the same `404` the pages give and
 * a signed-out caller the sign-in redirect. It gets no automatic origin check
 * either, so an `Origin` present and not ours is refused before anything else —
 * the session cookie is `SameSite=Lax` and this is the second lock rather than
 * the only one.
 */

import { requireAdmin } from '../../../../../../../auth/gate';
import { getConfig } from '../../../../../../../config/index';
import { seedLocale } from '../../../../../../../content/locales';
import { DEFAULT_LOCALE, isLocale } from '../../../../../../../i18n/locales';
import { withRequestId } from '../../../../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handleSeed(request: Request, itemId: string, locale: string): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, { error: 'cross_origin' });
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  if (!isLocale(locale)) {
    return json(400, { error: 'unknown_locale' });
  }

  if (locale === DEFAULT_LOCALE) {
    return json(400, { error: 'authored_locale' });
  }

  const outcome = await seedLocale(itemId, locale);
  if (outcome.ok) {
    return json(200, { revisionId: outcome.revisionId, locale });
  }

  return json(409, { error: outcome.reason === 'no-revision' ? 'no_revision' : 'already_started' });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; locale: string }> },
): Promise<Response> {
  const { id, locale } = await params;
  return withRequestId((scoped: Request) => handleSeed(scoped, id, locale))(request);
}
