'use client';

/**
 * JD Match Score — paste a JD, see how well your resume matches.
 *
 * Surface design:
 *   • Big circular score in the centre (0–100). Colour shifts from
 *     red (<40) → amber (40–69) → green (≥70) so the value reads at
 *     a glance.
 *   • Two chip lists: matched (green) and missing (red).
 *   • Three suggested bullets the user can copy with one tap. We
 *     deliberately don't auto-apply them — picking the right
 *     experience entry is the user's call.
 *
 * Free users see a paywall card describing what they'd unlock.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getAccessToken } from '@/src/lib/api';
import { useResumeStore } from '@/src/lib/resume-store';
import { readActiveResumeSelection } from '@/src/lib/resume-flow';
import TailorDiffPanel from './TailorDiffPanel';
import AiTrustNote from '@/src/components/AiTrustNote';

type MatchResult = {
  matchPercent: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  bulletSuggestions: string[];
  provider: 'groq' | 'rule-based';
};

function buildResumeText(resume: { summary?: string; skills?: string[]; experience?: Array<{ company?: string; role?: string; highlights?: string[] }> } | null): string {
  if (!resume) return '';
  const parts: string[] = [];
  if (resume.summary) parts.push(resume.summary);
  if (resume.skills?.length) parts.push(`Skills: ${resume.skills.join(', ')}`);
  for (const exp of resume.experience ?? []) {
    parts.push(`${exp.role ?? ''} at ${exp.company ?? ''}: ${(exp.highlights ?? []).join(' ')}`);
  }
  return parts.filter(Boolean).join('\n');
}

function scoreColor(percent: number): string {
  if (percent >= 70) return '#1e7a3a';
  if (percent >= 40) return '#b07906';
  return '#a8412c';
}

export default function JdMatchClient() {
  const resume = useResumeStore((state) => state.resume);
  const [authed, setAuthed] = useState(false);
  // R-034: the tailor flow needs the persisted resumeId (the same one
  // the editor uses) so it can write back a tailored ResumeVersion.
  // Read on mount instead of every render to avoid an SSR mismatch.
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null);
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    setAuthed(Boolean(getAccessToken()));
    setActiveResumeId(readActiveResumeSelection() || null);
  }, []);

  const resumeText = buildResumeText(resume as never);
  const hasResume = resumeText.trim().length > 20;

  async function handleScore() {
    setError('');
    setPaywall(false);
    setResult(null);
    if (!hasResume) {
      setError('Build or upload a resume first — we need it to compare against the JD.');
      return;
    }
    if (jdText.trim().length < 50) {
      setError('Paste a longer job description (at least a couple of paragraphs).');
      return;
    }
    setLoading(true);
    try {
      const data = await api.jdMatch({
        resumeText,
        jdText: jdText.trim(),
        currentSkills: resume?.skills ?? [],
      });
      setResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Match failed';
      if (/FREE_PLAN_AI_BLOCKED/i.test(message)) {
        setPaywall(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyBullet(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      // Clipboard API can fail on iOS Safari without user-gesture
      // permission. Fall back to a temporary textarea + execCommand.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* give up */ }
      ta.remove();
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    }
  }

  if (!authed) {
    return (
      <main className="grid">
        <section className="card col-12">
          <h1>JD Match Score</h1>
          <p className="small">Sign in to compare your resume against a job description.</p>
          <Link className="btn" href="/auth/login">Sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ marginBottom: 4 }}>JD Match Score</h1>
        <p className="small" style={{ margin: '0 0 6px', color: 'var(--ink)', fontWeight: 600 }}>
          Does your resume match <em>this specific job</em>?
        </p>
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          Paste a job description below. We&rsquo;ll compare it against your saved resume and show
          you the keywords you cover, the ones you don&rsquo;t, and three bullets you could add
          to close the gap.{' '}
          <span style={{ color: 'var(--muted)' }}>
            Different from <a href="/resume/ats" style={{ color: 'var(--primary)' }}>ATS Score</a>, which checks whether your resume <em>format</em> parses cleanly — no JD needed for that.
          </span>
        </p>
        <AiTrustNote />
      </section>

      <section className="card col-12">
        <label className="label" htmlFor="jd-text">Job description</label>
        <textarea
          id="jd-text"
          className="input"
          rows={10}
          placeholder="Paste the full job description here…"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          style={{ resize: 'vertical', minHeight: 200 }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={handleScore} disabled={loading}>
            {loading ? 'Matching…' : 'Match against my resume'}
          </button>
          {jdText ? (
            <button className="btn ghost" onClick={() => { setJdText(''); setResult(null); setError(''); setPaywall(false); }}>
              Clear
            </button>
          ) : null}
        </div>
        {error ? <p className="hint error" style={{ marginTop: 10 }}>{error}</p> : null}
      </section>

      {paywall ? (
        <section
          className="card col-12"
          style={{
            background: 'linear-gradient(180deg, var(--surface-alt) 0%, var(--card) 100%)',
            borderLeft: '4px solid var(--primary)',
          }}
        >
          <h2 style={{ marginTop: 0 }}>AI JD matching needs AI access</h2>
          <p className="small" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
            Add your own AI key in Settings (free), or get the ₹499/mo plan, for AI-tailored
            matching. Without either, a rule-based match score is shown.
          </p>
          <Link className="btn" href="/settings">Add your AI key</Link>
        </section>
      ) : null}

      {result ? (
        <>
          <section className="card col-12" aria-label="Match score">
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div
                className="match-score-ring"
                style={{ borderColor: scoreColor(result.matchPercent), color: scoreColor(result.matchPercent) }}
                aria-label={`Match score ${result.matchPercent} out of 100`}
              >
                <strong>{result.matchPercent}</strong>
                <small>%</small>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>
                  {result.matchPercent >= 70 ? 'Strong match' : result.matchPercent >= 40 ? 'Decent fit, room to grow' : 'Needs targeted edits'}
                </h2>
                <p className="small" style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.55 }}>
                  Based on the keywords in this JD, your resume covers{' '}
                  <strong>{result.matchedKeywords.length}</strong> of{' '}
                  <strong>{result.matchedKeywords.length + result.missingKeywords.length}</strong> expected skills.
                  {' '}
                  <span style={{ color: 'var(--muted)' }}>
                    {result.provider === 'groq' ? 'Powered by AI.' : 'Rule-based scoring.'}
                  </span>
                </p>
              </div>
            </div>
          </section>

          {result.matchedKeywords.length > 0 ? (
            <section className="card col-12">
              <h3 style={{ marginTop: 0 }}>Already covered</h3>
              <div className="keyword-chips">
                {result.matchedKeywords.map((kw) => (
                  <span key={kw} className="ats-chip ats-chip--match">{kw}</span>
                ))}
              </div>
            </section>
          ) : null}

          {result.missingKeywords.length > 0 ? (
            <section className="card col-12">
              <h3 style={{ marginTop: 0 }}>Missing — work these in</h3>
              <div className="keyword-chips">
                {result.missingKeywords.map((kw) => (
                  <span key={kw} className="ats-chip ats-chip--missing">{kw}</span>
                ))}
              </div>
            </section>
          ) : null}

          {result.bulletSuggestions.length > 0 ? (
            <section className="card col-12">
              <h3 style={{ marginTop: 0 }}>Suggested bullets to add</h3>
              <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
                Tap to copy. Paste into the most relevant experience entry on your resume —
                pick the bullet only if it&rsquo;s factually true for you.
              </p>
              <ul style={{ paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8, margin: 0 }}>
                {result.bulletSuggestions.map((bullet, i) => (
                  <li key={i} className="bullet-rewrite-option">
                    <span style={{ flex: 1 }}>{bullet}</span>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => copyBullet(bullet, i)}
                    >
                      {copiedIdx === i ? 'Copied!' : 'Copy'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* R-034 — one-click tailor against this same JD. Renders
              under the suggestion list because the user has just seen
              the gap and is most likely to want a structured rewrite
              right at this moment. */}
          <TailorDiffPanel resumeId={activeResumeId} jdText={jdText} />
        </>
      ) : null}
    </main>
  );
}
