/**
 * next-intl's per-request configuration, without URL routing (`I18N-DEC-02`).
 *
 * VALOTech resolves a locale from the reader rather than from the path: there is
 * one set of routes, and `/sign-in` is `/sign-in` in every language. The locale
 * comes from the `NEXT_LOCALE` cookie when one is set and from `Accept-Language`
 * otherwise, which is why no locale segment and no next-intl middleware are
 * added — the security proxy in `proxy.ts` is the only thing on the request
 * path, and a routing middleware beside it would be a second place to get the
 * edge wrong.
 */

import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { LOCALE_COOKIE, resolveLocale } from './locales';

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get('accept-language'));

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
