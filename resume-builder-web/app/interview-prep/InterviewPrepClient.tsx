'use client';

/**
 * Interview Prep Cards — AI feature.
 *
 * Generates 8 likely interview questions from the user's resume +
 * target role. Each card has the question, why it's asked, and an
 * answer outline (3 bullets).
 *
 * Usable with the user's own AI key (BYOK, free) or with CallbackCV
 * Plus. Users without either see a paywall card pointing them
 * to add a key in Settings or get Plus.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getAccessToken } from '@/src/lib/api';
import { useResumeStore } from '@/src/lib/resume-store';
import { loadByokKey } from '@/src/lib/byok-storage';
import { handleFreeTrialError } from '@/src/lib/free-trial';

type Card = {
  category: 'behavioral' | 'technical' | 'role-specific';
  question: string;
  whyAsked: string;
  answerOutline: string[];
};

const CATEGORY_LABEL: Record<Card['category'], string> = {
  behavioral: 'Behavioral',
  technical: 'Technical',
  'role-specific': 'Role-specific',
};

const CATEGORY_COLOR: Record<Card['category'], string> = {
  behavioral: '#1e7a3a',
  technical: '#1a3a5c',
  'role-specific': '#b07906',
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

export default function InterviewPrepClient() {
  const resume = useResumeStore((state) => state.resume);
  const [authed, setAuthed] = useState(false);
  const [plan, setPlan] = useState<'FREE' | 'STUDENT' | 'PRO'>('FREE');
  const [targetRole, setTargetRole] = useState('');
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [provider, setProvider] = useState<'groq' | 'rule-based' | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(getAccessToken()));
    setHasByok(Boolean(loadByokKey()));
    try {
      const stored = window.localStorage.getItem('rb_plan');
      if (stored === 'PRO' || stored === 'STUDENT' || stored === 'FREE') setPlan(stored);
    } catch { /* ignore */ }
  }, []);

  // Usable with CallbackCV Plus (the 'PRO' plan value) or BYOK key.
  const canUseAi = plan === 'PRO' || hasByok;
  const resumeText = buildResumeText(resume as never);
  const hasResume = resumeText.trim().length > 30;

  async function handleGenerate() {
    setError('');
    setPaywall(false);
    setCards([]);
    setProvider(null);
    if (!hasResume) {
      setError('Build or upload a resume first — interview prep cards are generated from it.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.interviewPrep({
        resumeText,
        targetRole: targetRole.trim() || undefined,
        jdText: jdText.trim() || undefined,
      });
      setCards(data.questions);
      setProvider(data.provider);
      setOpenIdx(0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      // R-098 — a spent free run opens the app-wide popup, not an inline error.
      if (handleFreeTrialError(err)) {
        // handled by the popup
      } else if (/PRO_PLAN_REQUIRED/i.test(message)) {
        setPaywall(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    // Logged-out: two static sample cards show exactly what the feature
    // produces (question + why it's asked + answer outline) before the
    // sign-in CTA. Pure JSX — no API calls fire from this state.
    const sampleCards: Card[] = [
      {
        category: 'behavioral',
        question: 'Tell me about a time you disagreed with a teammate about a technical decision.',
        whyAsked:
          'Interviewers use this to see how you handle conflict — whether you argue from evidence, listen, and commit to the outcome.',
        answerOutline: [
          'Set the scene: the decision at stake and why you disagreed (one sentence).',
          'Show your process: the data or prototype you brought to the discussion.',
          'Land the result: what the team chose, and what you learned either way.',
        ],
      },
      {
        category: 'technical',
        question: 'How would you improve the load time of a slow React page?',
        whyAsked:
          'A frontend staple: it reveals whether you can diagnose before optimizing, and whether you know the modern performance toolbox.',
        answerOutline: [
          'Measure first: Lighthouse / the Performance panel to find the actual bottleneck.',
          'Common wins: code-splitting, lazy-loading below-the-fold, memoizing hot renders.',
          'Verify: re-measure and watch Core Web Vitals, not just bundle size.',
        ],
      },
    ];
    return (
      <main className="grid">
        <section className="card col-12">
          <h1 style={{ marginBottom: 4 }}>
            Interview Prep Cards{' '}
            <span className="plan-badge plan-badge--pro" style={{ fontSize: 11 }}>AI</span>
          </h1>
          <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
            We generate 8 likely interview questions from your resume — each with why it&rsquo;s
            asked and a 3-bullet answer outline drawn from your actual experience. Two sample
            cards, for a frontend role:
          </p>
        </section>

        <section className="card col-12" data-testid="interview-prep-sample" aria-label="Sample interview prep cards">
          <p className="small" style={{ margin: '0 0 10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Sample
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {sampleCards.map((card, i) => (
              <li key={i} className="prep-card" data-open="true">
                <div className="prep-card__head">
                  <span
                    className="prep-card__category"
                    style={{ background: CATEGORY_COLOR[card.category] }}
                  >
                    {CATEGORY_LABEL[card.category]}
                  </span>
                  <span className="prep-card__question">{card.question}</span>
                </div>
                <div className="prep-card__body">
                  <p className="small" style={{ margin: '0 0 8px', color: '#5a6778' }}>
                    <strong>Why this is asked:</strong> {card.whyAsked}
                  </p>
                  <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Answer outline:</p>
                  <ul style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                    {card.answerOutline.map((bullet, b) => (
                      <li key={b}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card col-12">
          <h2 style={{ marginTop: 0 }}>See this for YOUR resume — free</h2>
          <p className="small" style={{ marginTop: 0, color: 'var(--muted)' }}>
            Sign in (or create a free account) to generate prep cards from your own resume and
            target role.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn" href="/auth/register?next=%2Finterview-prep">Create free account</Link>
            <Link className="btn ghost" href="/auth/login?next=%2Finterview-prep">Sign in</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ marginBottom: 4 }}>
          Interview Prep Cards{' '}
          <span className="plan-badge plan-badge--pro" style={{ fontSize: 11 }}>AI</span>
        </h1>
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          We&rsquo;ll generate 8 likely interview questions from your saved resume — three
          behavioral, three technical, two role-specific. Each card includes a 3-bullet answer
          outline drawn from your actual experience.
        </p>
      </section>

      {!canUseAi ? (
        <section
          className="card col-12"
          style={{
            background: 'linear-gradient(180deg, var(--surface) 0%, var(--card) 100%)',
            borderLeft: '4px solid var(--primary)',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Use AI for Interview Prep</h2>
          <p className="small" style={{ color: 'var(--ink)', lineHeight: 1.6, marginBottom: 12 }}>
            Add your own AI key in Settings (free) to use this now — or get CallbackCV Plus
            (₹499/mo) for our AI across every feature, with no per-download AI fee. Cancel anytime.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn primary" href="/settings">Add your AI key</Link>
            <Link className="btn" href="/billing">Get Plus</Link>
          </div>
        </section>
      ) : null}

      <section className="card col-12">
        <div className="mentor-form-grid">
          <div>
            <label className="label" htmlFor="target-role">Target role (optional)</label>
            <input
              id="target-role"
              className="input"
              type="text"
              placeholder="e.g. Senior Frontend Engineer"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="label" htmlFor="jd-context">Paste a JD (optional)</label>
            <textarea
              id="jd-context"
              className="input"
              rows={3}
              placeholder="Adds JD-specific questions to the cards…"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              style={{ resize: 'vertical', minHeight: 80 }}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={handleGenerate} disabled={loading || !canUseAi}>
            {loading ? 'Generating cards…' : 'Generate prep cards'}
          </button>
        </div>
        {error ? <p className="hint error" style={{ marginTop: 10 }}>{error}</p> : null}
        {paywall ? (
          <p className="small" style={{ marginTop: 10, color: 'var(--muted)' }}>
            <Link href="/settings">Add your AI key</Link> (free) or{' '}
            <Link href="/billing">get CallbackCV Plus</Link> to use Interview Prep.
          </p>
        ) : null}
      </section>

      {cards.length > 0 ? (
        <section className="card col-12">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{cards.length} prep cards</h2>
            <span className="small" style={{ color: 'var(--muted)' }}>
              {provider === 'groq' ? 'Powered by AI' : 'Rule-based — add an AI key or get Plus for tailored AI cards'}
            </span>
          </header>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {cards.map((card, i) => {
              const isOpen = openIdx === i;
              return (
                <li
                  key={i}
                  className="prep-card"
                  data-open={isOpen ? 'true' : 'false'}
                >
                  <button
                    type="button"
                    className="prep-card__head"
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                    aria-expanded={isOpen}
                  >
                    <span
                      className="prep-card__category"
                      style={{ background: CATEGORY_COLOR[card.category] }}
                    >
                      {CATEGORY_LABEL[card.category]}
                    </span>
                    <span className="prep-card__question">{card.question}</span>
                    <span className="prep-card__chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen ? (
                    <div className="prep-card__body">
                      <p className="small" style={{ margin: '0 0 8px', color: '#5a6778' }}>
                        <strong>Why this is asked:</strong> {card.whyAsked || '—'}
                      </p>
                      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Answer outline:</p>
                      <ul style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                        {card.answerOutline.map((bullet, b) => (
                          <li key={b}>{bullet}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Mock Interview — live back-and-forth with an AI interviewer that
          asks questions grounded in the resume, critiques each answer and
          offers a model answer. Available with BYOK or CallbackCV Plus. */}
      {canUseAi ? (
        <MockInterviewPanel resumeText={resumeText} targetRole={targetRole} jdText={jdText} />
      ) : null}
    </main>
  );
}

function MockInterviewPanel({ resumeText, targetRole, jdText }: { resumeText: string; targetRole: string; jdText: string }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const started = messages.length > 0;

  async function send(history: Array<{ role: 'user' | 'assistant'; content: string }>) {
    setBusy(true);
    setErr('');
    try {
      const res = await api.mockInterview({ messages: history, resumeText, targetRole: targetRole || undefined, jdText: jdText || undefined });
      setMessages([...history, { role: 'assistant', content: res.reply }]);
    } catch (e: unknown) {
      if (handleFreeTrialError(e)) return;
      setErr(e instanceof Error ? e.message : 'Mock interview failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card col-12" data-testid="mock-interview-panel">
      <h2 style={{ marginTop: 0 }}>Mock Interview</h2>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
        The AI plays the interviewer: it asks questions from <em>your</em> resume, critiques each
        answer, and shows a stronger model answer. Practice out loud, then type what you said.
      </p>
      {!started ? (
        <button className="btn" disabled={busy} onClick={() => void send([])}>
          {busy ? 'Setting up the room…' : 'Start mock interview'}
        </button>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  justifySelf: m.role === 'user' ? 'end' : 'start',
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: m.role === 'user' ? 'var(--surface)' : 'var(--surface-alt)',
                  border: '1px solid var(--border)',
                  whiteSpace: 'pre-wrap',
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                {m.content}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea
              className="input"
              rows={3}
              style={{ flex: 1 }}
              placeholder="Type your answer… (or ask to stop for a readiness summary)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
            />
            <button
              className="btn"
              disabled={busy || !draft.trim()}
              onClick={() => {
                const next = [...messages, { role: 'user' as const, content: draft.trim() }];
                setDraft('');
                void send(next);
              }}
            >
              {busy ? 'Thinking…' : 'Send'}
            </button>
          </div>
        </>
      )}
      {err ? <p className="hint error" style={{ marginTop: 8 }}>{err}</p> : null}
    </section>
  );
}
