'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PROFESSION_INDUSTRIES, TEMPLATE_CATALOG, getIndustryById } from 'resume-builder-shared';
import { TkxEmpty, TkxSkeleton } from 'tekivex-ui';
import { api, getAccessToken, type DriveSessionResponse, type Resume } from '@/src/lib/api';
import TemplateCatalogGrid from '@/src/components/templates/TemplateCatalogGrid';
import {
  buildResumePreview,
  buildTemplateSelectionRoute,
  clearActiveResumeSelection,
  persistActiveResumeSelection,
  resumeFromApi,
} from '@/src/lib/resume-flow';
import { getSampleResumeForIndustry } from '@/src/lib/sample-resume-data';
import { recommendTemplates } from '@/src/lib/template-recommendation';
import { PrivacyBadge } from '@/src/components/PrivacyBadge';
import { CallbackRateCard } from '@/src/components/CallbackRateCard';
import { defaultTemplateId, resolveTemplateId, templateRegistry, type TemplateId } from '@/shared/templateRegistry';

const DASHBOARD_TEMPLATE_OPTIONS = TEMPLATE_CATALOG.map((template) => templateRegistry[template.id]);

const PROFESSION_STORAGE_KEY = 'rb_selected_industry';

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
  // Industry selection filters the template grid so, for example, a healthcare
  // user never has to scroll past engineering-only templates. The choice is
  // persisted in localStorage so users don't re-pick on every visit.
  const [selectedIndustry, setSelectedIndustry] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(PROFESSION_STORAGE_KEY);
    if (stored) setSelectedIndustry(stored);
  }, []);

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

  // Search query is only surfaced in the UI when the user has enough
  // resumes to make it useful. On mobile, typing uses the soft keyboard
  // and costs screen real estate, so we keep it hidden for small lists.
  const [searchQuery, setSearchQuery] = useState('');

  const sortedResumes = useMemo(
    () => [...resumes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [resumes],
  );

  const filteredResumes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedResumes;
    return sortedResumes.filter((r) => {
      const title = (r.title || '').toLowerCase();
      const name = (r.contact?.fullName || '').toLowerCase();
      const role = (r.experience?.[0]?.role || '').toLowerCase();
      return title.includes(q) || name.includes(q) || role.includes(q);
    });
  }, [sortedResumes, searchQuery]);

  const shouldShowSearch = sortedResumes.length > 3;

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
  // Fallback preview picks a sample tailored to the user's selected industry
  // so a nurse doesn't see a frontend engineer resume while browsing
  // healthcare templates. Defaults to the IT sample if no industry is set.
  const effectivePreviewResume = previewResume || getSampleResumeForIndustry(selectedIndustry);
  const recommendation = useMemo(() => (previewDraft ? recommendTemplates(previewDraft) : null), [previewDraft]);

  // Filter templates by the selected industry. When no profession is picked,
  // show the full catalog so we don't regress the default discovery flow.
  const selectedIndustryConfig = useMemo(() => getIndustryById(selectedIndustry), [selectedIndustry]);
  const visibleTemplates = useMemo(() => {
    if (!selectedIndustry) return DASHBOARD_TEMPLATE_OPTIONS;
    const allowed = new Set(TEMPLATE_CATALOG
      .filter((template) => template.industries?.includes(selectedIndustry))
      .map((template) => template.id));
    const filtered = DASHBOARD_TEMPLATE_OPTIONS.filter((template) => allowed.has(template.id));
    // Fall back to the full list if the profession has no curated matches yet.
    return filtered.length ? filtered : DASHBOARD_TEMPLATE_OPTIONS;
  }, [selectedIndustry]);
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

  // Preview = look at the template rendered, WITHOUT changing your resume.
  // Lands on the dedicated preview page (with a resume if one is selected, or
  // the sample gallery if not). Distinct from "Use Template" below.
  function handleTemplatePreview(templateId: TemplateId) {
    setSelectedTemplate(templateId);
    setStatus('');
    setError('');
    const currentResumeId = String(selectedResumeId || activeResume?.id || '').trim();
    // With a resume selected, Preview should show THE USER'S resume in this
    // template (the selection page, which also offers Use/Download) — not the
    // generic sample gallery. Only fall back to samples when there's no resume.
    if (currentResumeId) {
      router.push(buildTemplateSelectionRoute(currentResumeId, templateId));
      return;
    }
    router.push(`/templates/preview?template=${encodeURIComponent(templateId)}`);
  }

  // Use = apply the template to the selected resume and go straight to the
  // editor so the user keeps working with it applied. (No resume yet → start.)
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
      router.push(`/resume?id=${encodeURIComponent(activeResume.id)}&template=${encodeURIComponent(templateId)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply template.');
    } finally {
      setTemplateSaving(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
        <p className="small" style={{ margin: 0 }}>
          Choose a resume, then browse ATS-safe templates.
        </p>
      </header>

      <PrivacyBadge variant="dashboard" />
      <CallbackRateCard resumeId={activeResume?.id || sortedResumes[0]?.id} />

      <section
        data-testid="dashboard-preview-profile"
        className="card"
        style={{ marginBottom: 14, background: 'linear-gradient(180deg, var(--surface-alt) 0%, var(--card) 70%)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{profileName}</h2>
            {profileRole ? (
              <p className="small" style={{ margin: '6px 0 0' }}>
                {profileRole}
              </p>
            ) : (
              <p className="small" style={{ margin: '6px 0 0' }}>
                Select a saved resume or upload a new one to preview templates.
              </p>
            )}
            {activeResumeUpdatedAt ? (
              <p className="small" style={{ margin: '6px 0 0' }}>
                Last updated: {activeResumeUpdatedAt}
              </p>
            ) : null}
          </div>
          {sortedResumes.length > 0 ? (
            <div style={{ display: 'grid', gap: 8, minWidth: 260, flex: '1 1 260px' }}>
              {shouldShowSearch ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="small">Search resumes</span>
                  <input
                    className="input"
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    placeholder="Search by title, name, or role"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="dashboard-resume-search"
                  />
                </label>
              ) : null}
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="small">Selected resume</span>
                <select
                  className="input"
                  value={selectedResumeId}
                  onChange={(event) => {
                    const nextResumeId = String(event.target.value || '').trim();
                    setSelectedResumeId(nextResumeId);
                    setStatus('');
                    setError('');
                    if (nextResumeId) {
                      persistActiveResumeSelection(nextResumeId);
                      return;
                    }
                    clearActiveResumeSelection();
                  }}
                  data-testid="dashboard-resume-select"
                >
                  <option value="">
                    {filteredResumes.length === 0 && searchQuery
                      ? 'No resumes match your search'
                      : 'Select a saved resume'}
                  </option>
                  {filteredResumes.map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <section
        className="card"
        data-testid="dashboard-profession-section"
        style={{ marginBottom: 14 }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Pick your profession</h2>
            <p className="small" style={{ margin: '6px 0 0' }}>
              {hasSelectedResume
                ? 'Profession is locked to the selected resume — a person belongs to one profession at a time. To work on a different profession, start a fresh resume.'
                : 'Select an industry to see the ATS templates best suited to that field. Leave it blank to browse every template.'}
            </p>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <label className="col-6" style={{ display: 'grid', gap: 6, minWidth: 240 }}>
              <span className="small">Industry</span>
              <select
                className="input"
                data-testid="dashboard-industry-select"
                value={selectedIndustry}
                disabled={hasSelectedResume}
                aria-disabled={hasSelectedResume}
                title={hasSelectedResume ? 'Profession is locked while a resume is selected. Click "Create Resume" to start a fresh one.' : undefined}
                onChange={(event) => {
                  const next = event.target.value;
                  setSelectedIndustry(next);
                  if (typeof window !== 'undefined') {
                    if (next) window.localStorage.setItem(PROFESSION_STORAGE_KEY, next);
                    else window.localStorage.removeItem(PROFESSION_STORAGE_KEY);
                  }
                }}
              >
                <option value="">All professions</option>
                {PROFESSION_INDUSTRIES.map((industry) => (
                  <option key={industry.id} value={industry.id}>
                    {industry.label}
                  </option>
                ))}
              </select>
            </label>
            {hasSelectedResume ? (
              <p className="small col-6" style={{ margin: 0, alignSelf: 'end' }}>
                Want a different profession?{' '}
                <Link href="/resume/start">Create a fresh resume →</Link>
              </p>
            ) : selectedIndustryConfig ? (
              <p className="small col-6" style={{ margin: 0, alignSelf: 'end' }}>
                Showing {visibleTemplates.length} template{visibleTemplates.length === 1 ? '' : 's'}{' '}
                for <strong>{selectedIndustryConfig.label}</strong>.{' '}
                <Link href="/career">Explore career paths →</Link>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card" data-testid="dashboard-template-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Choose a template</h2>
            <p className="small" style={{ margin: '6px 0 0' }}>
              {selectedIndustryConfig
                ? `ATS-safe templates tailored for ${selectedIndustryConfig.label.toLowerCase()}.`
                : 'Same catalog as template selection, optimized for ATS-safe export.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn secondary" href="/resume/start">
              Create Resume
            </Link>
            <button
              className="btn"
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
            </button>
          </div>
        </div>

        {resumesLoading ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }} aria-busy="true" aria-label="Loading resumes">
            <TkxSkeleton variant="text" lines={2} />
            <TkxSkeleton variant="rectangular" height={120} />
          </div>
        ) : null}
        {!resumesLoading && sortedResumes.length === 0 ? (
          <div style={{ marginTop: 12 }} data-testid="dashboard-empty-state">
            <TkxEmpty
              image="default"
              description="You don't have any resumes yet. Create one to unlock ATS-safe templates."
            >
              <Link className="btn" href="/resume/start">
                Create your first resume
              </Link>
            </TkxEmpty>
          </div>
        ) : null}
        {!resumesLoading && sortedResumes.length > 0 && !activeResume?.id ? (
          <p className="small template-empty" style={{ marginTop: 12 }}>
            Select a saved resume or upload a new one to preview templates.
          </p>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <TemplateCatalogGrid
            templates={visibleTemplates}
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
      </section>

      {status && (
        <p className="small" style={{ marginTop: 12 }}>
          {status}
        </p>
      )}

      {error && (
        <p className="small" style={{ marginTop: 12, color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {showDriveConsentModal && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="drive-consent-modal"
          style={{
            marginTop: 20,
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            background: 'var(--surface-alt)',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Connect Google Drive?</h3>
          <p className="small" style={{ marginTop: 8 }}>
            Import resumes from Drive to speed up setup.
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn secondary" type="button" onClick={handleLater} disabled={consentLoading}>
              Later
            </button>
            <button className="btn" type="button" onClick={handleConnect} disabled={consentLoading}>
              Connect
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
