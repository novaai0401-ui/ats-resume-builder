'use client';

import { useEffect, useState } from 'react';
import {
  acknowledgeTrainingNotice,
  getAccessToken,
  getTrainingConsent,
  setTrainingConsent,
  type TrainingConsentState,
} from '@/src/lib/api';
import { TkxButton } from 'tekivex-ui';

/**
 * One-time training-data notice. Shown to every authenticated user the
 * first time they land in the app after consent v1 ships. Patterns-only
 * + default-on; the user can opt out from the same modal or later from
 * Account Settings.
 *
 * Styling note: the app does NOT use Tailwind — it ships its own CSS in
 * globals.css. This component therefore uses self-contained inline styles
 * so it renders as a true centered overlay regardless of which page it
 * mounts on. (The earlier Tailwind-class version produced no styling and
 * fell through as static text at the bottom of the page.)
 *
 * Renders nothing when:
 *   - the user is not authenticated (request fails silently),
 *   - the notice has already been acknowledged,
 *   - the consent fetch errored (we never block app load on this).
 */
export default function TrainingConsentModal() {
  const [state, setState] = useState<TrainingConsentState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // R-102: don't call an authed endpoint with no token. The catch below
    // already swallowed the failure, but the request still fired on every
    // anonymous page load and surfaced a 401 in the visitor's network tab
    // (and our logs) for a modal that can never show them anything.
    if (!getAccessToken()) return;
    let cancelled = false;
    getTrainingConsent()
      .then((s) => {
        if (cancelled) return;
        if (!s.noticeSeen) setState(s);
      })
      .catch(() => {
        // Anonymous / network error — never block the UI.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!state) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [state]);

  if (!state) return null;

  const close = async () => {
    setBusy(true);
    try {
      await acknowledgeTrainingNotice();
    } finally {
      setState(null);
      setBusy(false);
    }
  };

  const optOut = async () => {
    setBusy(true);
    try {
      await setTrainingConsent(false);
      await acknowledgeTrainingNotice();
    } finally {
      setState(null);
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="training-consent-title"
      aria-describedby="training-consent-body"
      style={overlayStyle}
      onClick={(e) => {
        // Clicking the dim backdrop acknowledges (same as "Got it") so the
        // user is never trapped — but it does NOT opt them out silently.
        if (e.target === e.currentTarget && !busy) void close();
      }}
    >
      <div style={cardStyle} role="document">
        <div style={iconRowStyle}>
          <span aria-hidden style={iconBadgeStyle}>🔒</span>
          <h2 id="training-consent-title" style={titleStyle}>
            {state.notice.title}
          </h2>
        </div>

        <p id="training-consent-body" style={bodyStyle}>
          {state.notice.body}
        </p>

        <ul style={bulletListStyle}>
          <li style={bulletItemStyle}>We learn from <strong>patterns and structure</strong> only.</li>
          <li style={bulletItemStyle}>Names, emails, phone numbers and links are <strong>stripped before saving</strong>.</li>
          <li style={bulletItemStyle}>Opt out anytime, or delete every sample with one click.</li>
        </ul>

        <div style={buttonRowStyle}>
          <TkxButton
            type="button"
            onClick={optOut}
            disabled={busy}
            style={{ ...secondaryButtonStyle, ...(busy ? disabledStyle : null) }}
          >
            Opt out
          </TkxButton>
          <TkxButton
            type="button"
            onClick={close}
            disabled={busy}
            style={{ ...primaryButtonStyle, ...(busy ? disabledStyle : null) }}
          >
            Got it
          </TkxButton>
        </div>

        <p style={footnoteStyle}>You can change this in Account Settings anytime.</p>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  background: 'rgba(15, 23, 42, 0.55)',
  backdropFilter: 'blur(2px)',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  background: '#ffffff',
  borderRadius: '16px',
  padding: '28px',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28)',
  fontFamily: 'var(--font-sans)',
  color: '#1b2b3c',
  boxSizing: 'border-box',
};

const iconRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '14px',
};

const iconBadgeStyle: React.CSSProperties = {
  fontSize: '18px',
  lineHeight: 1,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '19px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
};

const bodyStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '14.5px',
  lineHeight: 1.55,
  color: '#3c4a5c',
};

const bulletListStyle: React.CSSProperties = {
  margin: '0 0 22px',
  padding: '0 0 0 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const bulletItemStyle: React.CSSProperties = {
  fontSize: '13.5px',
  lineHeight: 1.5,
  color: '#3c4a5c',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
};

const baseButtonStyle: React.CSSProperties = {
  appearance: 'none',
  border: '1px solid transparent',
  borderRadius: '10px',
  padding: '10px 18px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const primaryButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: '#1a3a5c',
  color: '#ffffff',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: '#ffffff',
  color: '#1b2b3c',
  border: '1px solid #cbd5e1',
};

const disabledStyle: React.CSSProperties = {
  opacity: 0.55,
  cursor: 'default',
};

const footnoteStyle: React.CSSProperties = {
  margin: '16px 0 0',
  fontSize: '12px',
  color: '#7a8aa0',
  textAlign: 'center',
};
