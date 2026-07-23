'use client';

/**
 * Mentor Chat — AI chat UI. Usable with your own AI key (BYOK, free)
 * or with CallbackCV Plus.
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
import { useSavedResumeFallback } from '@/src/lib/use-saved-resume-fallback';
import { loadByokKey } from '@/src/lib/byok-storage';

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
  // Store draft when the editor populated it; otherwise the user's saved
  // resume (active selection, else most recent) — so Mentor knows the
  // resume even when this page is opened cold. Null for guests/no resumes.
  const resume = useSavedResumeFallback();
  const [authed, setAuthed] = useState(false);
  const [plan, setPlan] = useState<'FREE' | 'STUDENT' | 'PRO'>('FREE');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [hasByok, setHasByok] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAuthed(Boolean(getAccessToken()));
    setHasByok(Boolean(loadByokKey()));
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

  // Usable with CallbackCV Plus (the 'PRO' plan value) or with the
  // user's own AI key (BYOK, free).
  const canUseAi = plan === 'PRO' || hasByok;
  const canSend = !busy && input.trim().length > 0 && canUseAi;

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || busy || !canUseAi) return;
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
          <span className="plan-badge plan-badge--pro" style={{ fontSize: 11 }}>AI</span>
        </h1>
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          A career mentor that knows your saved resume. Ask about role choices, skill priorities,
          interview strategy, or anything career-adjacent. Replies stay short and concrete —
          no fluff.
        </p>
      </section>

      {!canUseAi || paywall ? (
        <section
          className="card col-12"
          style={{
            background: 'linear-gradient(180deg, var(--surface) 0%, var(--card) 100%)',
            borderLeft: '4px solid var(--primary)',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Use AI for Mentor Chat</h2>
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

      <section className="card col-12 mentor-chat-shell">
        <div ref={transcriptRef} className="mentor-chat-transcript" aria-live="polite">
          {messages.length === 0 ? (
            <div className="mentor-chat-empty">
              <p style={{ margin: 0, color: 'var(--muted)' }}>Start with one of these, or type your own:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 12, lineHeight: 1.4, textAlign: 'left' }}
                    disabled={!canUseAi}
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
              <span className="mentor-chat-content" style={{ fontStyle: 'italic', color: 'var(--muted)' }}>
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
            placeholder={canUseAi ? 'Ask the mentor anything career-related…' : 'Add your AI key (free) or get Plus to chat'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={!canUseAi || busy}
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
            <span className="small" style={{ color: 'var(--muted)', marginLeft: 'auto' }}>
              ⏎ to send · Shift+⏎ for newline
            </span>
          </div>
          {error ? <p className="hint error" style={{ marginTop: 8 }}>{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
