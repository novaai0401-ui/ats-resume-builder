'use client';

import { useEffect, useState } from 'react';
import {
  BYOK_PROVIDERS,
  DEFAULT_MODELS,
  PROVIDERS_NEEDING_MODEL,
  clearByokKey,
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
  const [record, setRecord] = useState<ByokKeyRecord | null>(null);
  const [provider, setProvider] = useState<ByokProvider>('groq');
  const [input, setInput] = useState('');
  const [model, setModel] = useState('');
  const needsModel = PROVIDERS_NEEDING_MODEL.has(provider);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
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
      // Groq is key-only; OpenAI/Anthropic accept an optional model (blank →
      // the provider's default).
      const saved = saveByokKey(provider, input, needsModel ? model : undefined);
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

  // No subscription tiers: AI features are powered by the user's own key.
  // Everyone sees the key input.
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Bring your own AI key</h2>
      <p className="small" style={{ color: 'var(--muted)', margin: '0 0 12px' }}>
        Plug in an AI key from any supported provider and the conversational features
        (Sahaayak, Mentor, JD critique) will use it. <strong>Groq is free</strong> — get a
        key in under a minute at{' '}
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
          console.groq.com/keys
        </a>.
      </p>
      <p className="small" style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
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
            <p className="small" style={{ margin: '2px 0 0', color: 'var(--muted)' }}>
              {maskedKey(record)}
              {record.provider !== 'groq' ? ` · model ${record.model || DEFAULT_MODELS[record.provider]}` : ''}
              {' '}· added {new Date(record.addedAt).toLocaleDateString()}
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
          onChange={(e) => {
            setProvider(e.target.value as ByokProvider);
            setModel('');
            setError('');
          }}
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

        {needsModel ? (
          <div style={{ marginTop: 12 }}>
            <label className="label" htmlFor="byok-model">Model <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              id="byok-model"
              className="input"
              type="text"
              value={model}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODELS[provider]}
              style={{ maxWidth: 320 }}
            />
            <p className="small" style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
              Leave blank to use <code>{DEFAULT_MODELS[provider]}</code>. Set this to any model your
              key can access (e.g. <code>gpt-4o</code>).
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="small" role="alert" style={{ marginTop: 8, color: 'var(--danger)' }}>
            {error}
          </p>
        ) : null}
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>
          Why bring my own key?
        </summary>
        <p className="small" style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.55 }}>
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
