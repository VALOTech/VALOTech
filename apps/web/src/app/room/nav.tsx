'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

import styles from './room.module.css';

export interface RoomDestination {
  readonly href: string;
  readonly label: string;
}

/**
 * The room's flat navigation, with the current destination marked
 * (`INV-001/T3`).
 *
 * A client component for one reason: the current path. Marking the current
 * destination on the server would mean the layout reading the request's URL,
 * which App Router does not hand a layout, so the alternative is every page
 * declaring which of them it is — a fact each page would be trusted to keep
 * true and the fourth one would get wrong.
 *
 * It imports nothing but its labels. A client component that imports a value
 * from a module reaching the database drags the driver into the browser bundle,
 * and neither the type-checker nor the test run sees it — only the build does.
 *
 * `aria-current` rather than a class alone: the underline says which page this
 * is to somebody looking at it, and nothing at all to somebody who is not.
 */
export function RoomNav({ destinations }: { readonly destinations: readonly RoomDestination[] }): ReactElement {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {destinations.map((destination) => {
        const current = pathname === destination.href;
        return (
          <Link
            key={destination.href}
            href={destination.href}
            className={`${styles.navLink}${current ? ` ${styles.navLinkCurrent}` : ''}`}
            aria-current={current ? 'page' : undefined}
          >
            {destination.label}
          </Link>
        );
      })}
    </nav>
  );
}
