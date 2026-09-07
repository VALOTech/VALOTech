import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

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

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
