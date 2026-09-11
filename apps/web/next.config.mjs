import createNextIntlPlugin from 'next-intl/plugin';

// Without URL routing: the locale is resolved per request in src/i18n/request.ts
// from the cookie and Accept-Language, so no locale segment is added to the path
// and no next-intl middleware runs beside the security proxy (I18N-DEC-02).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withNextIntl(nextConfig);
