'use client';

/**
 * LinkedIn Profile Optimizer.
 *
 * Paste your LinkedIn profile text → get an overall score ring, a
 * per-section scorecard (Headline / About / Experience / Skills) with
 * concrete findings + fixes, and — when AI access is available — an
 * honest suggested headline, About rewrite, and skills, each copy-to-
 * clipboard.
 *
 * The honesty layer is the differentiator: AI suggestions are strictly
 * grounded in what was pasted (see the service system prompt), and the
 * AiTrustNote badge surfaces that promise (C-003).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getAccessToken } from '@/src/lib/api';
import AiTrustNote from '@/src/components/AiTrustNote';

type Finding = { severity: 'good' | 'warn' | 'critical'; message: string; fix: string };
type Section = {
  name: 'Headline' | 'About' | 'Experience' | 'Skills';
  score: number;
  findings: Finding[];
};
type OptimizeResult = {
  overallScore: number;
  band: 'strong' | 'decent' | 'needs-work';
  sections: Section[];
  suggestedHeadline?: string;
  suggestedAbout?: string;
  suggestedSkills?: string[];
  provider: 'groq' | 'rule-based';
};

function scoreColor(score: number): string {
  if (score >= 75) return '#1e7a3a';
  if (score >= 50) return '#b07906';
  return '#a8412c';
}

function bandLabel(band: OptimizeResult['band']): string {
  if (band === 'strong') return 'Strong profile';
  if (band === 'decent') return 'Decent — room to grow';
  return 'Needs work';
}

function severityClass(severity: Finding['severity']): string {
  if (severity === 'good') return 'ats-chip--match';
  if (severity === 'critical') return 'ats-chip--missing';
  return '';
}

export default function LinkedInOptimizeClient() {
  const [authed, setAuthed] = useState(false);
  const [profileText, setProfileText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rateLimited, setRateLimited] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setAuthed(Boolean(getAccessToken()));
  }, []);

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* give up */ }
      ta.remove();
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  async function handleAnalyze() {
    setError('');
    setRateLimited(false);
    setResult(null);
    if (profileText.trim().length < 40) {
      setError('Paste more of your LinkedIn profile — copy the page (Ctrl+A) and paste it here.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.linkedInOptimize({ profileText: profileText.trim() });
      setResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      if (/rate limit/i.test(message) || /429/.test(message)) {
        setRateLimited(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    return (
      <main className="grid">
        <section className="card col-12">
          <h1 style={{ marginBottom: 4 }}>LinkedIn Profile Optimizer</h1>
          <p className="small" style={{ marginTop: 0, color: 'var(--muted)' }}>
            Paste your LinkedIn profile and get a section-by-section score with specific fixes —
            and honest AI rewrites that never invent facts. Sign in (free) to run it on your profile.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn" href="/auth/register?next=%2Flinkedin">Create free account</Link>
            <Link className="btn ghost" href="/auth/login?next=%2Flinkedin">Sign in</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ marginBottom: 4 }}>LinkedIn Profile Optimizer</h1>
        <p className="small" style={{ margin: '0 0 6px', color: 'var(--ink)', fontWeight: 600 }}>
          Is your LinkedIn profile pulling its weight?
        </p>
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          Open your LinkedIn profile, select all (Ctrl+A / Cmd+A), copy, and paste it below. We&rsquo;ll
          score your Headline, About, Experience, and Skills and tell you exactly what to fix.
        </p>
        <AiTrustNote />
      </section>

      <section className="card col-12">
        <label className="label" htmlFor="li-text">Your LinkedIn profile</label>
        <textarea
          id="li-text"
          className="input"
          rows={12}
          placeholder="Paste your full LinkedIn profile text here…"
          value={profileText}
          onChange={(e) => setProfileText(e.target.value)}
          style={{ resize: 'vertical', minHeight: 220 }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={handleAnalyze} disabled={loading}>
            {loading ? 'Analyzing…' : 'Analyze my LinkedIn'}
          </button>
          {profileText ? (
            <button className="btn ghost" onClick={() => { setProfileText(''); setResult(null); setError(''); setRateLimited(false); }}>
              Clear
            </button>
          ) : null}
        </div>
        {error ? <p className="hint error" style={{ marginTop: 10 }}>{error}</p> : null}
      </section>

      {rateLimited ? (
        <section
          className="card col-12"
          style={{ background: 'linear-gradient(180deg, var(--surface-alt) 0%, var(--card) 100%)', borderLeft: '4px solid var(--primary)' }}
        >
          <h2 style={{ marginTop: 0 }}>You&rsquo;ve run this a lot in a short window</h2>
          <p className="small" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
            Give it a minute and try again. If you&rsquo;ve hit your free daily AI limit, add your own AI key
            in Settings (free) or get the ₹499/mo plan for unlimited.
          </p>
          <Link className="btn" href="/settings">Add your AI key</Link>
        </section>
      ) : null}

      {result ? (
        <>
          <section className="card col-12" aria-label="Overall score">
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div
                className="match-score-ring"
                style={{ borderColor: scoreColor(result.overallScore), color: scoreColor(result.overallScore) }}
                aria-label={`Overall score ${result.overallScore} out of 100`}
              >
                <strong>{result.overallScore}</strong>
                <small>/100</small>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>{bandLabel(result.band)}</h2>
                <p className="small" style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.55 }}>
                  Section-by-section breakdown below.{' '}
                  <span>{result.provider === 'groq' ? 'AI rewrites included.' : 'Rule-based scoring.'}</span>
                </p>
              </div>
            </div>
          </section>

          {result.sections.map((section) => (
            <section className="card col-12" key={section.name} aria-label={`${section.name} score`}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>{section.name}</h3>
                <span style={{ fontWeight: 700, color: scoreColor(section.score) }}>{section.score}/100</span>
              </div>
              <ul style={{ paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8, margin: '10px 0 0' }}>
                {section.findings.map((finding, i) => (
                  <li key={i} style={{ display: 'grid', gap: 4 }}>
                    <span>
                      <span className={`ats-chip ${severityClass(finding.severity)}`} style={{ marginRight: 8 }}>
                        {finding.severity === 'good' ? 'Good' : finding.severity === 'critical' ? 'Fix' : 'Improve'}
                      </span>
                      {finding.message}
                    </span>
                    {finding.fix ? (
                      <span className="small" style={{ color: 'var(--muted)' }}>→ {finding.fix}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {result.suggestedHeadline ? (
            <section className="card col-12">
              <h3 style={{ marginTop: 0 }}>Suggested headline</h3>
              <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                <li className="bullet-rewrite-option">
                  <span style={{ flex: 1 }}>{result.suggestedHeadline}</span>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => copyText(result.suggestedHeadline!, 'headline')}>
                    {copiedKey === 'headline' ? 'Copied!' : 'Copy'}
                  </button>
                </li>
              </ul>
            </section>
          ) : null}

          {result.suggestedAbout ? (
            <section className="card col-12">
              <h3 style={{ marginTop: 0 }}>Suggested About</h3>
              <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                <li className="bullet-rewrite-option" style={{ alignItems: 'flex-start' }}>
                  <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{result.suggestedAbout}</span>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => copyText(result.suggestedAbout!, 'about')}>
                    {copiedKey === 'about' ? 'Copied!' : 'Copy'}
                  </button>
                </li>
              </ul>
            </section>
          ) : null}

          {result.suggestedSkills?.length ? (
            <section className="card col-12">
              <h3 style={{ marginTop: 0 }}>Suggested skills</h3>
              <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
                Only skills your profile already demonstrates — add the ones that are true for you.
              </p>
              <div className="keyword-chips">
                {result.suggestedSkills.map((skill) => (
                  <span key={skill} className="ats-chip">{skill}</span>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="btn ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => copyText(result.suggestedSkills!.join(', '), 'skills')}>
                  {copiedKey === 'skills' ? 'Copied!' : 'Copy all'}
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
