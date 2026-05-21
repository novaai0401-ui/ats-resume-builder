'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TEMPLATE_CATALOG } from 'resume-builder-shared';
import { api, isApiRequestError, type Resume } from '@/src/lib/api';
import TemplateCatalogGrid from '@/src/components/templates/TemplateCatalogGrid';
import DownloadChargeModal from '@/src/components/DownloadChargeModal';
import {
  buildResumePreview,
  persistActiveResumeSelection,
  resolveCurrentSessionResumeId,
  resumeFromApi,
} from '@/src/lib/resume-flow';
import { recommendTemplates } from '@/src/lib/template-recommendation';
import { useResumeStore, type ResumeDraft } from '@/src/lib/resume-store';
import { TemplatePreviewFrame } from '@/src/components/TemplatePreviewFrame';
import { resolveTemplateId, templateRegistry, type TemplateId } from '@/shared/templateRegistry';

// Mirrors the editor: default ON unless explicitly disabled in env. The
// server-side gate (ENABLE_DOWNLOAD_CHARGE) returns 403 Forbidden when
// the client skips the charge modal, which is what was happening on the
// template page before this fix — the click went straight to the API
// and bounced with "Payment required to download this resume."
const DOWNLOAD_CHARGE_ENABLED =
  (process.env.NEXT_PUBLIC_ENABLE_DOWNLOAD_CHARGE || 'true').toLowerCase() !== 'false';

function friendlyPdfError(error: unknown, fallback: string): string {
  if (isApiRequestError(error)) {
    if (error.status === 503) {
      return 'PDF service is starting up. Please wait ~30 seconds and try again.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'Your session expired. Please sign in again to download your PDF.';
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

const TEMPLATE_OPTIONS = TEMPLATE_CATALOG.map((template) => templateRegistry[template.id]);

type TemplateSelectionApiClient = Pick<typeof api, 'downloadPdf' | 'getResume' | 'ingestResume' | 'updateResume'>;

type RouterLike = {
  push: (href: string) => Promise<boolean> | void;
  replace?: (href: string) => Promise<boolean> | void;
};

type SearchParamsLike = {
  get: (key: string) => string | null;
};

const fallbackRouter: RouterLike = {
  push: async () => true,
  replace: async () => true,
};

export type TemplateSelectionViewProps = {
  apiClient?: TemplateSelectionApiClient;
  routerOverride?: RouterLike;
  searchParamsOverride?: SearchParamsLike;
};

function mergeTemplateSaveResult(current: Resume | null, updated: Resume, template: TemplateId): Resume {
  if (!current || current.id !== updated.id) {
    return {
      ...updated,
      templateId: template,
    };
  }
  return {
    ...current,
    id: updated.id || current.id,
    userId: updated.userId || current.userId,
    createdAt: updated.createdAt || current.createdAt,
    updatedAt: updated.updatedAt || current.updatedAt,
    templateId: template,
  };
}

export default function TemplateSelectionView({
  apiClient = api,
  routerOverride,
  searchParamsOverride,
}: TemplateSelectionViewProps = {}) {
  const nextRouter = process.env.NEXT_TEST_MOCK_ROUTER === '1' ? null : useRouter();
  const nextSearchParams = process.env.NEXT_TEST_MOCK_ROUTER === '1' ? null : useSearchParams();
  const router = routerOverride ?? nextRouter ?? fallbackRouter;
  const searchParams = searchParamsOverride ?? nextSearchParams ?? new URLSearchParams();
  const requestedResumeId = String(searchParams.get('resumeId') || '').trim();
  const resumeId = resolveCurrentSessionResumeId(requestedResumeId);
  const templateQuery = String(searchParams.get('template') || '').trim();
  const hasTemplateQuery = Boolean(templateQuery);
  const requestedTemplate = resolveTemplateId(templateQuery, 'classic');
  // ?print=1 flag is set when the user clicked "Print preview" in the
  // editor. We auto-open the browser print dialog once the resume has
  // rendered so they don't have to hunt for a button on this page —
  // BUT only for paid users.  Free users get a watermarked, read-only
  // preview with the OS print dialog blocked (see useEffect below).
  const printRequested = searchParams.get('print') === '1';
  // Plan gate for printing.  Free users can VIEW the watermarked
  // preview but cannot print; STUDENT / PRO get clean output + the
  // auto-print dialog.  We start `null` (= unknown) so the print
  // effect waits for hydration instead of racing it and treating
  // every user as FREE on the first render.
  const [isPaidUser, setIsPaidUser] = useState<boolean | null>(null);
  const [showPrintBlockedModal, setShowPrintBlockedModal] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const plan = (window.localStorage.getItem('rb_plan') || 'FREE').toUpperCase();
      setIsPaidUser(plan === 'STUDENT' || plan === 'PRO');
    } catch {
      setIsPaidUser(false);
    }
  }, []);
  const [resumeData, setResumeData] = useState<Resume | null>(null);
  const [resumeDraft, setResumeDraft] = useState<ResumeDraft | null>(null);
  const [loading, setLoading] = useState(Boolean(resumeId));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadChargeOpen, setDownloadChargeOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(requestedTemplate);
  const [pendingUploadFileName, setPendingUploadFileName] = useState('');
  const pendingTemplateSaveRef = useRef<Promise<void> | null>(null);
  const templateSaveRunRef = useRef(0);
  const activeTemplateMeta = useMemo(() => TEMPLATE_OPTIONS.find((template) => template.id === selectedTemplate), [selectedTemplate]);
  const ActiveTemplateComponent = templateRegistry[selectedTemplate].component;
  const previewResume = useMemo(() => (resumeDraft ? buildResumePreview(resumeDraft) : null), [resumeDraft]);
  const recommendation = useMemo(() => (resumeDraft ? recommendTemplates(resumeDraft) : null), [resumeDraft]);
  const setResumeStore = useResumeStore((state) => state.setResume);

  const applySavedTemplate = (updated: Resume, template: TemplateId, toastText = '') => {
    const nextResume = mergeTemplateSaveResult(resumeData, updated, template);
    persistActiveResumeSelection(nextResume.id || resumeId);
    setResumeData(nextResume);
    const draft = { ...resumeFromApi(nextResume), templateId: template };
    setResumeDraft(draft);
    setResumeStore(() => draft);
    setSelectedTemplate(template);
    if (toastText) setToast(toastText);
  };

  useEffect(() => {
    if (resumeId) {
      persistActiveResumeSelection(resumeId);
    }
  }, [resumeId]);

  // Track which template the URL requested so the fetch callback can
  // use the latest value even when the closure was captured earlier.
  const urlTemplateRef = useRef(requestedTemplate);
  const hasUrlTemplateRef = useRef(hasTemplateQuery);
  urlTemplateRef.current = requestedTemplate;
  hasUrlTemplateRef.current = hasTemplateQuery;

  useEffect(() => {
    if (!resumeId) {
      setError('Select a saved resume or upload a new one to preview templates.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient.getResume(resumeId)
      .then((data) => {
        if (cancelled) return;
        // Always read the latest URL param via ref to avoid stale closures
        const urlTemplate = hasUrlTemplateRef.current ? urlTemplateRef.current : null;
        const savedTemplate = resolveTemplateId(data.templateId || '', 'classic');
        const initialTemplate = urlTemplate || savedTemplate;
        setResumeData(data);
        const draft = { ...resumeFromApi(data), templateId: initialTemplate };
        setResumeDraft(draft);
        setResumeStore(() => draft);
        setSelectedTemplate(initialTemplate);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load resume.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, resumeId, setResumeStore]);

  // Ensure URL template param always overrides any other state (runs after fetch completes too)
  useEffect(() => {
    if (!hasTemplateQuery) return;
    setSelectedTemplate(requestedTemplate);
    setResumeDraft((prev) => (prev ? { ...prev, templateId: requestedTemplate } : prev));
    setResumeStore((prev) => ({ ...prev, templateId: requestedTemplate }));
  }, [hasTemplateQuery, requestedTemplate, setResumeStore]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const persistTemplate = (template: TemplateId, toastText = '') => {
    if (!resumeId || saving) return Promise.resolve();
    setSaving(true);
    setError('');
    const runId = ++templateSaveRunRef.current;
    const savePromise = apiClient.updateResume(resumeId, { templateId: template })
      .then((updated) => {
        applySavedTemplate(updated, template, toastText);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save template.');
        throw err;
      })
      .finally(() => {
        if (templateSaveRunRef.current === runId) {
          pendingTemplateSaveRef.current = null;
          setSaving(false);
        }
      });
    pendingTemplateSaveRef.current = savePromise;
    return savePromise;
  };

  const handlePreviewTemplate = (template: TemplateId) => {
    setSelectedTemplate(template);
    setResumeDraft((prev) => (prev ? { ...prev, templateId: template } : prev));
    setResumeStore((prev) => ({ ...prev, templateId: template }));
    setToast('');
  };

  const handleSaveTemplate = async () => {
    try {
      await persistTemplate(selectedTemplate, 'Template applied.');
    } catch {
      // surfaced in state
    }
  };

  const handleUpload = async (file?: File) => {
    if (!file || !resumeId) return;
    setPendingUploadFileName(file.name);
    setUploading(true);
    setError('');
    setToast('');
    try {
      const result = await apiClient.ingestResume(resumeId, file);
      persistActiveResumeSelection(result.resume.id || resumeId);
      const nextDraft = { ...resumeFromApi(result.resume), templateId: selectedTemplate };
      setResumeData(result.resume);
      setResumeDraft(nextDraft);
      setResumeStore(() => nextDraft);
      setToast(`Preview updated from ${file.name}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to replace resume.');
    } finally {
      setUploading(false);
    }
  };

  const runDownload = async (downloadToken?: string) => {
    if (!resumeId) return;
    setDownloading(true);
    setError('');
    setToast('Generating your PDF, this can take 5–10 seconds…');
    try {
      // Build a human-readable filename: "<full name>_<role>" when both
      // are present, otherwise fall back to the role or the title alone.
      // The api client slugifies and adds the .pdf extension. Without
      // this, downloads land as the prisma cuid which is unreadable
      // when users manage multiple resumes.
      const fullName = (resumeDraft?.contact?.fullName || '').trim();
      const role = (resumeDraft?.experience?.[0]?.role || resumeDraft?.title || '').trim();
      const fileBaseName = [fullName, role].filter(Boolean).join('_');
      await apiClient.downloadPdf(resumeId, selectedTemplate, downloadToken, fileBaseName);
      setToast('PDF download started.');
    } catch (err: unknown) {
      setError(friendlyPdfError(err, 'Failed to export PDF.'));
      setToast('');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = async () => {
    if (!resumeId) return;
    // Mirror the editor flow: when the per-download charge is enabled,
    // surface the payment modal first and only run the actual download
    // after the gateway confirms a paid token. Otherwise download directly.
    if (DOWNLOAD_CHARGE_ENABLED) {
      setDownloadChargeOpen(true);
      return;
    }
    await runDownload();
  };

  const previewReady = Boolean(previewResume);

  // Auto-trigger window.print() once when the user arrived via the
  // editor's "Print preview" button (?print=1). We wait for the
  // preview to actually render so the print dialog has content to
  // show — without this gate the dialog opens before
  // ActiveTemplateComponent has finished rendering and the user
  // gets blank pages, which is exactly the bug reported.
  //
  // Free users: do NOT auto-open the dialog. They see the watermarked
  // preview only; printing is paid-only and blocked below.
  const hasPrintedRef = useRef(false);
  useEffect(() => {
    if (!printRequested) return;
    if (hasPrintedRef.current) return;
    if (!previewReady) return;
    if (isPaidUser === null) return; // wait for plan hydration
    if (!isPaidUser) {
      hasPrintedRef.current = true;
      return;
    }
    hasPrintedRef.current = true;
    // Two RAFs: one to flush React commit, one to flush layout. Without
    // this the print dialog often races the browser's first paint and
    // captures an empty document.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { window.print(); } catch { /* user-cancelled is fine */ }
      });
    });
  }, [printRequested, previewReady, isPaidUser]);

  // Free-tier print block. The watermark CSS (globals.css @media print
  // rule on .template-print-shell[data-plan="free"]) already swaps the
  // resume for an upgrade-required message in any actual print output,
  // so a free user who bypasses everything still cannot get a clean
  // copy onto paper.  This effect is the front-line UX layer: catch
  // Ctrl/Cmd+P, suppress the OS print dialog, and surface the
  // "Upgrade to print" modal instead.
  useEffect(() => {
    if (!printRequested) return;
    if (isPaidUser !== false) return;
    const handler = (e: KeyboardEvent) => {
      const isPrintKey = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey
        && (e.key === 'p' || e.key === 'P');
      if (!isPrintKey) return;
      e.preventDefault();
      e.stopPropagation();
      setShowPrintBlockedModal(true);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [printRequested, isPaidUser]);
  if (!resumeId && !loading) {
    return (
      <main className="grid">
        <section className="card col-12">
          <h2>Select a resume to preview</h2>
          <p className="small">Select a saved resume or upload a new one to preview templates.</p>
        </section>
      </main>
    );
  }

  // Print mode: when the user arrived via "Print preview" (?print=1) we
  // render ONLY the selected template at full width, with no catalog and
  // no chrome. Relying purely on @media print CSS proved unreliable
  // because the browser's print preview still captured the off-screen
  // catalog column on some platforms. Hard-removing it from the DOM is
  // both faster and reliable across browsers.
  //
  // data-plan drives two things in globals.css:
  //   • `free`  → a diagonal POCKET RESUME watermark is overlaid on the
  //               preview, AND the @media print rule swaps the resume
  //               for an upgrade-required message so the print output
  //               can never carry a clean copy
  //   • `paid`  → no watermark, no print block, normal printable layout
  // While plan is still hydrating we render `free` defensively so a
  // race never lets a free user grab a clean copy before the effect
  // has finished reading localStorage.
  if (printRequested) {
    const planAttr: 'paid' | 'free' = isPaidUser === true ? 'paid' : 'free';
    const showFreeBanner = isPaidUser === false;
    return (
      <main className="template-print-shell" data-print-mode="1" data-plan={planAttr}>
        {showFreeBanner && (
          <aside className="template-print-upgrade-banner" role="status" aria-live="polite">
            <div className="template-print-upgrade-banner__title">Print is a Pro feature</div>
            <p className="template-print-upgrade-banner__body">
              Free preview shows a watermarked view of your resume. Upgrade to remove the
              watermark and unlock printing or PDF download.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.href = '/billing';
              }}
            >
              Upgrade to print
            </button>
          </aside>
        )}
        {previewResume ? (
          <div
            className="template-print-page"
            data-template-id={selectedTemplate}
            data-render-context="print"
          >
            <span style={{ display: 'none' }}>{`TEMPLATE_FINGERPRINT:${selectedTemplate}`}</span>
            <ActiveTemplateComponent resumeData={previewResume} />
          </div>
        ) : (
          <div className="skeleton skeleton-preview-pane" data-testid="template-print-loading" />
        )}
        {showPrintBlockedModal && (
          <div
            className="modal-backdrop template-print-blocked-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-print-blocked-title"
            onClick={() => setShowPrintBlockedModal(false)}
          >
            <div
              className="card"
              style={{ maxWidth: 420, margin: '10vh auto', padding: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="template-print-blocked-title" style={{ marginTop: 0 }}>
                Printing is a Pro feature
              </h3>
              <p className="small" style={{ color: '#5a6778' }}>
                Your current plan can preview the resume with a watermark, but printing and
                PDF export are reserved for paid plans. Upgrade to remove the watermark and
                unlock printing.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowPrintBlockedModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (typeof window !== 'undefined') window.location.href = '/billing';
                  }}
                >
                  Upgrade plan
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="grid template-grid-layout">
      <section className="card col-7">
        <div>
          <h2>Choose a template</h2>
          <p className="small">Pick the layout you want before exporting.</p>
        </div>
        {loading && (
          <div style={{ marginTop: 12 }}>
            <div className="skeleton-text skeleton skeleton-text--medium" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 12 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton skeleton-card__preview" />
                  <div>
                    <div className="skeleton skeleton-card__line" style={{ width: '60%' }} />
                    <div className="skeleton skeleton-card__line" style={{ width: '80%' }} />
                    <div className="skeleton skeleton-card__line" style={{ width: '40%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="message-banner error" style={{ marginTop: 12 }}>
            <p className="small">{error}</p>
          </div>
        )}
        {previewReady || loading ? (
          <div style={{ marginTop: 12 }}>
            <TemplateCatalogGrid
              templates={TEMPLATE_OPTIONS}
              previewResume={previewReady ? previewResume : null}
              selectedTemplate={selectedTemplate}
              recommendation={recommendation}
              onSelectTemplate={handlePreviewTemplate}
              primaryActionLabel="Preview"
              disabled={loading || uploading}
              previewLoading={loading}
              dataTestId="template-selection-grid"
            />
          </div>
        ) : null}
      </section>

      <section className="card col-5 preview-pane" data-testid="template-selection-preview" data-active-template={selectedTemplate}>
        <div className="template-live">
          <div className="template-live__header">
            <div>
              <h4 style={{ margin: 0 }}>Live preview</h4>
              <p className="small">Now viewing {activeTemplateMeta?.name}</p>
              {recommendation && (
                <p className="small template-live__recommendation">
                  Recommended: {TEMPLATE_OPTIONS.find((item) => item.id === recommendation.primaryTemplateId)?.name}.{' '}
                  {recommendation.reasons[0]}
                </p>
              )}
            </div>
            <span className="pill">{resumeData?.templateId === selectedTemplate ? 'Applied' : 'Previewing'}</span>
          </div>
          <div className="template-live__canvas">
            {previewResume ? (
              <TemplatePreviewFrame>
                <div
                  data-template-id={selectedTemplate}
                  data-render-context="preview"
                  data-css-bundle="globals.css#ats-template"
                >
                  <span style={{ display: 'none' }}>{`TEMPLATE_FINGERPRINT:${selectedTemplate}`}</span>
                  <ActiveTemplateComponent resumeData={previewResume} />
                </div>
              </TemplatePreviewFrame>
            ) : (
              <div className="skeleton skeleton-preview-pane" />
            )}
          </div>
        </div>

        <div className="template-preview-actions" style={{ marginTop: 16 }}>
          <label className="btn secondary" style={{ cursor: uploading || !resumeId ? 'not-allowed' : 'pointer' }}>
            {uploading ? `Uploading ${pendingUploadFileName || 'resume'}...` : 'Upload / Replace Resume'}
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt,.html,.htm,.rtf"
              style={{ display: 'none' }}
              disabled={uploading || loading || !resumeId}
              data-testid="template-upload-input"
              onChange={(event) => handleUpload(event.target.files?.[0])}
            />
          </label>
          <button className="btn" onClick={handleSaveTemplate} disabled={!resumeDraft || saving}>
            {saving ? 'Applying...' : 'Use Template'}
          </button>
          <button
            className="btn secondary"
            onClick={() => router.push(resumeId ? `/resume?id=${encodeURIComponent(resumeId)}&template=${encodeURIComponent(selectedTemplate)}` : '/resume')}
            disabled={!resumeId}
          >
            Edit Resume
          </button>
          <button className="btn secondary" onClick={handleDownload} disabled={!resumeId || downloading}>
            {downloading ? 'Preparing PDF...' : 'Download PDF'}
          </button>
          <button className="btn secondary" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </button>
          {toast && <span className="small" style={{ marginLeft: 'auto' }}>{toast}</span>}
        </div>
      </section>

      {downloadChargeOpen && resumeId ? (
        <DownloadChargeModal
          resumeId={resumeId}
          onCancel={() => setDownloadChargeOpen(false)}
          onSuccess={async (token) => {
            setDownloadChargeOpen(false);
            await runDownload(token);
          }}
        />
      ) : null}
    </main>
  );
}
