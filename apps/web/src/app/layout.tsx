import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import { bcp47, DEFAULT_LOCALE, dir, isLocale } from '../i18n/locales';

/**
 * Declared here so it reaches every route, including the ones added after this
 * line was written.
 *
 * The Content-Security-Policy `SEC-001` sets refuses inline script, and the
 * nonce that admits Next's own inline tags is minted per request and stamped
 * during the render. A route prerendered at build time is therefore served with
 * a policy whose nonce nothing in its HTML carries, and the browser refuses the
 * scripts that hydrate it: the page paints and is then inert. Rendering on
 * demand is what makes the nonce reachable, and it costs this application
 * little — every surface below the sign-in is per-reader already.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VALO Tech',
  description: 'The VALO Tech application.',
};

export default async function RootLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  // The locale the request resolved to (src/i18n/request.ts). `lang` and `dir`
  // carry it to the browser so a screen reader reads the right language and the
  // two right-to-left locales lay out correctly; the provider hands the same
  // locale and its messages to every client component below.
  const requested = await getLocale();
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  const messages = await getMessages();

  return (
    <html lang={bcp47(locale)} dir={dir(locale)}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
