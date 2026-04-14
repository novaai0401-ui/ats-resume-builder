'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TkxDrawer } from 'tekivex-ui';
import { api, getAccessToken, isCurrentUserAdmin, startSessionHeartbeat } from '@/src/lib/api';
import SessionWarningModal from './SessionWarningModal';

export default function TopNav() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    startSessionHeartbeat();
    const update = () => {
      const hasToken = Boolean(getAccessToken());
      setAuthed(hasToken);
      setAdmin(hasToken ? isCurrentUserAdmin() : false);
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

  const links = (
    <>
      <Link href="/" onClick={closeDrawer}>Home</Link>
      {authed && (
        <>
          <Link href="/dashboard" onClick={closeDrawer}>Dashboard</Link>
          <Link href="/resume/start" onClick={closeDrawer}>Resume</Link>
        </>
      )}
      {authed && admin ? <Link href="/admin/settings" onClick={closeDrawer}>Admin</Link> : null}
      {authed ? (
        <button className="btn secondary" type="button" onClick={onLogout}>Logout</button>
      ) : (
        <>
          <Link href="/auth/login" onClick={closeDrawer}>Login</Link>
          <Link href="/auth/register" onClick={closeDrawer}>Register</Link>
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

      <TkxDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        placement="right"
        size="sm"
        title="Menu"
      >
        <nav className="nav nav--mobile" id="mobile-nav-drawer">{links}</nav>
      </TkxDrawer>
    </>
  );
}
