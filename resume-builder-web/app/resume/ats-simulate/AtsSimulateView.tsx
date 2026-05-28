'use client';

/**
 * ATS Simulator UI — shows the literal text a real ATS will hand to a
 * recruiter, plus the parse risks that would degrade that view.
 *
 * UX philosophy: the recruiter view is the centerpiece. Risks are listed
 * alongside, sorted high → low. Confidence number is honest, not gamified.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TkxAlert, TkxCard, TkxCardBody, TkxCardHeader } from 'tekivex-ui';
import {
  api,
  isApiRequestError,
  type AtsSimulationResult,
  type AtsSimulationRisk,
} from '@/src/lib/api';

type ResumeRow = { id: string; title?: string | null };

export default function AtsSimulateView() {
  const sp = useSearchParams();
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [resumeId, setResumeId] = useState(sp.get('resumeId') || '');
  const [result, setResult] = useState<AtsSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = (await api.listResumes()) as ResumeRow[];
        setResumes(list);
        if (!resumeId && list.length > 0) setResumeId(list[0].id);
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
    api.simulateAts(resumeId)
      .then(setResult)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [resumeId]);

  return (
    <main style={pageStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>ATS Simulator</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted, #888)', fontSize: 14 }}>
            What the recruiter actually sees after the ATS strips your resume. Not a keyword score — the real text.
          </p>
        </div>
        <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} style={selectStyle}>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>{r.title || r.id.slice(0, 8)}</option>
          ))}
        </select>
      </header>

      {error && <TkxAlert variant="danger">{error}</TkxAlert>}
      {loading && <p style={{ color: 'var(--muted, #888)' }}>Simulating…</p>}

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 20 }}>
          <TkxCard>
            <TkxCardHeader>
              <strong>Recruiter view</strong>
              <div style={{ fontSize: 12, color: 'var(--muted, #666)', marginTop: 4 }}>
                Confidence: <strong style={{ color: confidenceColor(result.confidence) }}>{result.confidence}/100</strong>
              </div>
            </TkxCardHeader>
            <TkxCardBody>
              <pre style={recruiterPreStyle}>{result.recruiterView || '(empty — your resume has no extractable content)'}</pre>
            </TkxCardBody>
          </TkxCard>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TkxCard>
              <TkxCardHeader><strong>Parse risks ({result.risks.length})</strong></TkxCardHeader>
              <TkxCardBody>
                {result.risks.length === 0 ? (
                  <p style={{ color: 'var(--muted, #888)', fontSize: 14 }}>No risks detected — this resume should parse cleanly.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
                    {result.risks.map((r, idx) => (
                      <RiskItem key={idx} risk={r} />
                    ))}
                  </ul>
                )}
              </TkxCardBody>
            </TkxCard>

            <TkxCard>
              <TkxCardHeader><strong>Fields the ATS captured</strong></TkxCardHeader>
              <TkxCardBody>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    {result.fields.map((f, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                        <td style={{ padding: '6px 6px', fontWeight: 600, verticalAlign: 'top', width: 130 }}>{f.label}</td>
                        <td style={{ padding: '6px 6px', color: f.missing ? 'crimson' : 'var(--ink, #222)' }}>
                          {f.missing ? '(missing)' : truncateForTable(f.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TkxCardBody>
            </TkxCard>
          </div>
        </div>
      )}
    </main>
  );
}

function RiskItem({ risk }: { risk: AtsSimulationRisk }) {
  return (
    <li style={{ padding: '8px 0', borderBottom: '1px solid var(--border, #f0f0f0)' }}>
      <span style={severityPillStyle(risk.severity)}>{risk.severity}</span>
      <code style={{ fontSize: 11, color: 'var(--muted, #666)', marginLeft: 6 }}>{risk.kind}</code>
      <div style={{ marginTop: 4 }}>{risk.detail}</div>
    </li>
  );
}

function severityPillStyle(severity: AtsSimulationRisk['severity']): React.CSSProperties {
  const colors = {
    high: { bg: 'rgba(220,38,38,0.12)', fg: '#b91c1c' },
    medium: { bg: 'rgba(217,119,6,0.12)', fg: '#92400e' },
    low: { bg: 'rgba(100,116,139,0.12)', fg: '#475569' },
  } as const;
  const c = colors[severity];
  return {
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: 999,
    background: c.bg,
    color: c.fg,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
  };
}

function confidenceColor(score: number): string {
  if (score >= 85) return '#147a3a';
  if (score >= 65) return '#92400e';
  return '#b91c1c';
}

function truncateForTable(value: string): string {
  if (value.length <= 120) return value;
  return value.slice(0, 117) + '…';
}

const pageStyle: React.CSSProperties = { padding: '32px 20px', maxWidth: 1160, margin: '0 auto' };
const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--border, #ddd)', borderRadius: 6, background: 'var(--surface, #fff)', color: 'var(--ink, #222)' };
const recruiterPreStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.6,
  padding: 16,
  background: 'var(--surface-alt, #f7f7f7)',
  borderRadius: 6,
  border: '1px solid var(--border, #eee)',
  maxHeight: '70vh',
  overflow: 'auto',
};

function extractErrorMessage(err: unknown): string {
  if (isApiRequestError(err)) return err.message || 'Something went wrong.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
