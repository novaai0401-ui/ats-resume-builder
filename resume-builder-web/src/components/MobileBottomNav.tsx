'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { TkxBottomNav } from 'tekivex-ui';
import { getAccessToken } from '@/src/lib/api';
import { NAV_HUBS, activeHubKey, type HubKey } from '@/src/lib/nav-hubs';

/**
 * R-036 mobile chrome — fixed bottom nav showing the same 5 hubs as
 * the desktop top nav. Only renders below 768px (CSS handles the
 * visibility) and only when the user is signed in (a logged-out
 * visitor needs no hubs). Uses tekivex-ui's TkxBottomNav so it
 * inherits the app's component language + safe-area padding.
 *
 * Icons are inline SVG strings so the bundle stays icon-library-free
 * — five glyphs, ~150 bytes each, no dependency.
 */

const ICONS: Record<HubKey, string> = {
  home: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z',
  resume: 'M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm6 1.5V8h3.5L13 4.5zM8 12h8M8 15h8M8 18h5',
  applications: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h10v2H4z',
  coach: 'M12 2a4 4 0 0 1 4 4v3a4 4 0 1 1-8 0V6a4 4 0 0 1 4-4zm-6 13a6 6 0 0 1 12 0v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0z',
};

function IconSvg({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const [authed, setAuthed] = useState(false);

  // Hydrate auth state on mount and listen for changes — TopNav uses
  // the same listener pattern, so the two surfaces flip together when
  // the user logs in/out.
  useEffect(() => {
    const update = () => setAuthed(Boolean(getAccessToken()));
    update();
    window.addEventListener('storage', update);
    window.addEventListener('auth-state-changed', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('auth-state-changed', update);
    };
  }, []);

  if (!authed) return null;

  const items = NAV_HUBS.map((hub) => ({
    id: hub.key,
    label: hub.label,
    icon: <IconSvg d={ICONS[hub.key]} />,
  }));
  const active = activeHubKey(pathname) ?? undefined;
  const landingByKey = Object.fromEntries(NAV_HUBS.map((h) => [h.key, h.landing])) as Record<HubKey, string>;

  return (
    // CSS in globals.css owns the breakpoint (display:none above
    // 767px) AND the safe-area-inset-bottom padding for iOS home
    // indicator. The component stays media-query-free.
    <nav className="mobile-bottom-nav" aria-label="Primary navigation">
      <TkxBottomNav
        items={items}
        activeId={active}
        showLabels
        onChange={(id) => {
          const target = landingByKey[id as HubKey];
          if (target) router.push(target);
        }}
      />
    </nav>
  );
}
