'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { TkxDrawer } from 'tekivex-ui';
import { api, getAccessToken, isCurrentUserAdmin, startSessionHeartbeat } from '@/src/lib/api';
import { NAV_HUBS, activeHubKey, type HubKey } from '@/src/lib/nav-hubs';
import { classifyDevice, isInstallTargetDevice } from '@/src/lib/device';
import SessionWarningModal from './SessionWarningModal';

// Map of internal plan keys → user-facing badge text. The plan value is
// stored in localStorage by the billing page after a successful upgrade
// and read by everything that needs to know "what tier is this user on"
// without making another API call. We keep the mapping small and
// explicit so a future plan key (e.g. TEAM) doesn't accidentally fall
// through to the wrong badge.
const PLAN_LABEL: Record<string, string> = {
  FREE: 'Free',
  STUDENT: 'Student',
  PRO: 'Pro',
};

export default function TopNav() {
  const router = useRouter();
  // usePathname returns null during SSR before the route is known —
  // tolerate that so the nav still renders pre-hydration.
  const pathname = usePathname() || '';
  const [authed, setAuthed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [plan, setPlan] = useState<string>('FREE');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // R-036: the 5-hub model. activeHubKey owns prefix matching across
  // every route the hub claims (see nav-hubs.ts) — TopNav no longer
  // has to know whether /jd-match belongs to Resume or Applications.
  const activeHub: HubKey | null = activeHubKey(pathname);
  function hubProps(key: HubKey): { 'aria-current'?: 'page' } {
    return activeHub === key ? { 'aria-current': 'page' } : {};
  }
  function exactProps(href: string): { 'aria-current'?: 'page' } {
    return pathname === href ? { 'aria-current': 'page' } : {};
  }
  // TkxDrawer renders through a portal and touches `document` on mount —
  // rendering it during SSR produces markup the client can't match,
  // triggering a React hydration error. Wait for the first client-side
  // effect before rendering it. The burger button is still present in
  // SSR so there's no visual flash.
  const [mounted, setMounted] = useState(false);
  // Track whether this is a phone / tablet. The "Download App" link
  // is hidden on desktop browsers because pointing the user at a Play
  // Store / App Store install they cannot do anything useful with is
  // confusing. Default to desktop pre-hydration so we never flash the
  // link on a desktop browser before the UA classification runs.
  const [installable, setInstallable] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      const kind = classifyDevice(window.navigator?.userAgent, window.innerWidth);
      setInstallable(isInstallTargetDevice(kind));
    } catch {
      setInstallable(false);
    }
  }, []);

  useEffect(() => {
    startSessionHeartbeat();
    const update = () => {
      const hasToken = Boolean(getAccessToken());
      setAuthed(hasToken);
      setAdmin(hasToken ? isCurrentUserAdmin() : false);
      // Read plan from localStorage. The billing page writes 'rb_plan'
      // on successful upgrade/downgrade. If the API has fresher data
      // it'll get pulled the next time a billing-aware page mounts.
      try {
        const stored = window.localStorage.getItem('rb_plan');
        if (stored) setPlan(stored);
      } catch { /* private mode */ }
    };
    update();
    window.addEventListener('storage', update);
    window.addEventListener('auth-state-changed', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('auth-state-changed', update);
    };
  }, []);

  // Close drawer on route-level navigation so tapping a link doesn't leave
  // the drawer mounted over the new page.
  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function onLogout() {
    closeDrawer();
    try {
      await api.logout();
    } finally {
      setAuthed(false);
      setAdmin(false);
      router.push('/auth/login');
    }
  }

  const planLabel = PLAN_LABEL[plan] || plan || 'Free';
  const planTone = plan === 'PRO' ? 'plan-badge--pro' : plan === 'STUDENT' ? 'plan-badge--student' : 'plan-badge--free';

  // R-036: render the five hubs (post-login) instead of 12+ flat links.
  // The Dashboard surface stays accessible at /dashboard — it remains
  // the post-login landing but is not a hub in its own right (it IS
  // the post-login Home for authed users, semantically).
  const links = (
    <>
      {authed ? (
        <Link href="/dashboard" onClick={closeDrawer} {...exactProps('/dashboard')}>
          Home
        </Link>
      ) : (
        <Link href="/" onClick={closeDrawer} {...hubProps('home')}>Home</Link>
      )}
      {authed && (
        <>
          {NAV_HUBS.filter((h) => h.key !== 'home' && h.key !== 'account').map((hub) => (
            <Link
              key={hub.key}
              href={hub.landing}
              onClick={closeDrawer}
              {...hubProps(hub.key)}
            >
              {hub.label}
            </Link>
          ))}
          <Link href="/settings" onClick={closeDrawer} {...hubProps('account')}>
            Account
          </Link>
          {/* Plan badge doubles as a billing-page link so users can see
              their tier at a glance and one-tap to manage. Free users
              see "Free → Upgrade" cue colours; paid users see green.
              Lives outside the 5-hub set because it's a status chip
              with a shortcut, not navigation. */}
          <Link
            href="/billing"
            onClick={closeDrawer}
            className={`plan-badge ${planTone}`}
            aria-label={`Current plan: ${planLabel}. Tap to manage.`}
            {...exactProps('/billing')}
          >
            {planLabel}
          </Link>
        </>
      )}
      {authed && admin ? <Link href="/admin" onClick={closeDrawer} {...exactProps('/admin')}>Admin</Link> : null}
      {installable ? (
        <Link href="/download" onClick={closeDrawer} className="nav-download-app" {...exactProps('/download')}>
          Download App
        </Link>
      ) : null}
      {authed ? (
        <button className="btn secondary" type="button" onClick={onLogout}>Logout</button>
      ) : (
        <>
          <Link href="/auth/login" onClick={closeDrawer} {...exactProps('/auth/login')}>Login</Link>
          <Link href="/auth/register" onClick={closeDrawer} {...exactProps('/auth/register')}>Register</Link>
        </>
      )}
    </>
  );

  return (
    <>
      <SessionWarningModal />

      {/* Desktop nav — hidden below 768px via .nav--desktop in globals.css */}
      <nav className="nav nav--desktop">{links}</nav>

      {/* Mobile burger — hidden at >=768px via .nav-burger in globals.css */}
      <button
        type="button"
        className="nav-burger"
        aria-label="Open navigation"
        aria-expanded={drawerOpen}
        aria-controls="mobile-nav-drawer"
        onClick={() => setDrawerOpen(true)}
      >
        <span className="nav-burger__bar" />
        <span className="nav-burger__bar" />
        <span className="nav-burger__bar" />
      </button>

      {mounted ? (
        <TkxDrawer
          isOpen={drawerOpen}
          onClose={closeDrawer}
          placement="right"
          size="sm"
          title="Menu"
        >
          <nav className="nav nav--mobile" id="mobile-nav-drawer">{links}</nav>
        </TkxDrawer>
      ) : null}
    </>
  );
}
