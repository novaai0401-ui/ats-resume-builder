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
import { handleFreeTrialError } from '@/src/lib/free-trial';

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
  const setResume = useResumeStore((state) => state.setResume);
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
  // R-098/R-099 — skills the user has pulled from the gap list into their
  // resume during this session, so the chip can confirm the write.
  const [addedSkills, setAddedSkills] = useState<string[]>([]);
  const [skillSaveError, setSkillSaveError] = useState('');

  useEffect(() => {
    setAuthed(Boolean(getAccessToken()));
    setActiveResumeId(readActiveResumeSelection() || null);
    // Home-page quick start hands off a pasted JD via localStorage.
    // Consume it once (read + remove) so a stale JD never reappears on
    // a later visit. Guarded: localStorage can throw in private mode/SSR.
    try {
      const pending = window.localStorage.getItem('rb_pending_jd');
      if (pending) {
        window.localStorage.removeItem('rb_pending_jd');
        setJdText(pending);
      }
    } catch { /* private mode / restricted storage — ignore */ }
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
      // R-098 — a spent free run opens the popup instead of an inline error.
      if (handleFreeTrialError(err)) {
        // The app-wide popup explains it — no inline error needed.
      } else if (/FREE_PLAN_AI_BLOCKED/i.test(message)) {
        setPaywall(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * R-099 — close the loop the JD-match report opens: a missing skill goes
   * into the resume in one tap instead of "now go type this yourself".
   *
   * The write is local-first (store update, so the editor and preview see it
   * immediately) and then persisted to the saved resume when one is active.
   * Truthfulness stays the user's call — the button is per-skill and the
   * copy says to add only what's actually true.
   */
  async function addSkill(skill: string) {
    const clean = skill.trim();
    if (!clean) return;
    setSkillSaveError('');
    const existing = resume?.skills ?? [];
    const already = existing.some((s) => s.trim().toLowerCase() === clean.toLowerCase());
    const nextSkills = already ? existing : [...existing, clean];
    if (!already) {
      setResume((prev) => ({ ...prev, skills: nextSkills }));
    }
    setAddedSkills((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    if (!activeResumeId || already) return;
    try {
      await api.updateResume(activeResumeId, { skills: nextSkills });
    } catch (err: unknown) {
      // The store already has it, so the editor still shows the skill — say
      // plainly that only the saved copy is behind (C-003).
      setSkillSaveError(
        err instanceof Error
          ? `Added here, but saving to your stored resume failed: ${err.message}`
          : 'Added here, but saving to your stored resume failed.',
      );
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
    // Logged-out: show a static worked example of the report so the page
    // sells the feature instead of dead-ending at a sign-in sentence.
    // Pure JSX — no API calls fire from this state.
    const sampleMatched = ['React', 'TypeScript', 'CSS', 'REST APIs'];
    const sampleMissing = ['Next.js', 'Accessibility (WCAG)', 'CI/CD'];
    const sampleBullet =
      'Migrated a legacy React app to Next.js with server-side rendering, cutting first-paint time by 40%.';
    return (
      <main className="grid">
        <section className="card col-12">
          <h1 style={{ marginBottom: 4 }}>JD Match Score</h1>
          <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
            Paste a job description, and we&rsquo;ll compare it against your resume: the keywords
            you cover, the ones you don&rsquo;t, and bullets you could add to close the gap.
            Here&rsquo;s what a report looks like:
          </p>
        </section>

        <section className="card col-12" data-testid="jd-match-sample" aria-label="Sample JD match report">
          <p className="small" style={{ margin: '0 0 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Sample output — Frontend Developer @ Acme (sample)
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div
              className="match-score-ring"
              style={{ borderColor: scoreColor(68), color: scoreColor(68) }}
              aria-label="Sample match score 68 out of 100"
            >
              <strong>68</strong>
              <small>%</small>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <h2 style={{ marginTop: 0, marginBottom: 6 }}>Decent fit, room to grow</h2>
              <p className="small" style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.55 }}>
                Based on the keywords in this JD, the sample resume covers <strong>4</strong> of{' '}
                <strong>7</strong> expected skills.
              </p>
            </div>
          </div>
          <h3 style={{ marginBottom: 6 }}>Already covered</h3>
          <div className="keyword-chips">
            {sampleMatched.map((kw) => (
              <span key={kw} className="ats-chip ats-chip--match">{kw}</span>
            ))}
          </div>
          <h3 style={{ marginBottom: 6 }}>Missing — work these in</h3>
          <div className="keyword-chips">
            {sampleMissing.map((kw) => (
              <span key={kw} className="ats-chip ats-chip--missing">{kw}</span>
            ))}
          </div>
          <h3 style={{ marginBottom: 6 }}>Suggested bullet to add</h3>
          <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
            <li className="bullet-rewrite-option">
              <span style={{ flex: 1 }}>{sampleBullet}</span>
            </li>
          </ul>
        </section>

        <section className="card col-12">
          <h2 style={{ marginTop: 0 }}>See this for YOUR resume — free</h2>
          <p className="small" style={{ marginTop: 0, color: 'var(--muted)' }}>
            Sign in (or create a free account) and we&rsquo;ll score any job description against
            your saved resume.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn" href="/auth/register?next=%2Fjd-match">Create free account</Link>
            <Link className="btn ghost" href="/auth/login?next=%2Fjd-match">Sign in</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ marginBottom: 4 }}>Skill gap: your resume vs. this job</h1>
        <p className="small" style={{ margin: '0 0 6px', color: 'var(--ink)', fontWeight: 600 }}>
          Paste the description for <em>this specific job</em> → see exactly which skills you&rsquo;re
          missing → add them in one tap.
        </p>
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          We compare the JD against your saved resume and show the keywords you cover, the ones
          you don&rsquo;t (each with an <strong>+ Add</strong> button that writes it into your
          resume), and three bullets you could add to close the gap.{' '}
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
            <section className="card col-12" data-testid="jd-missing-skills">
              <h3 style={{ marginTop: 0 }}>
                Missing skills — {result.missingKeywords.length} this job asks for that your resume doesn&rsquo;t show
              </h3>
              <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
                Tap <strong>+ Add</strong> to put a skill straight into your resume&rsquo;s skills
                section — add only the ones you can actually back up in an interview.
              </p>
              <div className="keyword-chips">
                {result.missingKeywords.map((kw) => {
                  const added = addedSkills.includes(kw.trim());
                  return (
                    <button
                      key={kw}
                      type="button"
                      className={`ats-chip ${added ? 'ats-chip--match' : 'ats-chip--missing'}`}
                      onClick={() => addSkill(kw)}
                      disabled={added}
                      aria-label={added ? `${kw} added to your resume skills` : `Add ${kw} to your resume skills`}
                      style={{ cursor: added ? 'default' : 'pointer', border: 'none', font: 'inherit' }}
                    >
                      {added ? `✓ ${kw} added` : `+ Add ${kw}`}
                    </button>
                  );
                })}
              </div>
              {addedSkills.length > 0 ? (
                <p className="small" style={{ marginBottom: 0 }}>
                  {addedSkills.length} skill{addedSkills.length === 1 ? '' : 's'} added
                  {activeResumeId ? ' and saved to your resume' : ''}.{' '}
                  <Link href="/resume" style={{ color: 'var(--primary)' }}>Open the editor</Link> to
                  back each one up with a bullet.
                </p>
              ) : null}
              {skillSaveError ? <p className="hint error" style={{ marginBottom: 0 }}>{skillSaveError}</p> : null}
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
