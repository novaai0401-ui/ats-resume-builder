'use client';

import { useEffect, useState } from 'react';
import {
  BYOK_PROVIDERS,
  clearByokKey,
  isPaidPlan,
  loadByokKey,
  maskedKey,
  saveByokKey,
  validateKeyShape,
  type ByokKeyRecord,
  type ByokProvider,
} from '@/src/lib/byok-storage';

/**
 * Settings → "Use your own AI key" card.
 *
 * Visible ONLY for free-plan users. Paid users (STUDENT / PRO) get a
 * "✓ AI is included with your plan" notice instead, with no input.
 *
 * Inline styles for the same reason the rest of the page uses them:
 * the app ships its own globals.css and has no Tailwind, so utility
 * classes would resolve to nothing.
 */
export default function ByokKeyCard() {
  const [plan, setPlan] = useState<string>('FREE');
  const [record, setRecord] = useState<ByokKeyRecord | null>(null);
  const [provider, setProvider] = useState<ByokProvider>('groq');
  const [input, setInput] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('rb_plan') || 'FREE';
      setPlan(stored);
    } catch {
      setPlan('FREE');
    }
    setRecord(loadByokKey());
  }, []);

  const onSave = () => {
    setError('');
    const check = validateKeyShape(provider, input);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setStatus('saving');
    try {
      const saved = saveByokKey(provider, input);
      setRecord(saved);
      setInput('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save key.');
      setStatus('idle');
    }
  };

  const onRemove = () => {
    clearByokKey();
    setRecord(null);
  };

  // Paid users: never see the input. Show a quiet positive note so
  // the section feels intentional rather than missing.
  if (isPaidPlan(plan)) {
    return (
      <section className="card">
        <h2 style={{ marginTop: 0 }}>AI Access</h2>
        <p className="small" style={{ color: '#1e5535', margin: '0 0 6px', fontWeight: 600 }}>
          ✓ AI is included with your {plan === 'PRO' ? 'Pro' : 'Student'} plan.
        </p>
        <p className="small" style={{ color: '#5a6778', margin: 0 }}>
          Sahaayak, Mentor, JD critique and bullet rewrites all run on our
          managed AI. You don&rsquo;t need to bring your own key.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Bring your own AI key (free tier)</h2>
      <p className="small" style={{ color: '#5a6778', margin: '0 0 12px' }}>
        Plug in an AI key from any supported provider and the conversational features
        (Sahaayak, Mentor, JD critique) will use it. <strong>Groq is free</strong> — get a
        key in under a minute at{' '}
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#1a3a5c' }}>
          console.groq.com/keys
        </a>.
      </p>
      <p className="small" style={{ color: '#5a6778', margin: '0 0 16px' }}>
        <strong>Privacy:</strong> your key stays on this device. We attach it to AI requests
        as a header only when you actually use a feature — never stored on our server,
        never logged.
      </p>

      {record ? (
        <div style={statusBoxStyle}>
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {record.provider === 'groq' ? 'Groq' : record.provider === 'openai' ? 'OpenAI' : 'Anthropic'} key active
            </p>
            <p className="small" style={{ margin: '2px 0 0', color: '#5a6778' }}>
              {maskedKey(record)} · added {new Date(record.addedAt).toLocaleDateString()}
            </p>
          </div>
          <button type="button" className="btn secondary" onClick={onRemove}>
            Remove key
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: record ? 18 : 0 }}>
        <label className="label" htmlFor="byok-provider">Provider</label>
        <select
          id="byok-provider"
          className="input"
          value={provider}
          onChange={(e) => setProvider(e.target.value as ByokProvider)}
          style={{ maxWidth: 280, marginBottom: 12 }}
        >
          {BYOK_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p === 'groq' ? 'Groq (free, recommended)' : p === 'openai' ? 'OpenAI (paid)' : 'Anthropic (paid)'}
            </option>
          ))}
        </select>

        <label className="label" htmlFor="byok-key">
          {record ? 'Replace with a different key' : 'API key'}
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <input
            id="byok-key"
            className="input"
            type={shown ? 'text' : 'password'}
            value={input}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              provider === 'groq' ? 'gsk_…' : provider === 'openai' ? 'sk-…' : 'sk-ant-…'
            }
            style={{ flex: 1, minWidth: 220 }}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? 'Hide key' : 'Show key'}
            style={{ padding: '6px 12px' }}
          >
            {shown ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onSave}
            disabled={status === 'saving' || !input.trim()}
          >
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : record ? 'Replace key' : 'Save key'}
          </button>
        </div>
        {error ? (
          <p className="small" role="alert" style={{ marginTop: 8, color: '#a02020' }}>
            {error}
          </p>
        ) : null}
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: '#5a6778' }}>
          Why bring my own key?
        </summary>
        <p className="small" style={{ color: '#5a6778', marginTop: 8, lineHeight: 1.55 }}>
          We don&rsquo;t pay for AI on free accounts — the LLM cost would force us to either
          charge everyone or kill the free tier. Bringing your own key (especially Groq&rsquo;s
          free one) keeps the conversational features available to you at zero cost.
          When you&rsquo;re ready for a no-friction experience, the paid plans include AI and
          this section disappears.
        </p>
      </details>
    </section>
  );
}

const statusBoxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 14px',
  background: '#eef7ee',
  border: '1px solid #c5e2c5',
  borderRadius: 8,
  flexWrap: 'wrap',
};
