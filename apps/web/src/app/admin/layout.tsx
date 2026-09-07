/**
 * The `/admin` segment layout — the one place the console's role check happens
 * (`ADMIN-002`, `SEC-R01`).
 *
 * Every page under `/admin` is a child of this layout and cannot render without
 * it resolving first, so the check is a structural property of the segment
 * rather than a line each page is trusted to include. The failure it prevents is
 * the eleventh admin page shipping without the check the first ten have.
 *
 * It is the consumer side of the gate `AUTH-002` built: `requireAdmin` answers
 * an `Actor` or the `Response` a non-admin should receive, and the gate alone
 * decides which — an investor is answered `404` so the console's existence is
 * not confirmed to a guess, a signed-out reader is sent to sign in. This layout
 * only translates that answer into the App Router's equivalents (`notFound()`,
 * `redirect()`); it never re-decides the policy, so the `404`-not-`403` rule
 * lives in one place and cannot drift between the route handlers and the pages.
 *
 * The console is **English only** — a deliberate exception to `I18N-R01`, which
 * governs visitor-facing strings. Both admins read English, and twenty locales
 * of console chrome would be twenty to keep current for two people. The content
 * an admin writes is a different matter and is translated (`CMS-005`).
 */

import type { ReactElement, ReactNode } from 'react';

import { requireAdminPage } from '../../auth/page-guard';
import { getConfig } from '../../config/index';

import styles from './admin.module.css';

/** The console's destinations, in the order the rail lists them (`ADMIN-002` §3). */
const DESTINATIONS: ReadonlyArray<{ readonly href: string; readonly label: string }> = [
  { href: '/admin', label: 'What needs attention' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/media', label: 'Media' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/portfolio', label: 'Portfolio' },
  { href: '/admin/config', label: 'Settings' },
  { href: '/admin/audit', label: 'Audit' },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  // The gate every page under this segment inherits: a non-admin never reaches
  // the render below, because requireAdminPage answers the 404 or the sign-in
  // redirect itself (ADMIN-002 §3).
  await requireAdminPage();

  const { env } = getConfig().app;

  return (
    <div className={styles.console}>
      {env !== 'production' ? (
        <div className={styles.envBar} role="status">
          {/* The environment is named in text, not by colour alone (A11Y-R03),
              so an admin who edits the wrong one is warned by the words. */}
          <strong>{env}</strong> — not production
        </div>
      ) : null}
      <div className={styles.frame}>
        <nav className={styles.rail} aria-label="Admin sections">
          <span className={styles.wordmark}>VALO Tech</span>
          <ul>
            {DESTINATIONS.map((destination) => (
              <li key={destination.href}>
                <a href={destination.href}>{destination.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
