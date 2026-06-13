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

function resolveTemplateId(value: string, fallback: TemplateId = 'classic'): TemplateId {
  const candidate = String(value || '').trim() as TemplateId;
  if (candidate && VALID_TEMPLATE_IDS.has(candidate)) {
    return candidate;
  }
  return fallback;
}

export default function TemplatePreviewPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedResumeId = String(searchParams.get('resumeId') || '').trim();
  const resumeId = resolveCurrentSessionResumeId(requestedResumeId);
  const initialTemplate = resolveTemplateId(searchParams.get('template') || '');
  const [templateId, setTemplateId] = useState<TemplateId>(initialTemplate);
  const [resume, setResume] = useState<Resume | null>(null);
  const [activeResumeId, setActiveResumeId] = useState(resumeId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setTemplateId(resolveTemplateId(searchParams.get('template') || '', templateId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setActiveResumeId(resumeId);
    if (resumeId) {
      persistActiveResumeSelection(resumeId);
    }
  }, [resumeId]);

  useEffect(() => {
    if (!getAccessToken()) {
      setError('Please sign in to preview templates.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    const load = async () => {
      const targetResumeId = resumeId;
      if (!targetResumeId) {
        if (!cancelled) {
          setActiveResumeId('');
          setResume(null);
        }
        throw new Error('Select a saved resume or upload a new one to preview templates.');
      }
      const payload = await api.getResume(targetResumeId);
      if (cancelled) return;
      setActiveResumeId(targetResumeId);
      setResume(payload);
      const fallbackTemplate = resolveTemplateId(payload.templateId || '', 'classic');
      setTemplateId((prev) => resolveTemplateId(prev, fallbackTemplate));
    };
    load()
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
  }, [resumeId]);

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
      const updated = await api.updateResume(activeResumeId, { templateId });
      setResume(updated);
      setMessage('Template applied.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply template.');
    } finally {
      setSaving(false);
    }
  };

  const selectedTemplate = templates.find((item) => item.id === templateId) || templates[0];

  // No saved resume yet → don't dead-end the user. Show the whole gallery
  // rendered with a realistic sample so they can browse every template, then
  // pick one (which carries through to upload / start-from-scratch).
  if (!activeResumeId && !loading) {
    const sample = getSampleResumeForIndustry();
    return (
      <main className="grid">
        <section className="card col-12">
          <h2>Browse templates</h2>
          <p className="small">
            Preview every ATS-safe template below with sample content, then pick one to start your resume.
          </p>
          <Link className="btn" href="/resume/start" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            Start your resume
          </Link>
        </section>

        <section className="card col-12">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {templates.map((tpl) => (
              <Link
                key={tpl.id}
                href={`/resume/start?template=${encodeURIComponent(tpl.id)}`}
                className="template-gallery-card"
                style={{
                  display: 'block',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  textDecoration: 'none',
                  color: 'inherit',
                  background: '#fff',
                }}
              >
                <div style={{ background: '#f5f8fc', padding: 8, maxHeight: 280, overflow: 'hidden' }}>
                  <ResumeTemplateRender templateId={tpl.id} resumeData={sample} mode="thumbnail" />
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <strong style={{ color: '#1a3a5c', fontSize: 14 }}>{tpl.name}</strong>
                  {tpl.description ? (
                    <div className="small" style={{ color: '#5a6778', marginTop: 2 }}>{tpl.description}</div>
                  ) : null}
                  <div className="small" style={{ color: 'var(--primary-600, #2b6cb0)', marginTop: 6, fontWeight: 600 }}>
                    Use this template →
                  </div>
                </div>
              </Link>
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
