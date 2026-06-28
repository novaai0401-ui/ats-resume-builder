'use client';

/**
 * Dashboard callback-rate card. Surfaces the product's hero metric where users
 * land, plus quick entries into the Outcome Loop and the Recruiter-AI Simulator
 * so the two flagship features get discovered. Self-contained: fetches its own
 * outcomes for the given resume and degrades quietly when there's no data yet.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCallbackRate } from 'resume-builder-shared';
import { api, type OutcomeReport } from '@/src/lib/api';

export function CallbackRateCard({ resumeId }: { resumeId?: string }) {
  const [report, setReport] = useState<OutcomeReport | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!resumeId) {
      setReport(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    api.getResumeOutcomes(resumeId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => { if (!cancelled) setReport(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [resumeId]);

  const overall = report?.overall;
  const hasData = Boolean(overall && overall.applied > 0);
  const rate = overall ? formatCallbackRate(overall.callbackRate, overall.applied) : '—';

  return (
    <section
      className="card"
      data-testid="dashboard-callback-card"
      style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div>
          <div className="small" style={{ textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)' }}>
            Your callback rate
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05, color: 'var(--ink)' }}>
            {loaded ? rate : '…'}
          </div>
          <div className="small" style={{ color: 'var(--muted)' }}>
            {hasData
              ? `${overall!.applied} application${overall!.applied === 1 ? '' : 's'} · ${overall!.interviews} interview${overall!.interviews === 1 ? '' : 's'}`
              : 'Track applications against your resume versions to measure what actually works.'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn secondary" href="/resume/outcomes">View Outcome Loop</Link>
        <Link className="btn" href="/recruiter-sim">Run AI screen</Link>
      </div>
    </section>
  );
}
