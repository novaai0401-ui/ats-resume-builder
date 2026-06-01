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
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-900">Help improve resume parsing</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        We learn from patterns and structure only. Names, emails, phone numbers,
        and links are stripped before anything is saved for training.
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-slate-700">
          {state.enabled ? 'Currently sharing patterns' : 'Not sharing'}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={state.enabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            state.enabled ? 'bg-indigo-600' : 'bg-slate-300'
          } disabled:opacity-50`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              state.enabled ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={purge}
          disabled={busy}
          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          Delete all my training samples
        </button>
        {purgeResult && <p className="mt-2 text-xs text-slate-600">{purgeResult}</p>}
      </div>
    </section>
  );
}
