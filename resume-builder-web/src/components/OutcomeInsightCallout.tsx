'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TkxStatistic, TkxTag } from 'tekivex-ui';
import { api, getAccessToken, type OutcomeReport } from '@/src/lib/api';

/**
 * R-035 — own-data outcome insight, shown at the moment of choice.
 *
 * "Your v3 has a 4.1% reply rate vs v1 at 2.6%" — rendered wherever
 * the user is about to make a resume decision (template picker,
 * tailor confirmation, versions list) so the Outcome Graph informs
 * the choice instead of living on a separate page.
 *
 * The honesty contract from the R-035 acceptance criteria:
 *   - OWN data only. No cohort numbers until aggregate sample sizes
 *     justify them (separate, later milestone).
 *   - Renders NOTHING unless the user's own data is statistically
 *     meaningful — `report.top.significant` (the server's threshold)
 *     AND a non-null baseline to compare against. An empty callout
 *     is better than a confident number derived from 2 applications.
 *   - Sample sizes are always visible next to the rates.
 *
 * Built on tekivex-ui (TkxStatistic for the two rates, TkxTag for
 * the lift badge) so it inherits the app's component language.
 */

export default function OutcomeInsightCallout({
  resumeId,
  /** Where this callout is mounted — adjusts the lead-in copy. */
  context = 'generic',
}: {
  resumeId: string | null;
  context?: 'template' | 'tailor' | 'versions' | 'generic';
}) {
  const [report, setReport] = useState<OutcomeReport | null>(null);

  useEffect(() => {
    if (!resumeId || !getAccessToken()) return;
    let cancelled = false;
    api
      .getResumeOutcomes(resumeId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => undefined); // insight is optional garnish — never error
    return () => { cancelled = true; };
  }, [resumeId]);

  // The honesty gate: render nothing without significant own data.
  const top = report?.top;
  const baseline = report?.baseline;
  if (!report || !top || !baseline || !top.significant) return null;
  if (top.versionId === baseline.versionId) return null;

  const LEAD: Record<string, string> = {
    template: 'Before you pick a layout — your own data says:',
    tailor: 'Worth knowing as you tailor:',
    versions: 'What your applications say:',
    generic: 'From your tracked applications:',
  };

  const pct = (rate: number) => Math.round(rate * 1000) / 10;

  return (
    <section
      className="card col-12"
      aria-label="Outcome insight from your own applications"
      style={{
        background: 'linear-gradient(180deg, #f3fbf6 0%, #ffffff 100%)',
        borderLeft: '4px solid #1e7a3a',
      }}
    >
      <p className="small" style={{ margin: '0 0 8px', color: '#3a4655', fontWeight: 600 }}>
        {LEAD[context]}
      </p>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TkxStatistic
          title={`${top.label || 'Top version'} (${top.applied} application${top.applied === 1 ? '' : 's'})`}
          value={pct(top.responseRate)}
          suffix="% replies"
          valueStyle={{ color: '#1e7a3a', fontWeight: 700 }}
          trend="up"
        />
        <TkxStatistic
          title={`${baseline.label || 'Baseline'} (${baseline.applied} application${baseline.applied === 1 ? '' : 's'})`}
          value={pct(baseline.responseRate)}
          suffix="% replies"
          valueStyle={{ color: '#5a6778' }}
        />
        {report.lift.multiplier && report.lift.multiplier > 1 ? (
          <TkxTag colorScheme="success" variant="subtle">
            {report.lift.multiplier.toFixed(1)}× more replies
          </TkxTag>
        ) : null}
      </div>
      <p className="small" style={{ margin: '10px 0 0', color: '#5a6778' }}>
        {report.lift.headline}{' '}
        <Link href={`/resume/outcomes?id=${encodeURIComponent(resumeId!)}`} style={{ color: '#1a3a5c' }}>
          Full breakdown →
        </Link>
      </p>
    </section>
  );
}
