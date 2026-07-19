'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getAccessToken, type Resume } from '@/src/lib/api';
import { templates, type TemplateId } from '@/src/components/TemplatePreview';
import ResumeTemplateRender from '@/src/components/ResumeTemplateRender';
import { getSampleResumeForIndustry } from '@/src/lib/sample-resume-data';
import { buildResumePreview, persistActiveResumeSelection, resolveCurrentSessionResumeId, resumeFromApi } from '@/src/lib/resume-flow';

const VALID_TEMPLATE_IDS = new Set(templates.map((template) => template.id));

type RouterLike = {
  push: (href: string) => unknown;
  replace?: (href: string) => unknown;
};

const fallbackRouter: RouterLike = {
  push: async () => true,
  replace: async () => true,
};

export type TemplatePreviewApiClient = {
  getResume: typeof api.getResume;
  updateResume: typeof api.updateResume;
};

export type TemplatePreviewPageClientProps = {
  apiClient?: TemplatePreviewApiClient;
  routerOverride?: RouterLike;
  searchParamsOverride?: URLSearchParams;
};

// 'unknown' covers the server render + first client paint, before we can
// read localStorage. We render the public sample gallery in that window so
// logged-out visitors (and crawlers) get meaningful content immediately.
type AuthState = 'unknown' | 'guest' | 'authed';

function resolveTemplateId(value: string, fallback: TemplateId = 'classic'): TemplateId {
  const candidate = String(value || '').trim() as TemplateId;
  if (candidate && VALID_TEMPLATE_IDS.has(candidate)) {
    return candidate;
  }
  return fallback;
}

export default function TemplatePreviewPageClient({
  apiClient,
  routerOverride,
  searchParamsOverride,
}: TemplatePreviewPageClientProps = {}) {
  const nextRouter = process.env.NEXT_TEST_MOCK_ROUTER === '1' ? null : useRouter();
  const nextSearchParams = process.env.NEXT_TEST_MOCK_ROUTER === '1' ? null : useSearchParams();
  const router = routerOverride ?? nextRouter ?? fallbackRouter;
  const searchParams = searchParamsOverride ?? nextSearchParams ?? new URLSearchParams();
  const client: TemplatePreviewApiClient = apiClient ?? api;
  const requestedResumeId = String(searchParams.get('resumeId') || '').trim();
  const initialTemplate = resolveTemplateId(searchParams.get('template') || '');
  const [templateId, setTemplateId] = useState<TemplateId>(initialTemplate);
  const [resume, setResume] = useState<Resume | null>(null);
  const [authState, setAuthState] = useState<AuthState>('unknown');
  const [resumeId, setResumeId] = useState('');
  const [activeResumeId, setActiveResumeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setTemplateId(resolveTemplateId(searchParams.get('template') || '', templateId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    // Auth + resume resolution happens in an effect (never during render)
    // so the server-rendered sample gallery hydrates without mismatch.
    if (!getAccessToken()) {
      setAuthState('guest');
      setResumeId('');
      return;
    }
    setAuthState('authed');
    const resolved = resolveCurrentSessionResumeId(requestedResumeId);
    setResumeId(resolved);
    if (resolved) {
      persistActiveResumeSelection(resolved);
    }
  }, [requestedResumeId]);

  useEffect(() => {
    // Sample mode (logged out, or logged in without a resume selection)
    // must never fire authenticated API calls — no getResume, no 401s.
    if (authState !== 'authed' || !resumeId) {
      setActiveResumeId('');
      setResume(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    client.getResume(resumeId)
      .then((payload) => {
        if (cancelled) return;
        setActiveResumeId(resumeId);
        setResume(payload);
        const fallbackTemplate = resolveTemplateId(payload.templateId || '', 'classic');
        setTemplateId((prev) => resolveTemplateId(prev, fallbackTemplate));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load resume preview.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authState, resumeId]);

  const previewResume = useMemo(() => {
    if (!resume) return null;
    const draft = resumeFromApi(resume);
    return buildResumePreview({ ...draft, templateId });
  }, [resume, templateId]);

  const handleApplyTemplate = async () => {
    if (!activeResumeId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await client.updateResume(activeResumeId, { templateId });
      setResume(updated);
      setMessage('Template applied.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply template.');
    } finally {
      setSaving(false);
    }
  };

  const selectedTemplate = templates.find((item) => item.id === templateId) || templates[0];
  const isSampleMode = authState !== 'authed' || !resumeId;

  // PUBLIC sample mode: logged-out visitors and signed-in users without a
  // saved resume selection both get the full gallery + live preview rendered
  // with realistic sample content. No auth wall, no dead ends, no authed
  // API calls (download/apply stay behind sign-up).
  if (isSampleMode) {
    const sample = getSampleResumeForIndustry();
    const isGuest = authState === 'guest';
    // Register page doesn't consume a `next` query param today, so we link
    // to plain /auth/register (the login flow's rb_return_to handles the
    // signed-in return path separately).
    const primaryCta = isGuest
      ? { href: '/auth/register', label: 'Use this template — free' }
      : { href: `/resume/start?template=${encodeURIComponent(templateId)}`, label: 'Use this template' };
    return (
      <main className="grid template-grid-layout">
        {isGuest ? (
          <section className="card col-12" data-testid="template-sample-banner">
            <p className="small" style={{ margin: 0 }}>
              You&apos;re previewing with sample data — sign up free to build your own resume with this template.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Link className="btn" href="/auth/register">Start my resume — free</Link>
              <Link className="btn secondary" href="/auth/login">Sign in</Link>
            </div>
          </section>
        ) : (
          <section className="card col-12">
            <h2>Browse templates</h2>
            <p className="small">
              Preview every ATS-safe template below with sample content, then pick one to start your resume.
            </p>
            <Link className="btn" href="/resume/start" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              Start your resume
            </Link>
          </section>
        )}

        <section className="card col-7">
          <h2>Template Preview</h2>
          <p className="small">Viewing {selectedTemplate?.name || 'template'} with sample content.</p>
          <div className="template-live__canvas" style={{ marginTop: 12 }}>
            <ResumeTemplateRender templateId={templateId} resumeData={sample} mode="full" />
          </div>
        </section>

        <section className="card col-5">
          <h3 style={{ marginTop: 0 }}>{selectedTemplate?.name}</h3>
          <p className="small">{selectedTemplate?.description || 'Pick any template to preview it live.'}</p>
          <Link className="btn" href={primaryCta.href} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            {primaryCta.label}
          </Link>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
              marginTop: 16,
            }}
          >
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setTemplateId(tpl.id)}
                className="template-gallery-card"
                aria-pressed={tpl.id === templateId}
                style={{
                  display: 'block',
                  border: tpl.id === templateId
                    ? '2px solid var(--primary-600, #2b6cb0)'
                    : '1px solid var(--border, #e2e8f0)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'inherit',
                  background: '#fff',
                  padding: 0,
                }}
              >
                <div style={{ background: '#f5f8fc', padding: 8, maxHeight: 200, overflow: 'hidden' }}>
                  <ResumeTemplateRender templateId={tpl.id} resumeData={sample} mode="thumbnail" />
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <strong style={{ color: '#1a3a5c', fontSize: 13 }}>{tpl.name}</strong>
                  {tpl.description ? (
                    <div className="small" style={{ color: '#5a6778', marginTop: 2 }}>{tpl.description}</div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid template-grid-layout">
      <section className="card col-7">
        <h2>Template Preview</h2>
        <p className="small">
          {loading ? 'Loading preview...' : `Viewing ${selectedTemplate?.name || 'template'} for your resume.`}
        </p>
        <div className="template-live__canvas" style={{ marginTop: 12 }}>
          {previewResume ? (
            <ResumeTemplateRender
              templateId={templateId}
              resumeData={previewResume}
              mode="full"
            />
          ) : (
            <p className="small">Preview unavailable.</p>
          )}
        </div>
      </section>
      <section className="card col-5">
        <h3 style={{ marginTop: 0 }}>Actions</h3>
        <p className="small">{selectedTemplate?.description || 'Select a template from dashboard preview cards.'}</p>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={handleApplyTemplate} disabled={!resume || !activeResumeId || saving || loading}>
            {saving ? 'Applying...' : 'Apply Template'}
          </button>
          <button
            className="btn secondary"
            onClick={() => router.push(activeResumeId ? `/resume?id=${encodeURIComponent(activeResumeId)}&template=${encodeURIComponent(templateId)}` : '/resume')}
            disabled={!activeResumeId}
          >
            Edit Resume
          </button>
          <button className="btn secondary" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
        {message ? (
          <div className="message-banner" style={{ marginTop: 12 }}>
            <p className="small">{message}</p>
          </div>
        ) : null}
        {error ? (
          <div className="message-banner" style={{ marginTop: 12 }}>
            <p className="small">{error}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
