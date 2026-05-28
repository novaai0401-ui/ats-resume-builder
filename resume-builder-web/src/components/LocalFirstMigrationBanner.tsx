'use client';

/**
 * Migration banner — shown once per browser per user. Pulls server-side
 * resumes into the local IndexedDB store so the user owns their data
 * going forward.
 *
 * UX rules:
 *  - Run on mount, but silently. The banner only appears if there is
 *    something to migrate or something to report.
 *  - The user can dismiss. The migration sentinel in localStorage means
 *    we won't re-prompt — but they can re-trigger it manually from
 *    Settings (future commit).
 *  - The banner is opinionated about the meaning: "we're moving your
 *    data to your device for privacy" — not "click to import for
 *    reasons unclear".
 */

import { useEffect, useState } from 'react';
import { TkxAlert, TkxButton } from 'tekivex-ui';
import { migrateServerResumesToLocal, type MigrationReport } from '@/src/lib/resume-store/migrate';
import { getAccessToken } from '@/src/lib/api';

type State = { phase: 'idle' | 'running' | 'done' | 'dismissed'; report: MigrationReport | null; error: string | null };

export default function LocalFirstMigrationBanner() {
  const [state, setState] = useState<State>({ phase: 'idle', report: null, error: null });

  useEffect(() => {
    if (!getAccessToken()) return;
    let cancelled = false;
    setState((s) => ({ ...s, phase: 'running' }));
    migrateServerResumesToLocal()
      .then((report) => {
        if (cancelled) return;
        setState({ phase: 'done', report, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ phase: 'done', report: null, error: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.phase === 'dismissed' || state.phase === 'idle') return null;
  if (state.phase === 'running') return null; // silent during the run; don't flash a "loading" banner
  if (!state.report && !state.error) return null;

  // Don't bother the user with success when there was nothing to migrate.
  if (state.report?.status === 'skipped' || state.report?.status === 'no-server-data') return null;

  return (
    <div style={wrapperStyle}>
      {state.error ? (
        <TkxAlert variant="danger">
          Couldn&apos;t move your resumes to local storage: {state.error}
        </TkxAlert>
      ) : state.report?.status === 'owner-mismatch' ? (
        <TkxAlert variant="danger">
          Local browser data belongs to a different account. To use this account on this device, clear local data in Settings or open a new browser profile.
        </TkxAlert>
      ) : state.report?.status === 'error' ? (
        <TkxAlert variant="danger">
          Some resumes didn&apos;t migrate. We&apos;ll retry on your next visit.
        </TkxAlert>
      ) : (
        <TkxAlert variant="info">
          We moved {state.report?.imported ?? 0} resume
          {state.report?.imported === 1 ? '' : 's'} to your device. From now on, your
          resume content lives in your browser — not on our servers.
          <TkxButton
            variant="outline"
            style={{ marginLeft: 12 }}
            onClick={() => setState((s) => ({ ...s, phase: 'dismissed' }))}
          >
            Got it
          </TkxButton>
        </TkxAlert>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  margin: '12px auto',
  maxWidth: 960,
  padding: '0 16px',
};
