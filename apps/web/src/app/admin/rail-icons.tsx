import type { ReactElement } from 'react';

/**
 * One icon per console section (`ADMIN-002`).
 *
 * Drawn here rather than loaded as files: six strokes each, and a sprite or six
 * requests for that is machinery the rail does not need. They share one grid,
 * one stroke weight and one cap style, because a rail whose icons were drawn to
 * different rules reads as six borrowed pictures rather than one set.
 *
 * Every one is `aria-hidden`: the entry's own word is beside it, and a screen
 * reader that announced both would say each section twice (`A11Y-R02`).
 */

const COMMON = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

/** What needs attention — a bell, for the one page that says what is waiting. */
function Attention({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg {...COMMON} className={className}>
      <path d="M10 3.25a4.25 4.25 0 0 0-4.25 4.25c0 3.1-1 4.2-1.4 4.6a.5.5 0 0 0 .35.86h10.6a.5.5 0 0 0 .35-.86c-.4-.4-1.4-1.5-1.4-4.6A4.25 4.25 0 0 0 10 3.25Z" />
      <path d="M8.6 15.5a1.6 1.6 0 0 0 2.8 0" />
    </svg>
  );
}

/** Content — stacked sheets, the three kinds of writing this system holds. */
function Content({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg {...COMMON} className={className}>
      <path d="M6.5 2.75h5.2l3.55 3.55v10.95a.5.5 0 0 1-.5.5H6.5a.5.5 0 0 1-.5-.5V3.25a.5.5 0 0 1 .5-.5Z" />
      <path d="M11.5 2.9v3.6h3.6M8.4 10.2h4.2M8.4 13.2h4.2" />
    </svg>
  );
}

/** Media — a framed picture, which is what the library holds. */
function Media({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg {...COMMON} className={className}>
      <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="1.6" />
      <circle cx="7.4" cy="8.4" r="1.25" />
      <path d="M3.2 13.6l3.7-3.2 3 2.6 2.6-2.2 4.3 3.6" />
    </svg>
  );
}

/** Accounts — two people, because the list is of people and not of records. */
function Accounts({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg {...COMMON} className={className}>
      <circle cx="8" cy="7" r="2.75" />
      <path d="M2.9 16.2c0-2.7 2.3-4.4 5.1-4.4s5.1 1.7 5.1 4.4" />
      <path d="M13.6 5.1a2.6 2.6 0 0 1 0 5M15.1 11.9c1.4.5 2.3 1.6 2.3 3.2" />
    </svg>
  );
}

/** Mail — an envelope. */
function Mail({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg {...COMMON} className={className}>
      <rect x="2.75" y="4.75" width="14.5" height="10.5" rx="1.6" />
      <path d="M3.2 6.1 10 10.7l6.8-4.6" />
    </svg>
  );
}

/** Settings — sliders, not a cog: these are values an admin sets, not gears. */
function Settings({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg {...COMMON} className={className}>
      <path d="M3.25 6.25h13.5M3.25 13.75h13.5" />
      <circle cx="7.75" cy="6.25" r="1.85" />
      <circle cx="12.6" cy="13.75" r="1.85" />
    </svg>
  );
}

/** Audit — a list under a clock hand: what happened, and when. */
function Audit({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg {...COMMON} className={className}>
      <path d="M3.4 5.2h8M3.4 9.1h5.4M3.4 13h4.1" />
      <circle cx="13.6" cy="12.4" r="4.1" />
      <path d="M13.6 10.4v2.1l1.4.9" />
    </svg>
  );
}

export const RAIL_ICONS: Readonly<
  Record<string, (props: { readonly className?: string }) => ReactElement>
> = {
  '/admin': Attention,
  '/admin/content': Content,
  '/admin/media': Media,
  '/admin/accounts': Accounts,
  '/admin/mail': Mail,
  '/admin/config': Settings,
  '/admin/audit': Audit,
};
