'use client';

/**
 * "Sign in with LinkedIn" button. Hidden unless the server reports LinkedIn is
 * configured (GET /auth/providers), so environments without OAuth keys don't
 * show a dead button. LinkedIn-only by design — Google's verification cost
 * isn't justified pre-revenue.
 */

import { useEffect, useState } from 'react';
import { api } from '@/src/lib/api';

export function LinkedInSignInButton() {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAuthProviders()
      .then((p) => setAvailable(Boolean(p?.linkedin)))
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  async function go() {
    setLoading(true);
    setError('');
    try {
      const { url } = await api.linkedinStartUrl();
      window.location.assign(url);
    } catch {
      setError('Could not start LinkedIn sign-in. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted, #888)', fontSize: 12 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border, #e2e8f0)' }} />
        or
        <span style={{ flex: 1, height: 1, background: 'var(--border, #e2e8f0)' }} />
      </div>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: '#0a66c2', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14,
        }}
      >
        <span style={{ fontWeight: 800 }}>in</span>
        {loading ? 'Redirecting…' : 'Continue with LinkedIn'}
      </button>
      {error ? <p className="small" style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}
    </div>
  );
}
