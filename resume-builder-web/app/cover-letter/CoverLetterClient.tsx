'use client';

import { useCallback, useEffect, useState } from 'react';
import { TkxTextarea, TkxSelect } from 'tekivex-ui';
import type {
  CoverLetter,
  CoverLetterTone,
  Resume,
} from 'resume-builder-shared';
import { api } from '@/src/lib/api';
import AiTrustNote from '@/src/components/AiTrustNote';
import { handleFreeTrialError } from '@/src/lib/free-trial';

const TONES: Array<{ id: CoverLetterTone; label: string; description: string }> = [
  { id: 'professional', label: 'Professional', description: 'Warm, polished, confident.' },
  { id: 'enthusiastic', label: 'Enthusiastic', description: 'Energetic and genuinely excited.' },
  { id: 'concise', label: 'Concise', description: 'Under 220 words. Direct and focused.' },
  { id: 'formal', label: 'Formal', description: 'Traditional business register.' },
];

type State = 'idle' | 'loading' | 'generating' | 'error';

type FormState = {
  resumeId: string;
  company: string;
  role: string;
  tone: CoverLetterTone;
  jdText: string;
};

const INITIAL_FORM: FormState = {
  resumeId: '',
  company: '',
  role: '',
  tone: 'professional',
  jdText: '',
};

export default function CoverLetterClient() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [letters, setLetters] = useState<CoverLetter[]>([]);
  const [state, setState] = useState<State>('loading');
  const [activeLetter, setActiveLetter] = useState<{
    id: string;
    body: string;
    wordCount: number;
    provider: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const [resumeList, letterList] = await Promise.all([
        api.listResumes().catch(() => []),
        api.listCoverLetters().catch(() => []),
      ]);
      setResumes(resumeList);
      setLetters(letterList);
      if (!form.resumeId && resumeList.length > 0) {
        setForm((prev) => ({ ...prev, resumeId: resumeList[0].id }));
      }
      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load cover letter data');
      setState('error');
    }
  }, [form.resumeId]);

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (!form.company.trim() || !form.role.trim()) {
      setError('Company and role are required.');
      return;
    }
    setState('generating');
    setError(null);
    try {
      const res = await api.generateCoverLetter({
        resumeId: form.resumeId || undefined,
        company: form.company.trim(),
        role: form.role.trim(),
        tone: form.tone,
        jdText: form.jdText.trim() || undefined,
      });
      setActiveLetter({
        id: res.id,
        body: res.body,
        wordCount: res.wordCount,
        provider: res.provider,
      });
      // Refresh the saved-letters list so the new one shows up
      const refreshed = await api.listCoverLetters().catch(() => letters);
      setLetters(refreshed);
      setState('idle');
    } catch (err: unknown) {
      // R-098 — a spent free run opens the app-wide popup, not an inline error.
      if (handleFreeTrialError(err)) {
        setState('idle');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to generate cover letter');
      setState('error');
    }
  }

  async function openLetter(id: string) {
    setState('loading');
    setError(null);
    try {
      const letter = await api.getCoverLetter(id);
      setActiveLetter({
        id: letter.id,
        body: letter.body,
        wordCount: letter.wordCount,
        provider: letter.provider || 'unknown',
      });
      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load cover letter');
      setState('error');
    }
  }

  async function onDelete(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this cover letter?')) return;
    try {
      await api.deleteCoverLetter(id);
      setLetters((prev) => prev.filter((l) => l.id !== id));
      if (activeLetter?.id === id) setActiveLetter(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete cover letter');
    }
  }

  async function copyToClipboard() {
    if (!activeLetter) return;
    try {
      await navigator.clipboard.writeText(activeLetter.body);
    } catch {
      // Some browsers (like test jsdom) lack clipboard support — ignore.
    }
  }

  return (
    <div className="card" data-testid="cover-letter-root">
      <header className="jobs-header">
        <div>
          <h1 className="heading-xl">AI Cover Letter Studio</h1>
          <p className="muted">
            Tailored cover letters in seconds — grounded in your resume and the job description,
            with four tone presets you can A/B test per role.
          </p>
          <AiTrustNote />
        </div>
      </header>

      {error ? (
        <div role="alert" className="alert alert-error jobs-alert">
          {error}
        </div>
      ) : null}

      <div className="cover-letter-layout">
        <form className="cover-letter-form" onSubmit={onGenerate}>
          <TkxSelect
            label="Source resume"
            searchable
            value={form.resumeId || undefined}
            isDisabled={resumes.length === 0}
            placeholder={resumes.length === 0 ? 'No resumes available' : 'Select a resume'}
            options={resumes.map((r) => ({ value: r.id, label: r.title }))}
            onChange={(value) => setForm({ ...form, resumeId: String(value || '') })}
          />
          <label>
            Company *
            <input
              required
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </label>
          <label>
            Role *
            <input
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            />
          </label>
          <fieldset className="tone-picker">
            <legend>Tone</legend>
            {TONES.map((t) => (
              <label key={t.id} className={form.tone === t.id ? 'selected' : ''}>
                <input
                  type="radio"
                  name="tone"
                  value={t.id}
                  checked={form.tone === t.id}
                  onChange={() => setForm({ ...form, tone: t.id })}
                />
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="form-full">
            <TkxTextarea
              label="Job description (optional)"
              minRows={6}
              value={form.jdText}
              onChange={(e) => setForm({ ...form, jdText: e.target.value })}
              placeholder="Paste the job description to ground keywords..."
            />
          </div>
          <button
            type="submit"
            className="btn primary"
            disabled={state === 'generating' || !form.company.trim() || !form.role.trim()}
          >
            {state === 'generating' ? 'Generating…' : 'Generate cover letter'}
          </button>
        </form>

        <aside className="cover-letter-preview">
          {activeLetter ? (
            <>
              <div className="cover-letter-preview__meta">
                <span className="badge">{activeLetter.wordCount} words</span>
                <span className="badge">{activeLetter.provider}</span>
                <button type="button" className="btn tertiary" onClick={copyToClipboard}>
                  Copy
                </button>
              </div>
              <pre className="cover-letter-body">{activeLetter.body}</pre>
            </>
          ) : (
            <div className="cover-letter-placeholder muted">
              Fill in the form and we’ll draft a letter grounded in your selected resume and the JD.
            </div>
          )}
        </aside>
      </div>

      <section className="cover-letter-history">
        <h2 className="heading-md">Saved letters</h2>
        {letters.length === 0 ? (
          <p className="muted">No cover letters saved yet.</p>
        ) : (
          <ul>
            {letters.map((l) => (
              <li key={l.id}>
                <button type="button" className="linklike" onClick={() => openLetter(l.id)}>
                  <strong>{l.company}</strong> — {l.role}
                </button>
                <span className="muted">
                  {' '}
                  · {l.wordCount} words · {new Date(l.createdAt).toLocaleDateString()}
                </span>
                <button type="button" className="btn tertiary danger" onClick={() => onDelete(l.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
