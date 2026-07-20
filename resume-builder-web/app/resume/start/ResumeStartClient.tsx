'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { getAccessToken } from '@/src/lib/api';
import { useResumeStore } from '@/src/lib/resume-store';
import { PrivacyBadge } from '@/src/components/PrivacyBadge';
import DataLoader from '@/src/components/DataLoader';

const SECTION_LABELS: Record<SectionType, string> = {
  contact: 'Header & Contact',
  summary: 'Summary',
  skills: 'Skills',
  languages: 'Languages',
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  achievements: 'Achievements',
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
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [linkedinText, setLinkedinText] = useState('');

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

  async function onUpload(file?: File) {
    if (!file) return;
    // Guest mode (R-090): the parse-upload endpoint is auth-only, so a
    // tokenless upload would surface a raw 401. Show the same honest
    // signup nudge the editor's gated actions use instead — building
    // from scratch stays fully available without an account.
    if (!getAccessToken()) {
      setError('Uploading & parsing a resume file needs a free account — create one and your work comes with you. Or start from scratch below, no account needed.');
      return;
    }
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
      <section className="card col-12 start-shell">
        <div className="start-shell__head">
          <h2>Start your resume</h2>
          <p className="small">Are you uploading an existing resume?</p>
        </div>

        <PrivacyBadge variant="upload" />

        <div className="start-shell__choices">
          <div className="start-choice start-choice--upload">
            <div className="badge-row">
              <span className="pill">Recommended</span>
            </div>
            <h3>Upload existing resume</h3>
            <p className="small">
              We will parse and pre-fill your sections so you can review and polish quickly.
            </p>
            <label
              className="btn"
              style={{
                cursor: loadingUpload ? 'progress' : 'pointer',
                opacity: loadingUpload ? 0.85 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
              }}
              aria-disabled={loadingUpload}
            >
              {loadingUpload ? (
                <DataLoader mode="inline" label={`Reading ${pendingFileName || 'your resume'}…`} />
              ) : (
                uploadButtonLabel
              )}
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.html,.htm,.rtf"
                onChange={(e) => onUpload(e.target.files?.[0])}
                disabled={loadingUpload}
                style={{ display: 'none' }}
              />
            </label>
            {/* Calm timing hint + screen-reader status. Without this the
                user sees a button that just sits there for ~5-15s and
                wonders whether anything is happening. */}
            <p
              className="small"
              role="status"
              aria-live="polite"
              style={{
                marginTop: 8,
                marginBottom: 0,
                color: 'var(--muted)',
                minHeight: '1.4em',
              }}
            >
              {loadingUpload
                ? 'Parsing your resume — this usually takes 5–15 seconds. Please keep this tab open.'
                : ''}
            </p>
          </div>

          <div className="start-choice">
            <h3>Start from scratch</h3>
            <p className="small">
              Open a blank resume and complete sections step-by-step in guided mode.
            </p>
            <button
              className="btn secondary"
              onClick={() => {
                clearPendingUploadSession();
                router.push(scratchEditorHref);
              }}
            >
              Start from scratch
            </button>
          </div>

          <div className="start-choice" data-testid="linkedin-import-choice">
            <h3>Import from LinkedIn</h3>
            <p className="small">
              Open <strong>your profile page</strong> (linkedin.com/in/your-name) — not the
              home feed. Scroll through your About, Experience and Education, select that text
              (or Ctrl/Cmd+A), copy, and paste below. We strip LinkedIn&apos;s menus and build
              your resume automatically.
            </p>
            {linkedinOpen ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea
                  className="input"
                  rows={6}
                  placeholder="Paste your copied LinkedIn PROFILE text here…"
                  value={linkedinText}
                  onChange={(e) => setLinkedinText(e.target.value)}
                  data-testid="linkedin-paste-input"
                  disabled={loadingUpload}
                />
                {(() => {
                  const t = linkedinText.trim();
                  const looksLikeFeed =
                    t.length > 0 &&
                    /you are on the messaging overlay|scrolled to top of feed|compose message|start a post|\bpromoted\b|people you may know/i.test(t) &&
                    !/^(about|experience|education|skills|licenses)\b/im.test(t);
                  return (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          disabled={loadingUpload || t.length < 80}
                          data-testid="linkedin-import-submit"
                          title="Reads the pasted text above and builds your resume — no file needed."
                          onClick={() => {
                            const file = new File([linkedinText], 'linkedin-profile.txt', { type: 'text/plain' });
                            void onUpload(file);
                          }}
                        >
                          {loadingUpload ? 'Importing…' : 'Build resume from this'}
                        </button>
                        <button className="btn ghost" onClick={() => setLinkedinOpen(false)} disabled={loadingUpload}>
                          Cancel
                        </button>
                      </div>
                      {t.length > 0 && t.length < 80 ? (
                        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
                          That looks too short — paste your whole profile (About + Experience + Education).
                        </p>
                      ) : null}
                      {looksLikeFeed ? (
                        <p className="small" style={{ margin: 0, color: 'var(--danger, #b42318)' }}>
                          This looks like your LinkedIn <strong>home feed</strong>, not your profile.
                          Open your profile page (linkedin.com/in/your-name) and copy from there —
                          otherwise the menus and posts get read as fake jobs.
                        </p>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ) : (
              <button className="btn secondary" onClick={() => setLinkedinOpen(true)} data-testid="linkedin-import-open">
                Paste LinkedIn profile
              </button>
            )}
          </div>
        </div>

        {session && (
          <div className="upload-summary-panel" style={{ marginTop: 20 }}>
            <div>
              <strong>Upload processed</strong>
              <p className="small">Detected experience level: {formatRoleLevel(session.uploadSummary.roleLevel)}.</p>
              <p className="small">Companies found: {session.uploadSummary.companyCount}. Experience entries: {session.uploadSummary.experienceCount}.</p>
              <p className="small">
                Signals: roles {session.uploadSummary.experienceSignals?.roleCount ?? 0}, dated roles {session.uploadSummary.experienceSignals?.rolesWithDateCount ?? 0}, estimated months {session.uploadSummary.experienceSignals?.estimatedTotalMonths ?? 0}.
              </p>
              <p className="small">Sections populated: {populatedLabel}.</p>
            </div>
            <div className="upload-summary-panel__actions">
              {/* Two separate destinations:
                  - "Continue to Review" → /resume editor (plain). Use this
                    when you just uploaded a resume: the fields hydrate from
                    the upload and stay put.
                  - "Review & ATS" → /resume/review (ATS-driven). Same editor
                    with the section sidebar plus an ATS panel that
                    re-validates on autosave. Worth the extra reload only
                    when you want the score back. */}
              <button
                className="btn"
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
              </button>
              <button
                className="btn secondary"
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
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="message-banner" style={{ marginTop: 16 }}>
            <p className="small">{error}</p>
          </div>
        )}
      </section>

      {/* R-036: this page is the Resume HUB landing. Surface the
          other Resume-hub tools so a user who lands here from the
          top nav has the full picture of what's under "Resume"
          without going hunting. Skip the tools that mean
          "start/upload" (that's literally the rest of this page). */}
      <section className="card col-12" aria-labelledby="resume-hub-more">
        <h2 id="resume-hub-more" style={{ marginTop: 0, fontSize: 16, color: 'var(--primary)' }}>
          More resume tools
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            marginTop: 8,
          }}
        >
          {[
            { href: '/resume/versions', label: 'Version history', blurb: 'Snapshots + restore points.' },
            { href: '/templates/preview', label: 'Templates', blurb: 'ATS-safe and visual layouts.' },
            { href: '/resume/ats', label: 'ATS Score', blurb: 'Does your format parse cleanly?' },
            { href: '/resume/ats-simulate', label: 'ATS Simulator', blurb: 'Recruiter-view preview.' },
          ].map((t) => (
            <a
              key={t.href}
              href={t.href}
              style={{
                display: 'block',
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <strong style={{ color: 'var(--primary)', fontSize: 14 }}>{t.label}</strong>
              <div className="small" style={{ color: 'var(--muted)', marginTop: 2 }}>{t.blurb}</div>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
