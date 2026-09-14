import { getConfig } from '../../../config/index';
import { isLocale, LOCALE_COOKIE } from '../../../i18n/locales';
import { withRequestId } from '../../../ops/request-context';

/**
 * `POST /api/locale` — the reader choosing the language they are written to in
 * (`INV-001/T4`).
 *
 * A route rather than a client-side cookie write, because the locale is
 * resolved on the server for every render (`src/i18n/request.ts`): a cookie set
 * in the browser would take effect on the next navigation rather than on this
 * one, and the control would read as broken the first time somebody used it.
 *
 * **Origin-checked like the door.** A route handler gets no automatic check,
 * and a cross-site form can post here with no preflight. Changing somebody's
 * language is a nuisance rather than a theft, but the check costs one
 * comparison and the alternative is a control any page on the internet can
 * drive.
 *
 * **The redirect target is validated, never taken as given.** `next` is a path
 * on this application or it is not used: a form field that becomes a `Location`
 * is an open redirect, which is how a link that looks like ours arrives
 * somewhere that is not. A value that is not a single-slash-rooted path — which
 * excludes `//host`, a scheme, and a backslash Windows treats as a separator —
 * is replaced by the room.
 */

const HOME = '/room';

function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') {
    return HOME;
  }
  // Rooted at exactly one slash, and no backslash: `//evil.example` is a
  // protocol-relative URL and `/\evil.example` is one to a browser that reads
  // the backslash as a separator.
  return /^\/(?![/\\])[^\\]*$/.test(value) ? value : HOME;
}

export const POST = withRequestId(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return new Response('cross-origin', { status: 403 });
  }

  const form = await request.formData();
  const requested = form.get('locale');
  const next = safeNext(form.get('next'));

  const headers = new Headers({ Location: next });
  // A value outside the catalogue changes nothing rather than storing a locale
  // the dictionary has no file for, which would fall back on every render.
  if (typeof requested === 'string' && isLocale(requested)) {
    const secure = getConfig().app.env === 'development' ? '' : '; Secure';
    headers.append(
      'Set-Cookie',
      `${LOCALE_COOKIE}=${requested}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`,
    );
  }

  // 303, so the browser follows with GET: a 307 would repost the form to the
  // page and the reader would be asked to resubmit on every refresh.
  return new Response(null, { status: 303, headers });
});
