'use client';

import { useState } from 'react';

/**
 * Small, dismissable banner that surfaces our local-first privacy
 * promise. Drop it on any surface where the user is about to upload,
 * download, or hand us data — they shouldn't have to read the privacy
 * page to know what's happening.
 *
 * Variants pick the message; the underlying contract is the same:
 *   • Resumes you create stay on this device by default.
 *   • Cloud sync is opt-in (Settings).
 *   • We never sell or train on your data.
 *
 * The dismissal is per-variant and per-browser (localStorage), so a
 * user who's already seen the upload banner doesn't see it again on
 * every visit. The download banner is intentionally non-dismissable —
 * we want users to see it every time they hit Export, because that's
 * the moment trust matters most.
 */

type Variant = 'upload' | 'dashboard' | 'download' | 'login';

const COPY: Record<Variant, { title: string; body: string; dismissable: boolean }> = {
  upload: {
    title: 'Your resume stays on this device',
    body:
      'When you upload, we parse it in your browser and store it on your phone or laptop only. ' +
      'We never copy it to our servers unless you turn on Cloud sync in Settings.',
    dismissable: true,
  },
  dashboard: {
    title: 'Local-first by default',
    body:
      'Your resumes are saved on this device. Sign in on a different device → empty dashboard, ' +
      'until you flip on Cloud sync. We never read your resume on our servers.',
    dismissable: true,
  },
  download: {
    title: 'We don’t store a copy',
    body:
      'Your downloaded resume goes straight to your device. We render the PDF in memory, ' +
      'send it to you, and discard it. Nothing is written to our database.',
    dismissable: false,
  },
  login: {
    title: 'Your resume never leaves your device',
    body:
      'Pocket Resume keeps your resumes on the device you create them on. Cloud sync is opt-in. ' +
      'We never sell your data, never train AI on it.',
    dismissable: true,
  },
};

export function PrivacyBadge({ variant }: { variant: Variant }) {
  const cfg = COPY[variant];
  const storageKey = `pocket-resume:privacy-dismissed:${variant}`;
  const initiallyHidden = (() => {
    if (!cfg.dismissable) return false;
    if (typeof window === 'undefined') return false;
    try { return Boolean(window.localStorage.getItem(storageKey)); } catch { return false; }
  })();
  const [hidden, setHidden] = useState(initiallyHidden);

  if (hidden) return null;

  function dismiss() {
    if (!cfg.dismissable) return;
    try { window.localStorage.setItem(storageKey, '1'); } catch { /* private mode */ }
    setHidden(true);
  }

  return (
    <div
      role="note"
      aria-label="Privacy notice"
      style={{
        background: '#eef5ff',
        border: '1px solid #c4dbf2',
        borderLeft: '4px solid #1a3a5c',
        borderRadius: 12,
        padding: '12px 14px',
        margin: '12px 0',
        fontSize: 13,
        lineHeight: 1.5,
        color: '#1a3a5c',
        position: 'relative',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1.2 }}>{'\u{1F512}'}</span>
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>{cfg.title}</strong>
        <span>{cfg.body}</span>
      </div>
      {cfg.dismissable ? (
        <button
          onClick={dismiss}
          aria-label="Dismiss privacy notice"
          style={{
            background: 'transparent',
            border: 0,
            color: '#1a3a5c',
            opacity: 0.6,
            fontSize: 18,
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          {'×'}
        </button>
      ) : null}
    </div>
  );
}
