'use client';

/**
 * Recruiter-AI Simulator — paste a JD, see the verdict an LLM hiring screen
 * would hand a recruiter. This is the differentiator: every competitor shows
 * a keyword score; we simulate the actual AI gate the resume now passes through.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TkxButton, TkxTextarea } from 'tekivex-ui';
import { presentVerdict } from 'resume-builder-shared';
import { api, getAccessToken, type RecruiterSimResult } from '@/src/lib/api';
import { useResumeStore } from '@/src/lib/resume-store';
import { buildAddKeywordLink } from '@/src/lib/bullet-deeplink';
import { readActiveResumeSelection } from '@/src/lib/resume-flow';
import { handleFreeTrialError } from '@/src/lib/free-trial';

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

export default function RecruiterSimClient() {
  const storeResume = useResumeStore((state) => state.resume);
  // The Zustand store is in-memory and empty after navigating here from another
  // tab. Fall back to the active resume the user last opened (persisted in
  // sessionStorage) by fetching it from the API so the screen actually loads.
  const [fetchedResume, setFetchedResume] = useState<typeof storeResume | null>(null);
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RecruiterSimResult | null>(null);

  const storeText = buildResumeText(storeResume as never);
  const resume = storeText.trim().length > 20 ? storeResume : fetchedResume;

  useEffect(() => {
    if (storeText.trim().length > 20) return; // store already has a resume
    const activeId = readActiveResumeSelection();
    if (!activeId || !getAccessToken()) return;
    let cancelled = false;
    api.getResume(activeId)
      .then((r) => { if (!cancelled) setFetchedResume(r as never); })
      .catch(() => { /* leave the "open a resume first" prompt */ });
    return () => { cancelled = true; };
  }, [storeText]);

  const resumeText = buildResumeText(resume as never);
  const hasResume = resumeText.trim().length > 20;

  async function handleRun() {
    setError('');
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
      // R-098 — a spent free run opens the app-wide popup, not an inline error.
      if (handleFreeTrialError(err)) return;
      const message = err instanceof Error ? err.message : 'Simulation failed';
      setError(message);
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
        <TkxTextarea
          id="jd"
          label="Job description"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          minRows={10}
          placeholder="Paste the full job description here…"
          style={{ width: '100%', marginTop: 6 }}
        />
        {!hasResume && (
          <p className="small" style={{ color: '#a8412c' }}>
            No resume loaded. <Link href="/dashboard">Open a resume</Link> first.
          </p>
        )}
        {error && <p className="small" style={{ color: '#a8412c' }}>{error}</p>}
        <TkxButton onClick={handleRun} disabled={loading} style={{ marginTop: 10 }}>
          {loading ? 'Running the screen…' : 'Run the AI screen'}
        </TkxButton>
      </section>

      {result && (() => {
        const v = presentVerdict(result.verdict);
        return (
        <>
          <section className="card col-12">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ padding: '6px 14px', borderRadius: 999, fontWeight: 700, color: v.color, background: v.background }}>
                {v.label}
              </span>
              <span style={{ fontSize: 32, fontWeight: 800 }}>{result.score}<span style={{ fontSize: 16, color: 'var(--muted)' }}> / 100 fit</span></span>
              <span className="small" style={{ color: 'var(--muted)' }}>{v.blurb}</span>
            </div>
            <blockquote style={{ margin: '14px 0 0', padding: '10px 14px', borderLeft: '3px solid var(--primary)', background: 'var(--surface-alt, #f5f7fa)', borderRadius: 6 }}>
              <strong>What the AI would tell the recruiter:</strong><br />“{result.recruiterNote}”
            </blockquote>
            {result.provider === 'rule-based' && (
              <p className="small" style={{ color: 'var(--muted)', marginTop: 8 }}>
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
                <p className="small" style={{ margin: '0 0 6px', color: 'var(--muted)' }}>
                  Tap one to jump into the editor and work it into a bullet with the AI rewriter.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.missingMustHaves.map((m, i) => {
                    const href = buildAddKeywordLink(m, readActiveResumeSelection() || undefined);
                    const pill = (
                      <span style={{ padding: '2px 10px', borderRadius: 999, background: 'rgba(168,65,44,0.1)', color: '#a8412c', fontSize: 12, cursor: href ? 'pointer' : 'default' }}>
                        {m} {href ? '→' : ''}
                      </span>
                    );
                    return href
                      ? <Link key={i} href={href} style={{ textDecoration: 'none' }}>{pill}</Link>
                      : <span key={i}>{pill}</span>;
                  })}
                </div>
              </>
            )}
          </section>
        </>
        );
      })()}
    </main>
  );
}
