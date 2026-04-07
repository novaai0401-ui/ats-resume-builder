'use client';

import { useEffect, useMemo, useState } from 'react';
import { TkxButton, TkxCard, TkxCardBody, TkxAlert } from 'tekivex-ui';
import {
  api,
  getAccessToken,
  isApiRequestError,
  isCurrentUserAdmin,
  type AdminSettingsResponse,
} from '@/src/lib/api';

type Toast = { type: 'success' | 'error'; text: string } | null;

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingRateLimit, setSavingRateLimit] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState('');
  const [rateLimitEnabled, setRateLimitEnabled] = useState(false);
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [forcedDisabled, setForcedDisabled] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getAccessToken()) {
        if (cancelled) return;
        setHasAccess(false);
        setError('Please sign in to access admin settings.');
        setLoading(false);
        return;
      }
      if (!isCurrentUserAdmin()) {
        if (cancelled) return;
        setHasAccess(false);
        setError('Admin access required.');
        setLoading(false);
        return;
      }
      setHasAccess(true);
      try {
        const current = await api.getAdminSettings();
        if (cancelled) return;
        applySettingsResponse(current);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(getReadableError(err, 'Failed to load admin settings.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const rateLimitStatusText = useMemo(() => (rateLimitEnabled ? 'Enabled' : 'Disabled'), [rateLimitEnabled]);
  const paymentStatusText = useMemo(() => (paymentEnabled ? 'Enabled' : 'Disabled'), [paymentEnabled]);

  async function onSaveRateLimit() {
    if (!hasAccess) return;
    setSavingRateLimit(true);
    setError('');
    try {
      const next = await api.setResumeCreationRateLimitEnabled(rateLimitEnabled);
      applySettingsResponse(next);
      setToast({ type: 'success', text: 'Rate limit setting saved.' });
    } catch (err: unknown) {
      const message = getReadableError(err, 'Failed to update rate limit setting.');
      setError(message);
      setToast({ type: 'error', text: message });
    } finally {
      setSavingRateLimit(false);
    }
  }

  async function onSavePayment() {
    if (!hasAccess) return;
    setSavingPayment(true);
    setError('');
    try {
      const next = await api.setPaymentFeatureEnabled(paymentEnabled);
      applySettingsResponse(next);
      setToast({ type: 'success', text: 'Payment feature flag saved.' });
    } catch (err: unknown) {
      const message = getReadableError(err, 'Failed to update payment feature flag.');
      setError(message);
      setToast({ type: 'error', text: message });
    } finally {
      setSavingPayment(false);
    }
  }

  function applySettingsResponse(payload: AdminSettingsResponse) {
    setRateLimitEnabled(Boolean(payload.flags?.resumeCreationRateLimitEnabled));
    setPaymentEnabled(Boolean(payload.flags?.paymentFeatureEnabled));
    setUpdatedAt(payload.updatedAt || null);
    setForcedDisabled(Boolean(payload.forcedDisabled));
  }

  return (
    <main className="grid">
      <TkxCard as="section" className="col-7" padding="lg">
        <TkxCardBody>
          <h2>Admin Settings</h2>
          <p style={{ fontSize: '0.9rem' }}>Control runtime feature flags for backend behavior.</p>
          {loading ? <p style={{ fontSize: '0.9rem' }}>Loading settings...</p> : null}
          {!loading && !hasAccess ? (
            <TkxAlert variant="danger" style={{ marginTop: 12 }}>{error || 'Admin access required.'}</TkxAlert>
          ) : null}
          {!loading && hasAccess ? (
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={rateLimitEnabled}
                    onChange={(event) => setRateLimitEnabled(event.target.checked)}
                    disabled={savingRateLimit}
                  />
                  <span>Enable Resume Creation Rate Limit</span>
                </label>
                <p style={{ fontSize: '0.9rem' }}>Current state: <strong>{rateLimitStatusText}</strong></p>
                <p style={{ fontSize: '0.9rem' }}>
                  Last updated: {updatedAt ? new Date(updatedAt).toLocaleString() : 'Not set'}
                </p>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={paymentEnabled}
                    onChange={(event) => setPaymentEnabled(event.target.checked)}
                    disabled={savingPayment}
                  />
                  <span>Enable Payment Feature Enforcement</span>
                </label>
                <p style={{ fontSize: '0.9rem' }}>Current state: <strong>{paymentStatusText}</strong></p>
              </div>
              {forcedDisabled ? (
                <TkxAlert variant="warning">`FORCE_DISABLE_RATE_LIMIT=true` is active. Rate limit is currently forced OFF.</TkxAlert>
              ) : null}
              {error ? <TkxAlert variant="danger">{error}</TkxAlert> : null}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                <TkxButton onClick={onSaveRateLimit} isLoading={savingRateLimit} loadingText="Saving...">
                  Save Rate Limit
                </TkxButton>
                <TkxButton onClick={onSavePayment} isLoading={savingPayment} loadingText="Saving...">
                  Save Payment Flag
                </TkxButton>
              </div>
            </div>
          ) : null}
          {toast ? (
            <div className={`snackbar ${toast.type}`} role="status" aria-live="polite">
              {toast.text}
            </div>
          ) : null}
        </TkxCardBody>
      </TkxCard>
      <TkxCard as="section" className="col-5" padding="lg">
        <TkxCardBody>
          <h3>Rollout Guidance</h3>
          <p style={{ fontSize: '0.9rem' }}>
            Keep this flag disabled in pre-launch/testing. Enable it when rollout starts.
          </p>
          <p style={{ fontSize: '0.9rem' }}>
            For emergencies, set `FORCE_DISABLE_RATE_LIMIT=true` and restart the API to hard-disable it.
          </p>
        </TkxCardBody>
      </TkxCard>
    </main>
  );
}

function getReadableError(error: unknown, fallback: string) {
  if (isApiRequestError(error)) {
    if (error.status === 403) return 'Admin access required.';
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

