'use client';

/**
 * Mentor Chat — Pro-only chat UI.
 *
 * Conversation lives in memory only (no localStorage). On every send
 * we:
 *   1. Optimistically append the user message.
 *   2. POST the full history + resume + recent job applications.
 *   3. Append the assistant reply when it lands.
 *
 * The "stateless server, full-history per request" pattern is what
 * the API expects. It keeps the backend simple and lets the user
 * "Restart conversation" without server cleanup.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, getAccessToken } from '@/src/lib/api';
import { useResumeStore } from '@/src/lib/resume-store';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const STARTER_PROMPTS = [
  'I have 3 years as a frontend dev. Should I learn backend or go deep on React?',
  'How can I rewrite my resume to land senior roles in fintech?',
  'I keep getting rejected after the first interview. What\'s likely going wrong?',
  'I\'m a fresher with no internships. What\'s the fastest path to my first job?',
];

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

export default function MentorChatClient() {
  const resume = useResumeStore((state) => state.resume);
  const [authed, setAuthed] = useState(false);
  const [plan, setPlan] = useState<'FREE' | 'STUDENT' | 'PRO'>('FREE');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAuthed(Boolean(getAccessToken()));
    try {
      const stored = window.localStorage.getItem('rb_plan');
      if (stored === 'PRO' || stored === 'STUDENT' || stored === 'FREE') setPlan(stored);
    } catch { /* ignore */ }
  }, []);

  // Auto-scroll the transcript to the bottom on every new message so
  // the user always sees the latest reply without manually scrolling.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const isPro = plan === 'PRO';
  const canSend = !busy && input.trim().length > 0 && isPro;

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || busy || !isPro) return;
    setError('');
    setInput('');
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const data = await api.mentorChat({
        messages: next,
        resumeText: buildResumeText(resume as never) || undefined,
        // Job applications would come from /jobs API — for v1 we leave
        // it empty rather than block on that integration. The mentor
        // still gets a personalised conversation via the resume.
        recentJobApplications: [],
      });
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      if (data.provider === 'unavailable') {
        setError('AI provider is currently unavailable. Replies are placeholders until that\'s fixed.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Send failed';
      if (/PRO_PLAN_REQUIRED/i.test(message)) {
        setPaywall(true);
        // Roll back the optimistic user message so it doesn't sit there
        // with no reply.
        setMessages((m) => m.slice(0, -1));
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError('');
  }

  if (!authed) {
    return (
      <main className="grid">
        <section className="card col-12">
          <h1>Mentor Chat</h1>
          <p className="small">Sign in to chat with the AI mentor.</p>
          <Link className="btn" href="/auth/login">Sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ marginBottom: 4 }}>
          Mentor Chat{' '}
          <span className="plan-badge plan-badge--pro" style={{ fontSize: 11 }}>Pro</span>
        </h1>
        <p className="small" style={{ margin: 0, color: '#5a6778' }}>
          A career mentor that knows your saved resume. Ask about role choices, skill priorities,
          interview strategy, or anything career-adjacent. Replies stay short and concrete —
          no fluff.
        </p>
      </section>

      {!isPro || paywall ? (
        <section
          className="card col-12"
          style={{
            background: 'linear-gradient(180deg, #eef5ff 0%, #ffffff 100%)',
            borderLeft: '4px solid #1a3a5c',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Mentor Chat is a Pro feature</h2>
          <p className="small" style={{ color: '#3a4655', lineHeight: 1.6, marginBottom: 12 }}>
            Pro (₹799/mo) includes Mentor Chat with full resume context, plus Interview Prep,
            Salary band hints, and 300/200 monthly ATS scans / exports. Upgrade once to chat
            for as long as you need across your job hunt.
          </p>
          <Link className="btn" href="/billing">See plans</Link>
        </section>
      ) : null}

      <section className="card col-12 mentor-chat-shell">
        <div ref={transcriptRef} className="mentor-chat-transcript" aria-live="polite">
          {messages.length === 0 ? (
            <div className="mentor-chat-empty">
              <p style={{ margin: 0, color: '#5a6778' }}>Start with one of these, or type your own:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 12, lineHeight: 1.4, textAlign: 'left' }}
                    disabled={!isPro}
                    onClick={() => send(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`mentor-chat-bubble mentor-chat-bubble--${m.role}`}>
                <span className="mentor-chat-role">{m.role === 'user' ? 'You' : 'Mentor'}</span>
                <span className="mentor-chat-content">{m.content}</span>
              </div>
            ))
          )}
          {busy ? (
            <div className="mentor-chat-bubble mentor-chat-bubble--assistant" aria-label="Mentor is thinking">
              <span className="mentor-chat-role">Mentor</span>
              <span className="mentor-chat-content" style={{ fontStyle: 'italic', color: '#5a6778' }}>
                thinking…
              </span>
            </div>
          ) : null}
        </div>

        <form
          className="mentor-chat-form"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
        >
          <textarea
            className="input"
            rows={2}
            placeholder={isPro ? 'Ask the mentor anything career-related…' : 'Upgrade to Pro to chat'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={!isPro || busy}
            style={{ resize: 'vertical', minHeight: 60 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" className="btn" disabled={!canSend}>
              {busy ? 'Sending…' : 'Send'}
            </button>
            {messages.length > 0 ? (
              <button type="button" className="btn ghost" onClick={clearChat} disabled={busy}>
                Restart conversation
              </button>
            ) : null}
            <span className="small" style={{ color: '#7a8a99', marginLeft: 'auto' }}>
              ⏎ to send · Shift+⏎ for newline
            </span>
          </div>
          {error ? <p className="hint error" style={{ marginTop: 8 }}>{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
