'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Top-of-page navigation progress bar.
 *
 * The App Router has no router events, and heavy client pages can take a
 * beat to render after a link tap — with no feedback the screen looks
 * frozen. This shows an indeterminate bar the moment an internal link is
 * clicked and completes it when the pathname actually changes, so every
 * navigation has immediate visual feedback.
 *
 * Uses only `usePathname` (NOT useSearchParams) so it doesn't force every
 * page to be dynamically rendered.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle');
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Complete the bar whenever the route actually changes.
  useEffect(() => {
    setPhase((prev) => (prev === 'loading' ? 'done' : prev));
    const t = setTimeout(() => setPhase('idle'), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Start the bar on a click that will trigger internal navigation.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const target = anchor.getAttribute('target');
      if (
        !href ||
        target === '_blank' ||
        href.startsWith('#') ||
        href.startsWith('http') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        anchor.hasAttribute('download')
      ) {
        return;
      }
      // Same-page link → no navigation, don't show a bar that never ends.
      const dest = href.split('#')[0];
      if (dest === window.location.pathname || dest === '') return;

      setPhase('loading');
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      // Failsafe: never leave the bar stuck if a navigation is cancelled.
      safetyTimer.current = setTimeout(() => setPhase('idle'), 8000);
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, []);

  return (
    <div
      className={`route-progress route-progress--${phase}`}
      role="progressbar"
      aria-hidden={phase === 'idle'}
      aria-label="Loading page"
    />
  );
}
