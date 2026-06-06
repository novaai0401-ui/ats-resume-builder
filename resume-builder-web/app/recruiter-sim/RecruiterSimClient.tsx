'use client';

/**
 * Recruiter-AI Simulator — paste a JD, see the verdict an LLM hiring screen
 * would hand a recruiter. This is the differentiator: every competitor shows
 * a keyword score; we simulate the actual AI gate the resume now passes through.
 */

import { useState } from 'react';
import Link from 'next/link';
import { api, type RecruiterSimResult } from '@/src/lib/api';
import { useResumeStore } from '@/src/lib/resume-store';

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

const VERDICT_META: Record<RecruiterSimResult['verdict'], { label: string; color: string; bg: string; blurb: string }> = {
  advance: { label: 'Advance', color: '#147a3a', bg: 'rgba(22,163,74,0.12)', blurb: 'The AI screen would forward you to a human.' },
  maybe: { label: 'Borderline', color: '#b07906', bg: 'rgba(176,121,6,0.12)', blurb: 'On the fence — a recruiter would have to take a closer look.' },
  reject: { label: 'Reject', color: '#a8412c', bg: 'rgba(168,65,44,0.12)', blurb: 'The AI screen would likely filter you out for this role.' },
};

export default function RecruiterSimClient() {
  const resume = useResumeStore((state) => state.resume);
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [result, setResult] = useState<RecruiterSimResult | null>(null);

  const resumeText = buildResumeText(resume as never);
  const hasResume = resumeText.trim().length > 20;

  async function handleRun() {
    setError('');
    setPaywall(false);
    setResult(null);
    if (!hasResume) {
      setError('Build or upload a resume first — we need it to run the screen.');
      return;
    }
    if (jdText.trim().length < 50) {
      setError('Paste a longer job description (at least a couple of paragraphs).');
      return;
    }
    setLoading(true);
    try {
      const data = await api.recruiterSim({
        resumeText,
        jdText: jdText.trim(),
        currentSkills: resume?.skills ?? [],
      });
      setResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Simulation failed';
      if (/FREE_PLAN_AI_BLOCKED/i.test(message)) setPaywall(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1>Recruiter-AI Simulator</h1>
        <p className="small">
          More employers now run your resume through an AI screen before any human sees it. Paste the job
          description and see the verdict — and the reasoning — that screen would produce for you.
        </p>
      </section>

      <section className="card col-12">
        <label className="small" htmlFor="jd">Job description</label>
        <textarea
          id="jd"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          rows={10}
          placeholder="Paste the full job description here…"
          style={{ width: '100%', marginTop: 6, fontFamily: 'inherit', fontSize: 14, padding: 10 }}
        />
        {!hasResume && (
          <p className="small" style={{ color: '#a8412c' }}>
            No resume loaded. <Link href="/dashboard">Open a resume</Link> first.
          </p>
        )}
        {error && <p className="small" style={{ color: '#a8412c' }}>{error}</p>}
        <button className="btn" onClick={handleRun} disabled={loading} style={{ marginTop: 10 }}>
          {loading ? 'Running the screen…' : 'Run the AI screen'}
        </button>
      </section>

      {paywall && (
        <section className="card col-12" style={{ borderColor: '#b07906' }}>
          <h3>Unlock the Recruiter-AI Simulator</h3>
          <p className="small">This is a Student/Pro feature. Upgrade to see the verdict an AI screen would give you.</p>
          <Link className="btn" href="/billing">See plans</Link>
        </section>
      )}

      {result && (
        <>
          <section className="card col-12">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ padding: '6px 14px', borderRadius: 999, fontWeight: 700, color: VERDICT_META[result.verdict].color, background: VERDICT_META[result.verdict].bg }}>
                {VERDICT_META[result.verdict].label}
              </span>
              <span style={{ fontSize: 32, fontWeight: 800 }}>{result.score}<span style={{ fontSize: 16, color: '#7a8aa0' }}> / 100 fit</span></span>
              <span className="small" style={{ color: '#5a6778' }}>{VERDICT_META[result.verdict].blurb}</span>
            </div>
            <blockquote style={{ margin: '14px 0 0', padding: '10px 14px', borderLeft: '3px solid #3b6cf6', background: 'var(--surface-alt, #f5f7fa)', borderRadius: 6 }}>
              <strong>What the AI would tell the recruiter:</strong><br />“{result.recruiterNote}”
            </blockquote>
            {result.provider === 'rule-based' && (
              <p className="small" style={{ color: '#9aa7b8', marginTop: 8 }}>
                Offline estimate (AI provider unavailable) — based on keyword coverage.
              </p>
            )}
          </section>

          <section className="card col-6">
            <h3 style={{ color: '#147a3a' }}>Strengths the screen saw</h3>
            <ul>{result.strengths.map((s, i) => <li key={i} className="small">{s}</li>)}</ul>
          </section>

          <section className="card col-6">
            <h3 style={{ color: '#b07906' }}>Concerns</h3>
            <ul>{result.concerns.map((c, i) => <li key={i} className="small">{c}</li>)}</ul>
            {result.missingMustHaves.length > 0 && (
              <>
                <h4 style={{ marginBottom: 4, color: '#a8412c' }}>Missing must-haves</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.missingMustHaves.map((m, i) => (
                    <span key={i} style={{ padding: '2px 10px', borderRadius: 999, background: 'rgba(168,65,44,0.1)', color: '#a8412c', fontSize: 12 }}>{m}</span>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
