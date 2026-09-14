'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A `details` panel that also closes when the reader looks away.
 *
 * **The element does the work; this only adds what it lacks.** `details` opens
 * and closes on its own, is keyboard-operable, and announces its state — so
 * with no script at all the control still works, and the summary still closes
 * it. What the element does not do is close when a click lands elsewhere, which
 * is what everybody expects of a menu and the one thing worth a listener.
 *
 * Escape closes it too, and returns focus to the summary rather than leaving it
 * on an element that is no longer visible — a keyboard reader who dismisses a
 * panel and finds their place gone has to start the row again.
 *
 * `pointerdown` rather than `click`, because a click that begins inside the
 * panel and ends outside it is a drag — selecting text in the field — and
 * closing the panel out from under a selection is the behaviour this is
 * supposed to prevent, not cause.
 */
export function Disclosure({
  className,
  summary,
  openInitially = false,
  children,
}: {
  readonly className?: string;
  readonly summary: ReactNode;
  readonly openInitially?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const panel = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const element = panel.current;
    if (element === null) {
      return undefined;
    }

    const dismiss = (event: Event): void => {
      if (element.open && event.target instanceof Node && !element.contains(event.target)) {
        element.open = false;
      }
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && element.open) {
        element.open = false;
        element.querySelector('summary')?.focus();
      }
    };

    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return (
    <details ref={panel} className={className} open={openInitially ? true : undefined}>
      {summary}
      {children}
    </details>
  );
}
