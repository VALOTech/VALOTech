'use client';

import type { ReactElement } from 'react';

import styles from './error.module.css';

/**
 * The root error boundary (`SEC-001`), rendered when the root layout itself
 * throws. Next renders this one route statically and does not extend the
 * layout's `force-dynamic` to it, so it is served without a per-request nonce
 * ([`SEC-DEC-02`](../../decisions-log.md#SEC-DEC-02)): the policy sent with it
 * admits no inline script, and the framework's hydration tags carry no nonce to
 * be admitted by. So the page is built to need none of it — its styling is an
 * external module the policy admits, and the way out is a plain link rather than
 * a `reset` handler — and it renders and navigates from static HTML alone,
 * whatever the refused hydration would otherwise have added. It carries
 * `noindex` because a `500` served with a year of `s-maxage` should not be
 * indexed.
 */
export default function GlobalError(): ReactElement {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex" />
      </head>
      <body className={styles.frame}>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.message}>An error stopped this page from loading. Try again from the start.</p>
        <a className={styles.home} href="/">
          Go to the start
        </a>
      </body>
    </html>
  );
}
