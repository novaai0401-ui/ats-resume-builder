'use client';

import { useState } from 'react';
import Link from 'next/link';
import { isApiRequestError, publicAtsCheck, type PublicAtsCheckResult } from '@/src/lib/api';
import { TkxTextarea } from 'tekivex-ui';

const MAX_CHARS = 20_000;

const BAND_LABELS: Record<PublicAtsCheckResult['band'], string> = {
  strong: 'Strong — likely to pass most ATS filters',
  promising: 'Promising — a few fixes away',
  'needs-work': 'Needs work — key signals are missing',
  'at-risk': 'At risk — an ATS may filter this out',
};

const BAND_COLORS: Record<PublicAtsCheckResult['band'], string> = {
  strong: '#16a34a',
  promising: '#65a30d',
  'needs-work': '#d97706',
  'at-risk': '#dc2626',
};

export default function AtsCheckWidget() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublicAtsCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  async function onCheck() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Paste your resume text first.');
      return;
    }
    setBusy(true);
    setError(null);
    setRateLimited(false);
    try {
      setResult(await publicAtsCheck(trimmed.slice(0, MAX_CHARS)));
    } catch (err) {
      setResult(null);
      if (isApiRequestError(err)) {
        setRateLimited(err.status === 429 || err.status === 403);
        setError(err.message || 'ATS check failed. Please try again.');
      } else {
        setError('ATS check failed. Please check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 18 }} aria-labelledby="try-ats-check">
      <h2 id="try-ats-check" style={{ marginTop: 0 }}>Try it now — free, no account</h2>
      <p className="small">
        Paste your resume text below (from your PDF or DOCX) and get a real ATS score plus the top
        issues in seconds. Nothing is stored — the text is scored in memory and discarded. Prefer to
        upload the file itself? <Link href="/auth/register">Sign up free</Link> to upload PDF/DOCX
        with full parsing.
      </p>
      {/* Label hidden visually — the paragraph above already explains what to
       * paste, so a heading would repeat it. Screen readers keep the name,
       * which is what the old aria-label provided. */}
      <div className="hide-field-label" style={{ marginTop: 8 }}>
        <TkxTextarea
          label="Resume text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHARS}
          minRows={10}
          placeholder="Paste your resume text here…"
          style={{ width: '100%' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn" type="button" onClick={onCheck} disabled={busy}>
          {busy ? 'Checking…' : 'Check my resume'}
        </button>
        <span className="small">{text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters</span>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)' }}>
          <p className="small" style={{ margin: 0 }}>{error}</p>
          {rateLimited && (
            <Link className="btn" href="/auth/register" style={{ marginTop: 8, display: 'inline-flex' }}>
              Create a free account for unlimited checks
            </Link>
          )}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              aria-label={`ATS score ${result.atsScore} out of 100`}
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                background: `conic-gradient(${BAND_COLORS[result.band]} ${result.atsScore * 3.6}deg, #e5e7eb 0deg)`,
              }}
            >
              <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--card-bg, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <strong style={{ fontSize: 24 }}>{result.atsScore}</strong>
                <span className="small">/ 100</span>
              </div>
            </div>
            <div>
              <strong style={{ color: BAND_COLORS[result.band] }}>{BAND_LABELS[result.band]}</strong>
              {result.missingSections.length > 0 && (
                <p className="small" style={{ margin: '4px 0 0' }}>
                  Missing sections: {result.missingSections.join(', ')}
                </p>
              )}
            </div>
          </div>

          {result.topIssues.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Top issues to fix</h3>
              <ul className="small" style={{ marginTop: 6, paddingLeft: 20 }}>
                {result.topIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="small" style={{ marginTop: 10, opacity: 0.8 }}>{result.disclaimer}</p>

          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid #d1d5db' }}>
            <strong>Want these fixed for you?</strong>
            <p className="small" style={{ margin: '4px 0 8px' }}>
              Create a free account to fix these with AI, see the literal recruiter view an ATS
              extracts, and track whether the fixes actually raise your callback rate.
            </p>
            <Link className="btn" href="/auth/register">Create a free account</Link>
          </div>
        </div>
      )}
    </section>
  );
}
