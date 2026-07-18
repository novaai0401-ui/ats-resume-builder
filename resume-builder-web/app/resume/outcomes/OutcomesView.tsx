'use client';

/**
 * Outcome Loop UI — the product's hero surface. Leads with the CALLBACK RATE
 * (the one number the whole brand is built around), then a score-history trend
 * that answers "did my ATS score going up actually move my callback rate?",
 * then per-version detail. "Proof, not opinions."
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { TkxAlert, TkxButton, TkxCard, TkxCardBody, TkxCardHeader } from 'tekivex-ui';
import { computeAbInsight, buildAbBars } from '@/src/lib/outcome-ab';
import DataLoader from '@/src/components/DataLoader';
import {
  api,
  isApiRequestError,
  type JobBenchmark,
  type OutcomeReport,
  type OutcomeVersionStats,
} from '@/src/lib/api';

type ResumeRow = { id: string; title?: string | null };

export default function OutcomesView() {
  const searchParams = useSearchParams();
  const initialResumeId = searchParams.get('resumeId') || '';
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [resumeId, setResumeId] = useState(initialResumeId);
  const [report, setReport] = useState<OutcomeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [benchmark, setBenchmark] = useState<JobBenchmark | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listResumes();
        setResumes(list as ResumeRow[]);
        if (!resumeId && list.length > 0) setResumeId((list[0] as ResumeRow).id);
      } catch (err) {
        setError(extractErrorMessage(err));
      }
    })();
    // Benchmark is account-level (all your applications), not per-resume.
    api.getJobBenchmark().then(setBenchmark).catch(() => setBenchmark(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    setShareUrl(null);
    setCopied(false);
    api.getResumeOutcomes(resumeId)
      .then(setReport)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [resumeId]);

  async function handleShare() {
    if (!resumeId) return;
    setSharing(true);
    setError(null);
    try {
      const { token } = await api.shareResumeOutcomes(resumeId);
      const url = `${window.location.origin}/share/outcome/${token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        // Clipboard may be blocked; the link is shown for manual copy.
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSharing(false);
    }
  }

  return (
    <main style={pageStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Outcome Loop</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted, #888)', fontSize: 14 }}>
            Which version of your resume is actually getting replies. Proof, not opinions.
          </p>
        </div>
        <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} style={selectStyle}>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>{r.title || r.id.slice(0, 8)}</option>
          ))}
        </select>
      </header>

      {error && <TkxAlert variant="danger">{error}</TkxAlert>}
      {loading && <DataLoader label="Loading outcome metrics…" />}

      {report && (
        <>
          {/* HERO — the callback rate the entire product is built around. */}
          <TkxCard style={{ marginBottom: 16 }}>
            <TkxCardBody>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--muted, #5a6778)' }}>
                    Your callback rate
                  </div>
                  <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, color: 'var(--ink, #10243a)' }}>
                    {report.overall.significant ? `${(report.overall.callbackRate * 100).toFixed(0)}%` : '—'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted, #5a6778)' }}>
                    {report.overall.applied} application{report.overall.applied === 1 ? '' : 's'} tracked
                    {!report.overall.significant && ` · need ${5 - report.overall.applied} more for a stable rate`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 18 }}>
                  <HeroStat label="Responses" value={report.overall.responses} />
                  <HeroStat label="Interviews" value={report.overall.interviews} />
                  <HeroStat label="Offers" value={report.overall.offers} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <TkxButton onClick={handleShare} disabled={sharing || report.overall.applied === 0}>
                    {sharing ? 'Creating link…' : 'Share my results'}
                  </TkxButton>
                  {shareUrl && (
                    <div style={{ fontSize: 12, color: 'var(--muted, #5a6778)', maxWidth: 280, wordBreak: 'break-all', textAlign: 'right' }}>
                      {copied ? '✓ Link copied — ' : ''}
                      <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
                    </div>
                  )}
                </div>
              </div>
            </TkxCardBody>
          </TkxCard>

          {benchmark && <BenchmarkCard benchmark={benchmark} />}

          {/* SCORE HISTORY — ATS score vs. observed callback rate over versions. */}
          {report.scoreHistory.length >= 2 && (
            <TkxCard style={{ marginBottom: 16 }}>
              <TkxCardHeader><strong>Score vs. callback rate over time</strong></TkxCardHeader>
              <TkxCardBody>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <LineChart data={scoreHistoryChartData(report)} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #eee)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="ATS score" stroke="#3b6cf6" strokeWidth={2} connectNulls dot />
                      <Line type="monotone" dataKey="Callback %" stroke="#16a34a" strokeWidth={2} connectNulls dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--muted, #888)' }}>
                  Callback % only plots versions with at least 5 applications. If your score climbs but callbacks don&apos;t,
                  the resume is winning the robot and losing the recruiter.
                </p>
              </TkxCardBody>
            </TkxCard>
          )}

          <TkxCard style={{ marginBottom: 16 }}>
            <TkxCardBody>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{report.lift.headline}</div>
              {/* Always-visible explainer so a user who lands here with
                  no data understands exactly what this page does and
                  what they need to do to see numbers. Without this
                  copy a junior user sees "Not enough data yet" with
                  no path forward. */}
              <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-alt, #f5f7fa)', borderRadius: 8, fontSize: 13, color: 'var(--ink, #1b2b3c)' }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>How this page works</strong>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
                  <li>On the <strong>Versions</strong> tab, snapshot your resume before each rewrite (e.g. &quot;v1 senior pitch&quot;, &quot;v2 with AWS keywords&quot;).</li>
                  <li>On the <strong>Jobs</strong> tab, when you log an application, link it to the version you used.</li>
                  <li>As you move that application through <em>Phone screen → Interview → Offer</em>, this page tells you which version is actually winning replies.</li>
                </ol>
                <p style={{ margin: '8px 0 0', color: 'var(--muted, #5a6778)' }}>Nothing is calculated from anywhere except your own tracker — no scraping, no third parties.</p>
              </div>
              {report.unattributed > 0 && (
                <p style={{ marginTop: 10, color: 'var(--muted, #666)', fontSize: 13 }}>
                  {report.unattributed} application{report.unattributed === 1 ? '' : 's'} have no version attached.
                  Open the job in the Jobs tab and pick which version of this resume you used.
                </p>
              )}
            </TkxCardBody>
          </TkxCard>

          <AbComparisonCard versions={report.versions} />

          <TkxCard>
            <TkxCardHeader><strong>By version</strong></TkxCardHeader>
            <TkxCardBody>
              {report.versions.length === 0 ? (
                <p style={{ color: 'var(--muted, #888)' }}>No snapshots yet. Snapshot a version before each rewrite to track its results.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #ddd)' }}>
                      <th style={th}>Version</th>
                      <th style={th}>Applied</th>
                      <th style={th}>Response rate</th>
                      <th style={th}>Interview rate</th>
                      <th style={th}>Offers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.versions.map((v) => (
                      <VersionRow key={v.versionId} v={v} isTop={report.top?.versionId === v.versionId} />
                    ))}
                  </tbody>
                </table>
              )}
              <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted, #888)' }}>
                Versions need at least 5 applications before rates are treated as meaningful.
              </p>
            </TkxCardBody>
          </TkxCard>
        </>
      )}
    </main>
  );
}

/**
 * "How you compare" — response rate vs. the platform median, powered only by
 * anonymized outcome data. Honest gating: shows a locked state (never fake
 * numbers) until the caller and the community cohort clear the thresholds.
 * Phrasing is deliberately supportive either side of the median.
 */
function BenchmarkCard({ benchmark }: { benchmark: JobBenchmark }) {
  const { available, yours, platform, reason } = benchmark;
  return (
    <TkxCard style={{ marginBottom: 16 }} data-testid="benchmark-card">
      <TkxCardHeader><strong>How you compare</strong></TkxCardHeader>
      <TkxCardBody>
        {available && platform ? (
          <>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
              Median response rate across CallbackCV users:{' '}
              <strong>{platform.medianResponseRatePct}%</strong> — yours is{' '}
              <strong>{yours.responseRatePct}%</strong>{' '}
              <span style={{ color: 'var(--muted, #5a6778)', fontSize: 13 }}>
                ({yours.responses} response{yours.responses === 1 ? '' : 's'} across {yours.applications} applications)
              </span>
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted, #5a6778)' }}>
              {yours.responseRatePct >= platform.medianResponseRatePct
                ? 'You’re ahead of the community median — whatever you’re doing, keep doing it.'
                : 'You’re below the median right now — most users who iterate on their top version close this gap. Try snapshotting a new version and comparing.'}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted, #888)' }}>
              Based on anonymized aggregates from {platform.cohortUsers} users with 5+ tracked applications. No individual data is ever shared.
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted, #5a6778)' }}>
            {reason || 'Community benchmarks unlock as more outcomes are logged (needs 10+ users with 5+ tracked applications).'}
          </p>
        )}
      </TkxCardBody>
    </TkxCard>
  );
}

/**
 * A/B comparison — the premium analytics headline. A stat tile
 * ("v1 gets 2.4× more replies than v2") plus a single-hue response-rate
 * bar per version (magnitude encoding: one measure, one color; identity
 * is carried by the row label, never by hue). All numbers come from
 * computeAbInsight/buildAbBars, which refuse low-sample claims.
 */
function AbComparisonCard({ versions }: { versions: OutcomeVersionStats[] }) {
  const insight = computeAbInsight(versions);
  const bars = buildAbBars(versions);
  if (!bars.length) return null;

  return (
    <TkxCard data-testid="ab-comparison-card">
      <TkxCardHeader><strong>Which version wins replies?</strong></TkxCardHeader>
      <TkxCardBody>
        {insight ? (
          insight.aboutTheSame ? (
            <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.5 }}>
              <strong>{insight.best.label}</strong> and <strong>{insight.baseline.label}</strong>{' '}
              are performing about the same so far — keep logging applications to separate them.
            </p>
          ) : (
            <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.5 }}>
              <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {insight.multiplier}×
              </span>{' '}
              more replies — <strong>{insight.best.label}</strong> out-performs{' '}
              <strong>{insight.baseline.label}</strong>{' '}
              ({Math.round(insight.best.responseRate * 100)}% vs {Math.round(insight.baseline.responseRate * 100)}% response rate).
            </p>
          )
        ) : (
          <p style={{ margin: '0 0 14px', color: 'var(--muted, #888)', fontSize: 14 }}>
            Once two versions each have 5+ logged applications, this card shows which one actually
            wins more replies.
          </p>
        )}

        <div role="img" aria-label="Response rate by resume version" style={{ display: 'grid', gap: 8 }}>
          {bars.map((b) => (
            <div key={b.versionId} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 180px) 1fr', gap: 10, alignItems: 'center' }}>
              <span
                style={{ fontSize: 13, color: 'var(--ink, #222)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={b.label}
              >
                {b.label}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: `${b.widthPct}%`,
                    height: 14,
                    borderRadius: 4,
                    background: b.significant ? 'var(--primary, #4f46e5)' : 'var(--border, #cbd5e1)',
                    minWidth: 6,
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--muted, #666)', whiteSpace: 'nowrap' }}>
                  {Math.round(b.responseRate * 100)}% · {b.applied} applied{b.significant ? '' : ' · low sample'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </TkxCardBody>
    </TkxCard>
  );
}

function VersionRow({ v, isTop }: { v: OutcomeVersionStats; isTop: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
      <td style={td}>
        <strong>{v.label}</strong>
        {isTop && <span style={badgeStyle}>top</span>}
        {!v.significant && <span style={{ ...badgeStyle, background: 'var(--surface-alt, #f0f0f0)', color: 'var(--muted, #666)' }}>low sample</span>}
        <div style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{new Date(v.createdAt).toLocaleDateString()}</div>
      </td>
      <td style={td}>{v.applied}</td>
      <td style={td}>{formatRate(v.responseRate, v.significant)}</td>
      <td style={td}>{formatRate(v.interviewRate, v.significant)}</td>
      <td style={td}>{v.offers}</td>
    </tr>
  );
}

function formatRate(rate: number, significant: boolean): string {
  if (!significant) return '—';
  return `${(rate * 100).toFixed(0)}%`;
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink, #10243a)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted, #5a6778)' }}>{label}</div>
    </div>
  );
}

function scoreHistoryChartData(report: OutcomeReport) {
  return report.scoreHistory.map((p) => ({
    label: p.label.length > 14 ? `${p.label.slice(0, 13)}…` : p.label,
    'ATS score': p.atsScore,
    'Callback %': p.callbackRate === null ? null : Math.round(p.callbackRate * 100),
  }));
}

const pageStyle: React.CSSProperties = { padding: '32px 20px', maxWidth: 960, margin: '0 auto' };
const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--border, #ddd)', borderRadius: 6, background: 'var(--surface, #fff)', color: 'var(--ink, #222)', maxWidth: '100%' };
const th: React.CSSProperties = { padding: '8px 6px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '10px 6px', verticalAlign: 'top' };
const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 8,
  padding: '1px 8px',
  borderRadius: 999,
  background: 'rgba(0,160,80,0.12)',
  color: '#147a3a',
  fontSize: 11,
  fontWeight: 600,
};

function extractErrorMessage(err: unknown): string {
  if (isApiRequestError(err)) return err.message || 'Something went wrong.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
