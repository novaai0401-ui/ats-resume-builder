'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TkxButton, TkxCard, TkxCardBody, TkxAlert, TkxBadge, TkxFileUpload } from 'tekivex-ui';
import {
  buildReviewAtsRoute,
  canContinueToReview,
  continueToReviewAtsFromStart,
  continueToReviewFromStart,
  type PendingUploadSession,
  type SectionType,
  buildEditorRoute,
  clearPendingUploadSession,
  formatRoleLevel,
  savePendingUploadSession,
  stagePendingUploadInStore,
} from '@/src/lib/resume-flow';
import { ingestResumeFile } from '@/src/lib/resume-ingest';
import { useResumeStore } from '@/src/lib/resume-store';

const SECTION_LABELS: Record<SectionType, string> = {
  contact: 'Header & Contact',
  summary: 'Summary',
  skills: 'Skills',
  languages: 'Languages',
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  certifications: 'Certifications',
};

export default function ResumeStartClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setResumeStore = useResumeStore((state) => state.setResume);
  const uploadedFileName = useResumeStore((state) => state.uploadedFileName);
  const setUploadedFileName = useResumeStore((state) => state.setUploadedFileName);
  const [session, setSession] = useState<PendingUploadSession | null>(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [error, setError] = useState('');
  const [pendingFileName, setPendingFileName] = useState('');

  const template = (searchParams.get('template') || '').trim();
  const uploadEditorHref = buildEditorRoute('review', template);
  const reviewAtsHref = buildReviewAtsRoute(template);
  const scratchEditorHref = buildEditorRoute('scratch', template);
  const uploadButtonLabel = loadingUpload
    ? `Processing ${pendingFileName || 'upload'}...`
    : uploadedFileName
      ? `Uploaded: ${uploadedFileName}`
      : pendingFileName
        ? `Selected: ${pendingFileName}`
        : 'Upload Resume';

  const populatedLabel = useMemo(() => {
    if (!session) return '';
    if (!session.uploadSummary.sectionsPopulated.length) return 'None';
    return session.uploadSummary.sectionsPopulated.map((type) => SECTION_LABELS[type]).join(', ');
  }, [session]);

  async function onUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setPendingFileName(file.name);
    setLoadingUpload(true);
    setError('');
    try {
      const ingestResult = await ingestResumeFile(file);
      const pending: PendingUploadSession = {
        ...ingestResult.pendingSession,
        fileName: ingestResult.raw.fileName || file.name,
      };
      stagePendingUploadInStore(pending, setResumeStore);
      setSession(pending);
      setUploadedFileName(pending.fileName || file.name);
      const saved = savePendingUploadSession(pending);
      if (!saved) {
        setError('Upload processed, but browser session cache is unavailable. Continue in this tab to keep your parsed data.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setSession(null);
      clearPendingUploadSession();
    } finally {
      setLoadingUpload(false);
    }
  }

  return (
    <main className="grid">
      <TkxCard as="section" className="col-12 start-shell" padding="lg">
        <TkxCardBody>
          <div className="start-shell__head">
            <h2>Start your resume</h2>
            <p style={{ fontSize: '0.9rem' }}>Are you uploading an existing resume?</p>
          </div>

          <div className="start-shell__choices">
            <div className="start-choice start-choice--upload">
              <div className="badge-row" style={{ marginBottom: 8 }}>
                <TkxBadge variant="success">Recommended</TkxBadge>
              </div>
              <h3>Upload existing resume</h3>
              <p style={{ fontSize: '0.9rem' }}>
                We will parse and pre-fill your sections so you can review and polish quickly.
              </p>
              <TkxFileUpload
                accept=".pdf,.docx,.doc,.txt,.html,.htm,.rtf"
                variant="button"
                label={uploadButtonLabel}
                isDisabled={loadingUpload}
                onChange={onUpload}
              />
            </div>

            <div className="start-choice">
              <h3>Start from scratch</h3>
              <p style={{ fontSize: '0.9rem' }}>
                Open a blank resume and complete sections step-by-step in guided mode.
              </p>
              <TkxButton
                variant="outline"
                onClick={() => {
                  clearPendingUploadSession();
                  router.push(scratchEditorHref);
                }}
              >
                Start from scratch
              </TkxButton>
            </div>
          </div>

          {session && (
            <div className="upload-summary-panel" style={{ marginTop: 20 }}>
              <div>
                <strong>Upload processed</strong>
                <p style={{ fontSize: '0.9rem' }}>Detected experience level: {formatRoleLevel(session.uploadSummary.roleLevel)}.</p>
                <p style={{ fontSize: '0.9rem' }}>Companies found: {session.uploadSummary.companyCount}. Experience entries: {session.uploadSummary.experienceCount}.</p>
                <p style={{ fontSize: '0.9rem' }}>
                  Signals: roles {session.uploadSummary.experienceSignals?.roleCount ?? 0}, dated roles {session.uploadSummary.experienceSignals?.rolesWithDateCount ?? 0}, estimated months {session.uploadSummary.experienceSignals?.estimatedTotalMonths ?? 0}.
                </p>
                <p style={{ fontSize: '0.9rem' }}>Sections populated: {populatedLabel}.</p>
              </div>
              <div className="upload-summary-panel__actions" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <TkxButton
                  onClick={() => {
                    const navigation = continueToReviewFromStart({
                      session,
                      template,
                      setResume: setResumeStore,
                      setUploadedFileName,
                    });
                    if (!navigation.enabled) return;
                    if (!navigation.cached) {
                      setError('Continuing without browser session cache. Keep this tab open while reviewing.');
                    }
                    router.push(navigation.href || uploadEditorHref);
                  }}
                  disabled={!canContinueToReview(session) || loadingUpload}
                >
                  Continue to Review
                </TkxButton>
                <TkxButton
                  variant="outline"
                  onClick={() => {
                    const navigation = continueToReviewAtsFromStart({
                      session,
                      template,
                      setResume: setResumeStore,
                      setUploadedFileName,
                    });
                    if (!navigation.enabled) return;
                    if (!navigation.cached) {
                      setError('Continuing without browser session cache. Keep this tab open while reviewing.');
                    }
                    router.push(navigation.href || reviewAtsHref);
                  }}
                  disabled={!canContinueToReview(session) || loadingUpload}
                >
                  Review & ATS
                </TkxButton>
              </div>
            </div>
          )}

          {error && <TkxAlert variant="warning" style={{ marginTop: 16 }}>{error}</TkxAlert>}
        </TkxCardBody>
      </TkxCard>
    </main>
  );
}
