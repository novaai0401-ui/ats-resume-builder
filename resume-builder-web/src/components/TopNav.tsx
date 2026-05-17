'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { TkxDrawer } from 'tekivex-ui';
import { api, getAccessToken, isCurrentUserAdmin, startSessionHeartbeat } from '@/src/lib/api';
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

  // Returns aria-current="page" when the link's href matches the current
  // pathname. Match is prefix-based for nested routes ("/resume" lights
  // up for "/resume/start", "/resume/template", etc.) but the home link
  // matches only the exact "/" so it doesn't light up on every page.
  function navProps(href: string): { 'aria-current'?: 'page' } {
    if (!pathname) return {};
    if (href === '/') return pathname === '/' ? { 'aria-current': 'page' } : {};
    return pathname === href || pathname.startsWith(href + '/') ? { 'aria-current': 'page' } : {};
  }
  // TkxDrawer renders through a portal and touches `document` on mount —
  // rendering it during SSR produces markup the client can't match,
  // triggering a React hydration error. Wait for the first client-side
  // effect before rendering it. The burger button is still present in
  // SSR so there's no visual flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
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

  const links = (
    <>
      <Link href="/" onClick={closeDrawer} {...navProps('/')}>Home</Link>
      {authed && (
        <>
          <Link href="/dashboard" onClick={closeDrawer} {...navProps('/dashboard')}>Dashboard</Link>
          <Link href="/resume/start" onClick={closeDrawer} {...navProps('/resume')}>Resume</Link>
          <Link href="/resume/versions" onClick={closeDrawer} {...navProps('/resume/versions')}>Versions</Link>
          <Link href="/jobs" onClick={closeDrawer} {...navProps('/jobs')}>Jobs</Link>
          <Link href="/cover-letter" onClick={closeDrawer} {...navProps('/cover-letter')}>Cover Letter</Link>
          <Link href="/career" onClick={closeDrawer} {...navProps('/career')}>Career Navigator</Link>
          <Link href="/mentor" onClick={closeDrawer} {...navProps('/mentor')}>Mentor</Link>
          <Link href="/jd-match" onClick={closeDrawer} {...navProps('/jd-match')}>JD Match</Link>
          {plan === 'PRO' ? (
            <>
              <Link href="/interview-prep" onClick={closeDrawer} {...navProps('/interview-prep')}>Interview Prep</Link>
              <Link href="/mentor/chat" onClick={closeDrawer} {...navProps('/mentor/chat')}>Mentor Chat</Link>
            </>
          ) : null}
          <Link href="/settings" onClick={closeDrawer} {...navProps('/settings')}>Settings</Link>
          {/* Plan badge doubles as a billing-page link so users can see
              their tier at a glance and one-tap to manage. Free users
              see "Free → Upgrade" cue colours; paid users see green. */}
          <Link
            href="/billing"
            onClick={closeDrawer}
            className={`plan-badge ${planTone}`}
            aria-label={`Current plan: ${planLabel}. Tap to manage.`}
            {...navProps('/billing')}
          >
            {planLabel}
          </Link>
        </>
      )}
      {authed && admin ? <Link href="/admin" onClick={closeDrawer} {...navProps('/admin')}>Admin</Link> : null}
      <Link href="/download" onClick={closeDrawer} className="nav-download-app" {...navProps('/download')}>
        Download App
      </Link>
      {authed ? (
        <button className="btn secondary" type="button" onClick={onLogout}>Logout</button>
      ) : (
        <>
          <Link href="/auth/login" onClick={closeDrawer} {...navProps('/auth/login')}>Login</Link>
          <Link href="/auth/register" onClick={closeDrawer} {...navProps('/auth/register')}>Register</Link>
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
