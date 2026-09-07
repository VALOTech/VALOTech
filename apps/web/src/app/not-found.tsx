import type { ReactElement } from 'react';

import styles from './error.module.css';

/**
 * The 404 (`SEC-001`). It replaces the framework's built-in page, whose inline
 * `<style>` a policy without `unsafe-inline` refuses — leaving the default
 * unstyled. This one renders under the root layout, so it is dynamic and
 * nonced, and its styling is an external module either way. It is the page an
 * unmatched URL reaches, and until `AUTH-001`'s sign-in page exists it is also
 * where the admin gate sends a signed-out reader.
 */
export default function NotFound(): ReactElement {
  return (
    <main className={styles.frame}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.message}>The page you asked for is not here.</p>
      <a className={styles.home} href="/">
        Go to the start
      </a>
    </main>
  );
}
