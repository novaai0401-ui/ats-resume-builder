'use client';

import { useEffect, useState } from 'react';
import { TkxButton } from 'tekivex-ui';

// Chrome / Edge / Samsung Internet expose this; Safari iOS does not — it
// needs the user to use Share → Add to Home Screen, which we surface as a
// hint instead of an install button.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'pocket-resume:install-dismissed-at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export default function PwaInstaller() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Register the service worker. We only do this in production builds —
    // SW caching against `next dev`'s HMR pipeline causes stale-asset bugs.
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => null);
    }

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const recentlyDismissed = dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS;
    const installed = window.matchMedia('(display-mode: standalone)').matches;

    if (installed || recentlyDismissed) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome|crios|fxios/.test(ua);
    if (isIos && isSafari) {
      setIosHint(true);
      setHidden(false);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (hidden) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setHidden(true);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  }

  return (
    <div
      role="dialog"
      aria-label="Install CallbackCV"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        background: '#1a3a5c',
        color: '#fff',
        borderRadius: 12,
        padding: '14px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 9999,
        fontSize: 14,
      }}
    >
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>Install CallbackCV</strong>
        {iosHint ? (
          <span>Tap Share, then “Add to Home Screen” to use it like a native app.</span>
        ) : (
          <span>Get the app feel — works offline and launches from your home screen.</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!iosHint && (
          <TkxButton
            onClick={install}
            style={{ background: '#fff', color: '#1a3a5c', border: 0, borderRadius: 8, padding: '8px 12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Install
          </TkxButton>
        )}
        <TkxButton
          onClick={dismiss}
          style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}
        >
          Not now
        </TkxButton>
      </div>
    </div>
  );
}
