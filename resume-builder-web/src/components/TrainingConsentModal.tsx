'use client';

import { useEffect, useState } from 'react';
import {
  acknowledgeTrainingNotice,
  getTrainingConsent,
  setTrainingConsent,
  type TrainingConsentState,
} from '@/src/lib/api';

/**
 * One-time training-data notice. Shown to every authenticated user the
 * first time they land in the app after consent v1 ships. Patterns-only
 * + default-on; the user can opt out from the same modal or later from
 * Account Settings.
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
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="training-consent-title" className="text-lg font-semibold text-slate-900">
          {state.notice.title}
        </h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
          {state.notice.body}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={optOut}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Opt out
          </button>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Got it
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          You can change this in Account Settings anytime.
        </p>
      </div>
    </div>
  );
}
