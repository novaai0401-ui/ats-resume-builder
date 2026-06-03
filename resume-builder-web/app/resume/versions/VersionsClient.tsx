'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Resume, ResumeVersionSummary } from 'resume-builder-shared';
import { api } from '@/src/lib/api';

type State = 'idle' | 'loading' | 'snapshotting' | 'restoring' | 'deleting' | 'error';

export default function VersionsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const idFromUrl = params?.get('id') || '';

  const [resumeId, setResumeId] = useState(idFromUrl);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [versions, setVersions] = useState<ResumeVersionSummary[]>([]);
  const [label, setLabel] = useState('');
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadResumes = useCallback(async () => {
    try {
      const list = await api.listResumes();
      setResumes(list);
      if (!resumeId && list.length > 0) {
        setResumeId(list[0].id);
      }
      return list;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load resumes');
      return [] as Resume[];
    }
  }, [resumeId]);

  const loadVersions = useCallback(
    async (id: string) => {
      if (!id) {
        setVersions([]);
        return;
      }
      setState('loading');
      setError(null);
      try {
        const rows = await api.listResumeVersions(id);
        setVersions(rows);
        setState('idle');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load versions');
        setState('error');
      }
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const list = await loadResumes();
      const target = idFromUrl || (list[0]?.id ?? '');
      if (target) {
        setResumeId(target);
        await loadVersions(target);
      } else {
        setState('idle');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPickResume(id: string) {
    setResumeId(id);
    setInfo(null);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.set('id', id);
    window.history.replaceState({}, '', url.toString());
    loadVersions(id);
  }

  async function onSnapshot() {
    if (!resumeId) {
      setError('Pick a resume first.');
      return;
    }
    setState('snapshotting');
    setError(null);
    setInfo(null);
    try {
      const created = await api.snapshotResumeVersion(resumeId, {
        label: label.trim() || undefined,
      });
      setVersions((prev) => [created, ...prev]);
      setLabel('');
      setInfo('Snapshot saved.');
      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to snapshot resume');
      setState('error');
    }
  }

  async function onRestore(version: ResumeVersionSummary) {
    if (!resumeId) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Restore "${version.label || formatDate(version.createdAt)}"?\n\nWe will auto-snapshot the current version first so you can roll back.`,
      )
    ) {
      return;
    }
    setState('restoring');
    setError(null);
    setInfo(null);
    try {
      await api.restoreResumeVersion(resumeId, version.id);
      setInfo('Resume restored. Reloading version list…');
      await loadVersions(resumeId);
      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to restore version');
      setState('error');
    }
  }

  async function onDelete(version: ResumeVersionSummary) {
    if (!resumeId) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete "${version.label || formatDate(version.createdAt)}"?`)
    ) {
      return;
    }
    setState('deleting');
    setError(null);
    try {
      await api.deleteResumeVersion(resumeId, version.id);
      setVersions((prev) => prev.filter((v) => v.id !== version.id));
      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete version');
      setState('error');
    }
  }

  function openInEditor() {
    if (!resumeId) return;
    // The editor reads its target resume from the `?id=` query
    // parameter, not `?resumeId=`. The old route silently fell back
    // to "no resume selected" — the page loaded blank and the user
    // saw nothing happen. The Versions navigation now uses the same
    // param the editor + dashboard already use everywhere else.
    router.push(`/resume/review?id=${encodeURIComponent(resumeId)}`);
  }

  return (
    <div className="card" data-testid="resume-versions-root">
      <header className="jobs-header">
        <div>
          <h1 className="heading-xl">Resume Version History</h1>
          <p className="muted">
            Snapshot before risky AI rewrites, restore any version safely
            (current state is auto-saved on restore), and keep multiple variants
            per role.
          </p>
        </div>
        <Link href="/dashboard" className="btn tertiary">← Back to dashboard</Link>
      </header>

      {/* Spell out WHY this page exists. Without this, a junior user
          lands here, sees an empty list, and doesn't know what to do.
          Concrete examples > abstract description. */}
      <div className="alert alert-success" style={{ marginBottom: 16, lineHeight: 1.5 }}>
        <strong>When to use this:</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>Before you ask AI to rewrite a section — snapshot first so you can restore if the rewrite goes wrong.</li>
          <li>Tailoring one resume to a senior role and another to a leadership role — save each as a labelled snapshot.</li>
          <li>On the <strong>Outcomes</strong> tab, you can see which snapshot actually got the most replies.</li>
        </ul>
      </div>

      <div className="versions-controls">
        <label className="versions-control">
          Resume
          <select
            value={resumeId}
            onChange={(e) => onPickResume(e.target.value)}
            disabled={resumes.length === 0}
          >
            {resumes.length === 0 ? <option value="">No resumes saved yet</option> : null}
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </label>
        <label className="versions-control versions-control--grow">
          Label this snapshot (optional)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='e.g. "Pre-AI rewrite", "v2 senior pitch"'
            maxLength={120}
          />
        </label>
        <div className="versions-actions">
          <button
            type="button"
            className="btn primary"
            onClick={onSnapshot}
            disabled={!resumeId || state === 'snapshotting'}
          >
            {state === 'snapshotting' ? 'Saving…' : '+ Save snapshot'}
          </button>
          <button type="button" className="btn secondary" onClick={openInEditor} disabled={!resumeId}>
            Open in editor
          </button>
        </div>
      </div>

      {error ? <div role="alert" className="alert alert-error jobs-alert">{error}</div> : null}
      {info ? <div role="status" className="alert alert-success jobs-alert">{info}</div> : null}

      {state === 'loading' ? (
        <p>Loading…</p>
      ) : versions.length === 0 ? (
        <div className="muted versions-empty">
          No snapshots yet. Save one before your next AI rewrite — restoring is
          one click and we keep up to 25 versions per resume.
        </div>
      ) : (
        <ol className="versions-list">
          {versions.map((v, i) => (
            <li key={v.id} className="version-row">
              <div className="version-row__main">
                <strong className="version-row__label">
                  {v.label || `Snapshot ${versions.length - i}`}
                </strong>
                <span className="muted version-row__meta">
                  {formatDate(v.createdAt)}
                  {v.atsScoreSnapshot != null ? ` · ATS ${v.atsScoreSnapshot}` : ''}
                </span>
              </div>
              <div className="version-row__actions">
                <button
                  type="button"
                  className="btn tertiary"
                  onClick={() => onRestore(v)}
                  disabled={state === 'restoring'}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="btn tertiary danger"
                  onClick={() => onDelete(v)}
                  disabled={state === 'deleting'}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatDate(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
