'use client';

/**
 * Outcome Loop UI — surfaces per-version response/interview/offer rates so
 * the user can see which rewrite is actually working. Deliberately plain
 * and small: this is the "proof, not opinions" feature, so the numbers
 * carry the message — no decorative charts, no celebratory animations.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TkxAlert, TkxButton, TkxCard, TkxCardBody, TkxCardHeader } from 'tekivex-ui';
import {
  api,
  isApiRequestError,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    api.getResumeOutcomes(resumeId)
      .then(setReport)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [resumeId]);

  return (
    <main style={pageStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
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
      {loading && <p style={{ color: 'var(--muted, #888)' }}>Loading…</p>}

      {report && (
        <>
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

const pageStyle: React.CSSProperties = { padding: '32px 20px', maxWidth: 960, margin: '0 auto' };
const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--border, #ddd)', borderRadius: 6, background: 'var(--surface, #fff)', color: 'var(--ink, #222)' };
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
