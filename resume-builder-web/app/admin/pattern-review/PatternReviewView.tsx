'use client';

/**
 * Admin Pattern Review — human-in-the-loop for the PatternLearnerAgent.
 *
 * Workflow:
 *   1. Browse low-confidence parse failures (left).
 *   2. Pick a "kind" (e.g. contact.phone) and click "Propose" — the
 *      backend asks the LLM to draft a regex and runs it through the
 *      sandboxed validator against the corpus.
 *   3. Validation result + metrics show inline. Promote (live) or reject.
 *   4. Right panel: registry of all patterns by status. Rollback is one
 *      click and invalidates the live cache immediately.
 */

import { useEffect, useState } from 'react';
import DataLoader from '@/src/components/DataLoader';
import {
  TkxAlert,
  TkxButton,
  TkxCard,
  TkxCardBody,
  TkxCardHeader,
} from 'tekivex-ui';
import {
  api,
  isApiRequestError,
  isCurrentUserAdmin,
  type LearnedPattern,
  type ParseFailureSample,
} from '@/src/lib/api';

const PATTERN_KINDS = [
  'contact.phone',
  'contact.location',
  'education.degree',
  'education.institution',
  'experience.dateRange',
  'experience.roleLine',
  'experience.companyLine',
  'section.heading',
  'skills.delimiter',
] as const;

export default function PatternReviewView() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [failures, setFailures] = useState<ParseFailureSample[]>([]);
  const [patterns, setPatterns] = useState<LearnedPattern[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [patternFilter, setPatternFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ParseFailureSample | null>(null);

  useEffect(() => {
    if (!isCurrentUserAdmin()) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    setAllowed(true);
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, p] = await Promise.all([
        api.listPatternFailures(statusFilter || undefined),
        api.listLearnedPatterns(patternFilter || undefined),
      ]);
      setFailures(f);
      setPatterns(p);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, statusFilter, patternFilter]);

  if (allowed === null) return null;
  if (!allowed) {
    return <main style={pageStyle}><TkxAlert variant="danger">Admin access required.</TkxAlert></main>;
  }

  return (
    <main style={{ ...pageStyle, maxWidth: 1280 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Pattern Review <span style={{ fontWeight: 400, color: 'var(--muted, #888)', fontSize: 14 }}>· PatternLearnerAgent</span></h2>
        <TkxButton variant="outline" onClick={refresh}>Refresh</TkxButton>
      </header>

      {error && <TkxAlert variant="danger" style={{ marginBottom: 12 }}>{error}</TkxAlert>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <TkxCard>
          <TkxCardHeader>
            <strong>Failure samples</strong>
            <div style={{ marginTop: 8 }}>
              <FilterPill label="Open" active={statusFilter === 'open'} onClick={() => setStatusFilter('open')} />
              <FilterPill label="Proposed" active={statusFilter === 'proposed'} onClick={() => setStatusFilter('proposed')} />
              <FilterPill label="Promoted" active={statusFilter === 'promoted'} onClick={() => setStatusFilter('promoted')} />
              <FilterPill label="All" active={statusFilter === ''} onClick={() => setStatusFilter('')} />
            </div>
          </TkxCardHeader>
          <TkxCardBody>
            {loading && <DataLoader label="Loading review queue…" mode="inline" />}
            {!loading && failures.length === 0 && (
              <p style={{ color: 'var(--muted, #888)' }}>No samples for this filter.</p>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {failures.map((f) => (
                <li
                  key={f.id}
                  onClick={() => setSelected(f)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    marginBottom: 6,
                    background: selected?.id === f.id ? 'rgba(0,120,255,0.08)' : 'var(--surface-alt, #fafafa)',
                    border: '1px solid var(--border, #eee)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <strong>{f.fileName || '(no filename)'}</strong>
                    <span style={{ color: 'var(--muted, #888)' }}>{new Date(f.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #666)', marginTop: 2 }}>
                    confidence {(f.verification.confidence ?? 0).toFixed(2)} · {f.verification.issues?.length ?? 0} issues · {f.status}
                  </div>
                </li>
              ))}
            </ul>
          </TkxCardBody>
        </TkxCard>

        {selected ? (
          <FailureDetail
            sample={selected}
            onChanged={() => { refresh(); }}
          />
        ) : (
          <TkxCard><TkxCardBody><p style={{ color: 'var(--muted, #888)' }}>Pick a sample to review.</p></TkxCardBody></TkxCard>
        )}
      </div>

      <section style={{ marginTop: 24 }}>
        <TkxCard>
          <TkxCardHeader>
            <strong>Learned patterns</strong>
            <div style={{ marginTop: 8 }}>
              <FilterPill label="Proposed" active={patternFilter === 'proposed'} onClick={() => setPatternFilter('proposed')} />
              <FilterPill label="Promoted" active={patternFilter === 'promoted'} onClick={() => setPatternFilter('promoted')} />
              <FilterPill label="Rejected" active={patternFilter === 'rejected'} onClick={() => setPatternFilter('rejected')} />
              <FilterPill label="All" active={patternFilter === ''} onClick={() => setPatternFilter('')} />
            </div>
          </TkxCardHeader>
          <TkxCardBody>
            <PatternTable patterns={patterns} onChanged={refresh} />
          </TkxCardBody>
        </TkxCard>
      </section>
    </main>
  );
}

function FailureDetail({ sample, onChanged }: { sample: ParseFailureSample; onChanged: () => void }) {
  const [kind, setKind] = useState<string>('contact.phone');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ pattern: LearnedPattern; validation: { ok: boolean; reason?: string; metrics: Record<string, number> } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const propose = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.proposeLearnedPattern(sample.id, kind);
      setResult(r);
      onChanged();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <TkxCard>
      <TkxCardHeader>
        <strong>{sample.fileName || 'sample'}</strong>
        <div style={{ fontSize: 12, color: 'var(--muted, #666)' }}>
          confidence {(sample.verification.confidence ?? 0).toFixed(2)} · {sample.status}
        </div>
      </TkxCardHeader>
      <TkxCardBody>
        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>Verification issues ({sample.verification.issues?.length ?? 0})</summary>
          <ul style={{ fontSize: 13, color: 'var(--muted, #666)', marginTop: 6 }}>
            {(sample.verification.issues || []).map((i, idx) => (
              <li key={idx}><code>{i.kind}</code>: {i.detail}</li>
            ))}
          </ul>
        </details>

        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>Redacted text</summary>
          <pre style={{ background: 'var(--surface-alt, #f7f7f7)', padding: 10, fontSize: 12, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {sample.redactedText}
          </pre>
        </details>

        <label style={labelStyle}>Propose a pattern for kind</label>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
          {PATTERN_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <TkxButton onClick={propose} disabled={busy} style={{ marginTop: 10 }}>
          {busy ? 'Asking the model…' : 'Propose pattern'}
        </TkxButton>

        {error && <TkxAlert variant="danger" style={{ marginTop: 10 }}>{error}</TkxAlert>}

        {result && (
          <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--border, #ddd)', borderRadius: 6 }}>
            <div style={{ fontSize: 13, color: result.validation.ok ? 'green' : 'crimson', fontWeight: 600 }}>
              {result.validation.ok ? 'Validated — safe to promote' : `Rejected by validator: ${result.validation.reason}`}
            </div>
            <pre style={{ background: 'var(--surface-alt, #f7f7f7)', padding: 8, marginTop: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
              /{result.pattern.pattern}/{result.pattern.flags}
            </pre>
            {result.pattern.rationale && (
              <p style={{ fontSize: 12, color: 'var(--muted, #666)', margin: '6px 0' }}>
                <em>{result.pattern.rationale}</em>
              </p>
            )}
            <div style={{ fontSize: 12, color: 'var(--muted, #666)' }}>
              metrics: precision {(result.validation.metrics.precision ?? 0).toFixed(2)} · recall {(result.validation.metrics.recall ?? 0).toFixed(2)} · regressions {result.validation.metrics.regressionCount ?? 0} · corpus {result.validation.metrics.sampleSize ?? 0}
            </div>
            {result.validation.ok && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <TkxButton onClick={async () => { await api.promoteLearnedPattern(result.pattern.id); onChanged(); setResult(null); }}>Promote</TkxButton>
                <TkxButton variant="outline" onClick={async () => { await api.rejectLearnedPattern(result.pattern.id); onChanged(); setResult(null); }}>Reject</TkxButton>
              </div>
            )}
          </div>
        )}
      </TkxCardBody>
    </TkxCard>
  );
}

function PatternTable({ patterns, onChanged }: { patterns: LearnedPattern[]; onChanged: () => void }) {
  if (patterns.length === 0) {
    return <p style={{ color: 'var(--muted, #888)' }}>No patterns for this filter.</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #ddd)' }}>
          <th style={th}>Kind</th>
          <th style={th}>Pattern</th>
          <th style={th}>Metrics</th>
          <th style={th}>Status</th>
          <th style={th}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {patterns.map((p) => (
          <tr key={p.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
            <td style={td}><code>{p.kind}</code></td>
            <td style={td}>
              <code style={{ fontSize: 12 }}>/{p.pattern}/{p.flags}</code>
              {p.rationale && <div style={{ color: 'var(--muted, #666)', fontSize: 12, marginTop: 2 }}>{p.rationale}</div>}
            </td>
            <td style={td}>
              {p.metrics ? (
                <span style={{ fontSize: 12 }}>
                  p {(p.metrics.precision ?? 0).toFixed(2)} · r {(p.metrics.recall ?? 0).toFixed(2)} · reg {p.metrics.regressionCount ?? 0}
                </span>
              ) : '—'}
            </td>
            <td style={td}>{p.status}</td>
            <td style={td}>
              {p.status === 'proposed' && (
                <>
                  <TkxButton onClick={async () => { await api.promoteLearnedPattern(p.id); onChanged(); }}>Promote</TkxButton>{' '}
                  <TkxButton variant="outline" onClick={async () => { await api.rejectLearnedPattern(p.id); onChanged(); }}>Reject</TkxButton>
                </>
              )}
              {p.status === 'promoted' && (
                <TkxButton variant="outline" onClick={async () => { await api.rollbackLearnedPattern(p.id); onChanged(); }}>Rollback</TkxButton>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginRight: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid var(--border, #ddd)',
        background: active ? 'rgba(0,120,255,0.12)' : 'transparent',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >{label}</button>
  );
}

const pageStyle: React.CSSProperties = { padding: '32px 20px', margin: '0 auto' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border, #ddd)', borderRadius: 6, fontSize: 14, background: 'var(--surface, #fff)', color: 'var(--ink, #222)' };
const th: React.CSSProperties = { padding: '8px 6px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'top' };

function extractErrorMessage(err: unknown): string {
  if (isApiRequestError(err)) return err.message || 'Something went wrong.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
