'use client';

import { useEffect, useState } from 'react';
import {
  getTrainingConsent,
  purgeTrainingSamples,
  setTrainingConsent,
  type TrainingConsentState,
} from '@/src/lib/api';

/**
 * Account Settings card — lets the user toggle training participation
 * any time and purge every sample we have collected from them.
 *
 * Uses the app's `.card` / `.small` CSS conventions (globals.css) plus
 * inline styles for the toggle. The app does not use Tailwind.
 */
export default function TrainingConsentCard() {
  const [state, setState] = useState<TrainingConsentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);

  useEffect(() => {
    getTrainingConsent().then(setState).catch(() => setState(null));
  }, []);

  const toggle = async () => {
    if (!state) return;
    setBusy(true);
    try {
      const next = await setTrainingConsent(!state.enabled);
      setState({ ...state, enabled: next.enabled });
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    if (!confirm('Delete every training sample collected from your account? This cannot be undone.')) return;
    setBusy(true);
    try {
      const { deleted } = await purgeTrainingSamples();
      setPurgeResult(`Deleted ${deleted} sample${deleted === 1 ? '' : 's'}.`);
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Help improve resume parsing</h2>
      <p className="small" style={{ color: 'var(--muted)' }}>
        We learn from patterns and structure only. Names, emails, phone numbers,
        and links are stripped before anything is saved for training.
      </p>

      <div style={rowStyle}>
        <span style={{ fontSize: 14, color: 'var(--ink)' }}>
          {state.enabled ? 'Currently sharing patterns' : 'Not sharing'}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={state.enabled}
          aria-label="Toggle training participation"
          style={{
            ...trackStyle,
            background: state.enabled ? 'var(--primary)' : 'var(--border)',
            opacity: busy ? 0.6 : 1,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          <span
            style={{
              ...knobStyle,
              transform: state.enabled ? 'translateX(20px)' : 'translateX(2px)',
            }}
          />
        </button>
      </div>

      <div style={dividerStyle}>
        <button
          type="button"
          onClick={purge}
          disabled={busy}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--danger)',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          Delete all my training samples
        </button>
        {purgeResult && (
          <p className="small" style={{ marginTop: 8, color: 'var(--muted)' }}>{purgeResult}</p>
        )}
      </div>
    </section>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 16,
};

const trackStyle: React.CSSProperties = {
  position: 'relative',
  width: 44,
  height: 24,
  borderRadius: 999,
  border: 'none',
  transition: 'background 0.15s ease',
  flexShrink: 0,
};

const knobStyle: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  left: 0,
  width: 20,
  height: 20,
  borderRadius: '50%',
  background: 'var(--card)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  transition: 'transform 0.15s ease',
};

const dividerStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 16,
  borderTop: '1px solid var(--border)',
};
