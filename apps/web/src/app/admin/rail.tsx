'use client';

import type { ReactElement } from 'react';

import { usePathname } from 'next/navigation';

import { RAIL_ICONS } from './rail-icons';
import styles from './admin.module.css';

/**
 * The console's rail, with the section being read marked (`ADMIN-002`).
 *
 * A client component for one reason: the current path, which App Router hands
 * no layout. It imports its icons and its labels and nothing else — a client
 * component that imported a value from a module reaching the database would
 * drag the driver into the browser bundle, where neither the type-checker nor
 * the test run would see it and only `next build` would.
 *
 * `/admin` matches only itself. Every other section matches its own subtree, so
 * an admin reading a person's page still sees Accounts marked — the question the
 * mark answers is "where am I", and the answer is the section rather than the
 * page.
 */
export interface RailDestination {
  readonly href: string;
  readonly label: string;
}

export function AdminRail({
  destinations,
}: {
  readonly destinations: readonly RailDestination[];
}): ReactElement {
  const path = usePathname();

  return (
    <ul>
      {destinations.map((destination) => {
        const current =
          destination.href === '/admin'
            ? path === '/admin'
            : path === destination.href || path.startsWith(`${destination.href}/`);
        const Icon = RAIL_ICONS[destination.href];

        return (
          <li key={destination.href}>
            <a
              href={destination.href}
              className={current ? styles.railCurrent : undefined}
              // Marked for somebody not looking at it as well as for somebody
              // who is: the rule and the colour are the sighted half.
              aria-current={current ? 'page' : undefined}
            >
              {Icon === undefined ? null : <Icon className={styles.railIcon} />}
              {destination.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
