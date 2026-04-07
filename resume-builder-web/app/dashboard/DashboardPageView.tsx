'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TkxButton, TkxCard, TkxCardBody, TkxSelect, TkxModal, TkxAlert } from 'tekivex-ui';
import { TEMPLATE_CATALOG } from 'resume-builder-shared';
import { api, getAccessToken, type DriveSessionResponse, type Resume } from '@/src/lib/api';
import TemplateCatalogGrid from '@/src/components/templates/TemplateCatalogGrid';
import {
  buildResumePreview,
  buildTemplateSelectionRoute,
  clearActiveResumeSelection,
  persistActiveResumeSelection,
  resumeFromApi,
} from '@/src/lib/resume-flow';
import { sampleResumeData } from '@/src/lib/sample-resume-data';
import { recommendTemplates } from '@/src/lib/template-recommendation';
import { defaultTemplateId, resolveTemplateId, templateRegistry, type TemplateId } from '@/shared/templateRegistry';

const DASHBOARD_TEMPLATE_OPTIONS = TEMPLATE_CATALOG.map((template) => templateRegistry[template.id]);

type DriveSessionLike = DriveSessionResponse & {
  driveConnected?: boolean;
};

type DashboardApiClient = Pick<
  typeof api,
  | 'getDriveSession'
  | 'setDriveConsent'
  | 'getGoogleStartUrl'
  | 'listDriveFiles'
  | 'importDriveFile'
  | 'extendSession'
  | 'logout'
  | 'listResumes'
  | 'updateResume'
>;

type RouterLike = {
  push: (href: string) => Promise<boolean> | void;
};

const fallbackRouter: RouterLike = {
  push: async () => true,
};

const DRIVE_MODAL_SESSION_KEY = 'drive-consent-modal-dismissed';

export type DashboardPageProps = {
  apiClient?: DashboardApiClient;
  redirectTo?: (url: string) => void;
  resumeId?: string;
  routerOverride?: RouterLike;
};

export default function DashboardPageView({
  apiClient = api,
  redirectTo,
  resumeId = '',
  routerOverride,
}: DashboardPageProps = {}) {
  const nextRouter = process.env.NEXT_TEST_MOCK_ROUTER === '1' ? null : useRouter();
  const router = routerOverride ?? nextRouter ?? fallbackRouter;
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumesLoading, setResumesLoading] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState(String(resumeId || '').trim());
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [showDriveConsentModal, setShowDriveConsentModal] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | ''>('');
  const [hoveredTemplate, setHoveredTemplate] = useState<TemplateId | ''>('');

  useEffect(() => {
    let cancelled = false;
    if (!getAccessToken()) {
      setStatus('Please sign in to view your dashboard.');
      return;
    }

    setResumesLoading(true);
    apiClient
      .listResumes()
      .then((items) => {
        if (cancelled) return;
        setResumes(Array.isArray(items) ? items : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load resumes.');
      })
      .finally(() => {
        if (!cancelled) setResumesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  useEffect(() => {
    let cancelled = false;
    if (!getAccessToken()) {
      return;
    }

    apiClient
      .getDriveSession()
      .then((session) => {
        if (cancelled) return;
        const driveSession = session as DriveSessionLike;
        const wasDismissed = typeof window !== 'undefined' && sessionStorage.getItem(DRIVE_MODAL_SESSION_KEY) === '1';
        if (!driveSession.driveConsentAsked && !wasDismissed) {
          setShowDriveConsentModal(true);
        }
      })
      .catch(() => {
        // Drive session is optional — don't block dashboard if it fails.
      });

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const sortedResumes = useMemo(
    () => [...resumes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [resumes],
  );

  useEffect(() => {
    if (!sortedResumes.length) {
      setSelectedResumeId('');
      if (!resumesLoading) {
        clearActiveResumeSelection();
      }
      return;
    }

    const hasSelected = selectedResumeId && sortedResumes.some((resume) => resume.id === selectedResumeId);
    if (hasSelected) return;
    const requestedResumeId = String(resumeId || '').trim();
    if (requestedResumeId && sortedResumes.some((resume) => resume.id === requestedResumeId)) {
      setSelectedResumeId(requestedResumeId);
      persistActiveResumeSelection(requestedResumeId);
      return;
    }
    setSelectedResumeId('');
    clearActiveResumeSelection();
  }, [resumesLoading, sortedResumes, selectedResumeId, resumeId]);

  const activeResume = useMemo(() => {
    if (!sortedResumes.length || !selectedResumeId) return null;
    return sortedResumes.find((resume) => resume.id === selectedResumeId) || null;
  }, [sortedResumes, selectedResumeId]);

  useEffect(() => {
    if (!activeResume) {
      setSelectedTemplate('');
      return;
    }
    setSelectedTemplate(resolveTemplateId(activeResume.templateId || '', defaultTemplateId));
  }, [activeResume]);

  const previewDraft = useMemo(() => (activeResume ? resumeFromApi(activeResume) : null), [activeResume]);
  const previewResume = useMemo(() => (previewDraft ? buildResumePreview(previewDraft) : null), [previewDraft]);
  const effectivePreviewResume = previewResume || sampleResumeData;
  const recommendation = useMemo(() => (previewDraft ? recommendTemplates(previewDraft) : null), [previewDraft]);
  const profileName = activeResume?.contact?.fullName || 'No resume selected';
  const profileRole = activeResume?.experience?.[0]?.role || '';
  const activeResumeUpdatedAt = activeResume?.updatedAt ? new Date(activeResume.updatedAt).toLocaleDateString() : '';
  const hasSelectedResume = Boolean(activeResume?.id);

  async function handleLater() {
    setError('');
    setConsentLoading(true);
    try {
      await apiClient.setDriveConsent({ decision: 'declined' });
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(DRIVE_MODAL_SESSION_KEY, '1');
      }
      setShowDriveConsentModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save your choice.');
    } finally {
      setConsentLoading(false);
    }
  }

  async function handleConnect() {
    setError('');
    setConsentLoading(true);
    try {
      const response = await apiClient.getGoogleStartUrl();
      await apiClient.setDriveConsent({ decision: 'accepted' });
      if (redirectTo) {
        redirectTo(response.url);
      } else if (typeof window !== 'undefined') {
        window.location.assign(response.url);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start Google sign-in.');
    } finally {
      setConsentLoading(false);
    }
  }

  function handleTemplatePreview(templateId: TemplateId) {
    setSelectedTemplate(templateId);
    setStatus('');
    setError('');
    const currentResumeId = String(selectedResumeId || activeResume?.id || '').trim();
    if (!currentResumeId) {
      router.push(`/resume/start?template=${encodeURIComponent(templateId)}`);
      return;
    }
    router.push(buildTemplateSelectionRoute(currentResumeId, templateId));
  }

  async function handleTemplateSelect(templateId: TemplateId) {
    setSelectedTemplate(templateId);
    setStatus('');
    setError('');
    if (!activeResume?.id) {
      router.push(`/resume/start?template=${encodeURIComponent(templateId)}`);
      return;
    }

    setTemplateSaving(true);
    try {
      const updated = await apiClient.updateResume(activeResume.id, { templateId });
      setResumes((prev) => prev.map((resume) => (resume.id === activeResume.id ? updated : resume)));
      router.push(buildTemplateSelectionRoute(activeResume.id, templateId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply template.');
    } finally {
      setTemplateSaving(false);
    }
  }

  return (
    <main style={{ width: 'min(1400px, 94vw)', margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Choose a resume, then browse ATS-safe templates.</p>
      </header>

      <TkxCard as="section" data-testid="dashboard-preview-profile" style={{ marginBottom: 14 }} padding="md">
        <TkxCardBody>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{profileName}</h2>
              {profileRole ? (
                <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>{profileRole}</p>
              ) : (
                <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
                  Select a saved resume or upload a new one to preview templates.
                </p>
              )}
              {activeResumeUpdatedAt ? (
                <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>Last updated: {activeResumeUpdatedAt}</p>
              ) : null}
            </div>
            {sortedResumes.length > 0 ? (
              <div style={{ minWidth: 260 }}>
                <TkxSelect
                  label="Selected resume"
                  id="dashboard-resume-select"
                  value={selectedResumeId}
                  options={[
                    { value: '', label: 'Select a saved resume' },
                    ...sortedResumes.map((resume) => ({ value: resume.id, label: resume.title })),
                  ]}
                  onChange={(v) => {
                    const nextResumeId = String(v || '').trim();
                    setSelectedResumeId(nextResumeId);
                    setStatus('');
                    setError('');
                    if (nextResumeId) {
                      persistActiveResumeSelection(nextResumeId);
                      return;
                    }
                    clearActiveResumeSelection();
                  }}
                />
              </div>
            ) : null}
          </div>
        </TkxCardBody>
      </TkxCard>

      <TkxCard as="section" data-testid="dashboard-template-section" padding="md">
        <TkxCardBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0 }}>Choose a template</h2>
              <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
                Same catalog as template selection, optimized for ATS-safe export.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href="/resume/start">
                <TkxButton variant="outline" as="span">Create Resume</TkxButton>
              </Link>
              <TkxButton
                type="button"
                onClick={() => {
                  if (activeResume?.id) {
                    router.push(buildTemplateSelectionRoute(activeResume.id));
                    return;
                  }
                  router.push('/resume/start');
                }}
              >
                Start from Template
              </TkxButton>
            </div>
          </div>

          {resumesLoading ? <p style={{ marginTop: 12, fontSize: '0.9rem' }}>Loading resumes...</p> : null}
          {!activeResume?.id ? (
            <p style={{ marginTop: 12, fontSize: '0.9rem' }} className="template-empty">
              Select a saved resume or upload a new one to preview templates.
            </p>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <TemplateCatalogGrid
              templates={DASHBOARD_TEMPLATE_OPTIONS}
              previewResume={effectivePreviewResume}
              selectedTemplate={selectedTemplate}
              recommendation={recommendation}
              hoveredTemplate={hoveredTemplate}
              onHoverTemplate={(templateId) => setHoveredTemplate(templateId)}
              onPreviewTemplate={handleTemplatePreview}
              onSelectTemplate={handleTemplateSelect}
              primaryActionLabel="Use Template"
              layoutVariant="gallery"
              disabled={templateSaving || resumesLoading}
              previewLoading={resumesLoading}
              dataTestId="dashboard-template-grid"
            />
          </div>
        </TkxCardBody>
      </TkxCard>

      {status && <p style={{ marginTop: 12, fontSize: '0.9rem' }}>{status}</p>}
      {error && <TkxAlert variant="danger" style={{ marginTop: 12 }}>{error}</TkxAlert>}

      <TkxModal
        isOpen={showDriveConsentModal}
        onClose={handleLater}
        title="Connect Google Drive?"
        size="sm"
        data-testid="drive-consent-modal"
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <TkxButton variant="outline" type="button" onClick={handleLater} disabled={consentLoading}>
              Later
            </TkxButton>
            <TkxButton type="button" onClick={handleConnect} isLoading={consentLoading} loadingText="Connecting...">
              Connect
            </TkxButton>
          </div>
        }
      >
        <p style={{ margin: 0 }}>Import resumes from Drive to speed up setup.</p>
      </TkxModal>
    </main>
  );
}
