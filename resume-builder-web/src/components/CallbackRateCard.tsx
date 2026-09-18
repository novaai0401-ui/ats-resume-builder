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
  // The moat, one line: which version actually gets replies. The API computes
  // the lift headline ("v3 gets 2.4× more replies than v1"); show it the
  // moment it exists so the Outcome Loop sells itself from the dashboard.
  // R-109 — show the comparison whenever the API produced one. Gating on
  // `multiplier` hid exactly the most decisive case: a ratio is undefined
  // when the baseline got zero callbacks, so "3 callbacks vs 0" never
  // reached the user.
  const liftHeadline = hasData && report?.lift?.deltaPoints !== null ? report?.lift?.headline || '' : '';

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
              ? `${overall!.positiveCallbacks} callback${overall!.positiveCallbacks === 1 ? '' : 's'} from ${overall!.applied} application${overall!.applied === 1 ? '' : 's'} · ${overall!.interviews} interview${overall!.interviews === 1 ? '' : 's'} · ${overall!.rejections} rejection${overall!.rejections === 1 ? '' : 's'}`
              : 'Track applications against your resume versions to measure what actually works — no other resume tool can tell you this.'}
          </div>
          {liftHeadline ? (
            <div className="small" style={{ marginTop: 4, color: 'var(--primary)', fontWeight: 600 }}>
              📈 {liftHeadline}
            </div>
          ) : null}
          {hasData ? (
            <div className="small" style={{ marginTop: 4, color: 'var(--muted)' }}>
              {/* R-109 — say where these outcomes came from. Almost all of
                  them are the user telling us what happened, which is
                  useful and is not independent confirmation. */}
              {report?.provenance && report.provenance.verified > 0
                ? `${report.provenance.verified} confirmed, ${report.provenance.selfReported + report.provenance.emailInferred} as you reported them.`
                : 'Based on the outcomes you recorded.'}
              {overall && !overall.significant ? ' Too few applications yet to read much into the rate.' : ''}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link className="btn secondary" href="/resume/outcomes">View Outcome Loop</Link>
        <Link className="btn" href="/recruiter-sim">Run AI screen</Link>
      </div>
    </section>
  );
}
