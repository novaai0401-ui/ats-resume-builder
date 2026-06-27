'use client';

import { useState } from 'react';

/**
 * Small, dismissable banner that surfaces our privacy promise on
 * surfaces where the user is about to hand us their resume.
 *
 * IMPORTANT — the copy below describes our ACTUAL data flow today,
 * not the aspirational "local-first" pitch from earlier scaffolding:
 *   • Parsing runs on our servers (NestJS API → resume-intelligence).
 *   • Saved resumes live in our Postgres database, scoped to your account.
 *   • Everything in transit is TLS; at rest it sits behind the database
 *     provider's encryption.
 *   • We do not sell your data and do not train AI on your resume
 *     unless you opt in (Settings → Training data).
 *
 * The earlier "stays on this device / Cloud sync is opt-in" wording
 * was inherited from a local-first foundation that isn't wired up
 * yet (no UI toggle, vault endpoints unused). Shipping it as-is would
 * be a deceptive-practice problem under the DPDP Act + Play Store
 * data-safety rules — so it's been replaced with copy that matches
 * what the code actually does. When the vault flow ships end-to-end,
 * revisit this file and the COPY map.
 */

type Variant = 'upload' | 'dashboard' | 'download' | 'login';

const COPY: Record<Variant, { title: string; body: string; dismissable: boolean }> = {
  upload: {
    title: 'How we handle your resume',
    body:
      'We parse your resume on our servers and store it in your account so you can come back to it. ' +
      'Everything is sent over HTTPS and encrypted at rest. We never sell your data, and we never use ' +
      'your resume to train AI unless you opt in.',
    dismissable: true,
  },
  dashboard: {
    title: 'Your resumes, your account',
    body:
      'Saved resumes live in your Pocket Resume account so they show up when you sign in on another device. ' +
      'You can delete any resume — or your entire account — from Settings.',
    dismissable: true,
  },
  download: {
    title: 'We don’t keep a copy of the file',
    body:
      'The PDF/Word file is rendered on demand from your saved resume and streamed straight to you. ' +
      'The generated file isn’t stored on our servers — only the editable resume in your account is.',
    dismissable: false,
  },
  login: {
    title: 'A short word on privacy',
    body:
      'Your resume is processed and stored on our servers (HTTPS in transit, encrypted at rest). ' +
      'We never sell your data and never train AI on your resume unless you opt in.',
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
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderLeft: '4px solid var(--primary)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 14px',
        margin: '12px 0',
        fontSize: 13,
        lineHeight: 1.5,
        color: 'var(--primary)',
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
            color: 'var(--primary)',
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
