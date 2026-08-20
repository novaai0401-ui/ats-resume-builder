'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Scroll to the top on every route change.
 *
 * Founder-reported: clicking a footer link navigated but left the viewport at
 * the bottom of the new page — the reader lands mid-footer of a page they have
 * never seen. Next's built-in scroll restoration usually handles this, but it
 * targets the nearest scrollable ancestor and can no-op when layout CSS makes
 * the scroll container ambiguous; an explicit reset costs nothing and removes
 * the ambiguity everywhere.
 *
 * Hash links are left alone — jumping to #section is the user's stated intent.
 * 'instant' on purpose: smooth-scrolling from a footer to the top of a new
 * page reads as the app animating for its own sake.
 */
export default function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}
