'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type AtsScoreResult } from '@/src/lib/api';
import { persistActiveResumeSelection, resolveCurrentSessionResumeId } from '@/src/lib/resume-flow';
import { buildReviewAtsSuggestionSections } from '@/src/lib/review-ats';
import DataLoader from '@/src/components/DataLoader';

export default function ResumeAtsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = resolveCurrentSessionResumeId((searchParams.get('id') || '').trim());
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [score, setScore] = useState<AtsScoreResult | null>(null);
  const suggestionSections = buildReviewAtsSuggestionSections(score);

  const runScore = useCallback(async () => {
    if (!resumeId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.atsScore(resumeId, jdText || undefined);
      setScore(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to compute ATS score.');
    } finally {
      setLoading(false);
    }
  }, [resumeId, jdText]);

  useEffect(() => {
    if (!resumeId) return;
    persistActiveResumeSelection(resumeId);
  }, [resumeId]);

  useEffect(() => {
    runScore().catch(() => undefined);
  }, [runScore]);

  if (!resumeId) {
    return (
      <main className="grid">
        <section className="card col-12">
          <h2>ATS Review</h2>
          <p className="small">Select a saved resume or upload a new one to run ATS.</p>
          <button className="btn" onClick={() => router.push('/resume')}>Back to Editor</button>
        </section>
      </main>
    );
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <div className="editor-header">
          <div>
            <h2>ATS Review</h2>
            <p className="small" style={{ margin: '4px 0 4px', color: 'var(--ink)', fontWeight: 600 }}>
              Will an ATS <em>parse</em> your resume correctly?
            </p>
            <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
              Checks format, structure, headings, dates, action verbs. JD is <em>optional</em> here — the score works without it.
            </p>
            <p
              className="small"
              style={{
                margin: '10px 0 0',
                padding: '8px 12px',
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--primary)',
                lineHeight: 1.5,
              }}
            >
              <strong>Three different scans, one purpose each:</strong><br />
              <strong>ATS Score / Re-run ATS (this page)</strong> — does an ATS <em>parse</em> your resume cleanly? Format, dates, headings, action verbs.<br />
              <strong>AI Critique (in the editor)</strong> — section-by-section rewrite suggestions powered by AI on paid plans, rule-based on Free.<br />
              <strong><a href="/jd-match" style={{ color: 'var(--primary)' }}>JD Match</a></strong> — paste a specific JD, see which of its keywords your resume covers.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn secondary" onClick={() => router.push(`/resume?id=${encodeURIComponent(resumeId)}`)}>
              Back to Review
            </button>
            <button
              className="btn"
              onClick={() => runScore()}
              disabled={loading}
              aria-busy={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 130 }}
            >
              {loading ? (
                <DataLoader mode="inline" label="Running…" />
              ) : (
                'Re-run ATS'
              )}
            </button>
          </div>
        </div>

        <label className="label" style={{ marginTop: 12 }}>Job Description (optional)</label>
        <textarea
          className="input"
          style={{ minHeight: 120 }}
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="Paste a job description or list target roles for ATS matching"
        />

        {error && (
          <div className="message-banner" style={{ marginTop: 12 }}>
            <p className="small">{error}</p>
          </div>
        )}

        {score && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Current ATS Result</h3>
            <p className="small">Role level: {score.roleLevel}</p>
            <p className="small">ATS score: {score.roleAdjustedScore}</p>
            <p className="small">Base score: {score.atsScore}</p>

            <h4 style={{ marginBottom: 6 }}>Rejection Reasons</h4>
            <ul>
              {score.rejectionReasons.length
                ? score.rejectionReasons.map((item, idx) => <li key={`reason-${idx}`}>{item}</li>)
                : <li>No blocking reasons detected.</li>}
            </ul>

            <h4 style={{ marginBottom: 6 }}>Suggestions</h4>
            {suggestionSections.length ? suggestionSections.map((section, idx) => (
              <div key={`suggestion-section-${idx}`} style={{ marginBottom: idx === suggestionSections.length - 1 ? 0 : 16 }}>
                <h5 style={{ marginBottom: 6 }}>{section.title}</h5>
                {section.body && (
                  <p className="small" style={{ marginTop: 0, marginBottom: 8 }}>{section.body}</p>
                )}
                {section.actionText && (
                  <p className="small" style={{ marginTop: 0, marginBottom: 8 }}>
                    <strong>{section.actionText}</strong>
                  </p>
                )}
                {section.items.length > 0 && (
                  <ul style={{ marginTop: 0 }}>
                    {section.items.map((item, itemIdx) => <li key={`section-item-${idx}-${itemIdx}`}>{item}</li>)}
                  </ul>
                )}
                {section.examples?.length ? (
                  <>
                    <p className="small" style={{ marginBottom: 6 }}>Examples</p>
                    <ul style={{ marginTop: 0 }}>
                      {section.examples.map((item, itemIdx) => <li key={`section-example-${idx}-${itemIdx}`}>{item}</li>)}
                    </ul>
                  </>
                ) : null}
              </div>
            )) : <p className="small">No major suggestions.</p>}
          </div>
        )}
      </section>
    </main>
  );
}
