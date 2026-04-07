'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TkxButton, TkxCard, TkxCardBody, TkxAlert } from 'tekivex-ui';
import { api, type AtsScoreResult } from '@/src/lib/api';
import { persistActiveResumeSelection, resolveCurrentSessionResumeId } from '@/src/lib/resume-flow';
import { buildReviewAtsSuggestionSections } from '@/src/lib/review-ats';

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
        <TkxCard as="section" className="col-12" padding="lg">
          <TkxCardBody>
            <h2>ATS Review</h2>
            <p style={{ fontSize: '0.9rem' }}>Select a saved resume or upload a new one to run ATS.</p>
            <TkxButton onClick={() => router.push('/resume')}>Back to Editor</TkxButton>
          </TkxCardBody>
        </TkxCard>
      </main>
    );
  }

  return (
    <main className="grid">
      <TkxCard as="section" className="col-12" padding="lg">
        <TkxCardBody>
          <div className="editor-header">
            <div>
              <h2>ATS Review</h2>
              <p style={{ fontSize: '0.9rem' }}>Resume id: {resumeId}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <TkxButton variant="outline" onClick={() => router.push(`/resume?id=${encodeURIComponent(resumeId)}`)}>
                Back to Review
              </TkxButton>
              <TkxButton onClick={() => runScore()} isLoading={loading} loadingText="Running...">
                Re-run ATS
              </TkxButton>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>
              Job Description (optional)
            </label>
            <textarea
              style={{ width: '100%', minHeight: 120, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d9e3ec', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste a job description or list target roles for ATS matching"
            />
          </div>

          {error && <TkxAlert variant="danger" style={{ marginTop: 12 }}>{error}</TkxAlert>}

          {score && (
            <TkxCard style={{ marginTop: 16 }} padding="md">
              <TkxCardBody>
                <h3 style={{ marginTop: 0 }}>Current ATS Result</h3>
                <p style={{ fontSize: '0.9rem' }}>Role level: {score.roleLevel}</p>
                <p style={{ fontSize: '0.9rem' }}>ATS score: {score.roleAdjustedScore}</p>
                <p style={{ fontSize: '0.9rem' }}>Base score: {score.atsScore}</p>

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
                    {section.body && <p style={{ fontSize: '0.9rem', marginTop: 0, marginBottom: 8 }}>{section.body}</p>}
                    {section.actionText && (
                      <p style={{ fontSize: '0.9rem', marginTop: 0, marginBottom: 8 }}><strong>{section.actionText}</strong></p>
                    )}
                    {section.items.length > 0 && (
                      <ul style={{ marginTop: 0 }}>
                        {section.items.map((item, itemIdx) => <li key={`section-item-${idx}-${itemIdx}`}>{item}</li>)}
                      </ul>
                    )}
                    {section.examples?.length ? (
                      <>
                        <p style={{ fontSize: '0.9rem', marginBottom: 6 }}>Examples</p>
                        <ul style={{ marginTop: 0 }}>
                          {section.examples.map((item, itemIdx) => <li key={`section-example-${idx}-${itemIdx}`}>{item}</li>)}
                        </ul>
                      </>
                    ) : null}
                  </div>
                )) : <p style={{ fontSize: '0.9rem' }}>No major suggestions.</p>}
              </TkxCardBody>
            </TkxCard>
          )}
        </TkxCardBody>
      </TkxCard>
    </main>
  );
}
