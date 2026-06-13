'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobApplication, JobApplicationInput, JobStatus } from 'resume-builder-shared';
import { api } from '@/src/lib/api';
import DataLoader from '@/src/components/DataLoader';
import {
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  KANBAN_STATUSES,
  buildStatsFromJobs,
  daysUntil,
  groupByStatus,
} from '@/src/lib/job-utils';
import LiveOpeningsPanel from './LiveOpeningsPanel';

type LoadState = 'idle' | 'loading' | 'saving' | 'error';

const EMPTY_FORM: JobApplicationInput = {
  company: '',
  role: '',
  jdUrl: '',
  location: '',
  status: 'wishlist',
  source: '',
  referral: '',
  notes: '',
  nextActionAt: '',
};

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function compactPayload(form: JobApplicationInput): JobApplicationInput {
  const out: JobApplicationInput = {
    company: form.company.trim(),
    role: form.role.trim(),
    status: form.status || 'wishlist',
  };
  for (const key of ['jdUrl', 'jdText', 'location', 'salaryRange', 'source', 'referral', 'notes'] as const) {
    const v = (form as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[key] = v.trim();
  }
  if (form.nextActionAt) out.nextActionAt = fromDateInput(String(form.nextActionAt));
  if (form.appliedAt) out.appliedAt = fromDateInput(String(form.appliedAt));
  return out;
}

export default function JobsTrackerClient() {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<JobApplicationInput>(EMPTY_FORM);

  const refresh = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const rows = await api.listJobs();
      setJobs(rows);
      setLoadState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grouped = useMemo(() => groupByStatus(jobs), [jobs]);
  const stats = useMemo(() => buildStatsFromJobs(jobs), [jobs]);
  const upcoming = useMemo(() => {
    return jobs
      .filter((job) => job.nextActionAt && !CLOSED_STATUSES.includes(job.status as JobStatus))
      .sort((a, b) => String(a.nextActionAt).localeCompare(String(b.nextActionAt)))
      .slice(0, 6);
  }, [jobs]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(job: JobApplication) {
    setEditing(job);
    setForm({
      company: job.company,
      role: job.role,
      jdUrl: job.jdUrl || '',
      jdText: job.jdText || '',
      location: job.location || '',
      salaryRange: job.salaryRange || '',
      status: job.status,
      source: job.source || '',
      referral: job.referral || '',
      notes: job.notes || '',
      nextActionAt: toDateInput(job.nextActionAt),
      appliedAt: toDateInput(job.appliedAt),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!form.company.trim() || !form.role.trim()) {
      setError('Company and role are required.');
      return;
    }
    setLoadState('saving');
    setError(null);
    try {
      const payload = compactPayload(form);
      if (editing) {
        const updated = await api.updateJob(editing.id, payload);
        setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      } else {
        const created = await api.createJob(payload);
        setJobs((prev) => [created, ...prev]);
      }
      closeForm();
      setLoadState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save job');
      setLoadState('error');
    }
  }

  async function moveStatus(job: JobApplication, next: JobStatus) {
    if (job.status === next) return;
    setLoadState('saving');
    try {
      const updated = await api.updateJob(job.id, { company: job.company, role: job.role, status: next });
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      setLoadState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
      setLoadState('error');
    }
  }

  async function removeJob(job: JobApplication) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${job.company} — ${job.role}"?`)) return;
    setLoadState('saving');
    try {
      await api.deleteJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setLoadState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
      setLoadState('error');
    }
  }

  return (
    <div className="card" data-testid="jobs-tracker-root">
      <div className="jobs-header">
        <div>
          <h1 className="heading-xl">Job Application Tracker</h1>
          <p className="muted">
            One board for every opportunity. Track JDs, interview stages, and follow-ups —
            your Kanban stays in sync with tailored resumes and cover letters.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={openNew}>
          + New Application
        </button>
      </div>

      <div className="jobs-stats" aria-label="Pipeline stats">
        <StatCard label="Total" value={stats.total} hint="Every application you've logged on this board." />
        <StatCard label="Active" value={stats.active} tone="active" hint="Wishlist + Applied + Phone screen + Interview." />
        <StatCard
          label="Interviewing"
          value={stats.byStatus.phone_screen + stats.byStatus.interview}
          tone="interview"
          hint="Applications currently in Phone screen or Interview stage."
        />
        <StatCard label="Offers" value={stats.byStatus.offer} tone="offer" hint="Applications marked Offer." />
        <StatCard
          label="Response rate"
          value={`${Math.round(stats.responseRate * 100)}%`}
          tone="rate"
          hint="Of everything you've Applied to, how many moved past Applied (Phone screen + Interview + Offer). Calculated from your own tracker."
        />
        <StatCard
          label="Offer rate"
          value={`${Math.round(stats.offerRate * 100)}%`}
          tone="rate"
          hint="Of applications that closed (Offer or Rejected), how many became an Offer. Calculated from your own tracker."
        />
      </div>
      {/* Plain-language explainer of where the rates come from. Without
          this, a user with 0% reads it as "the app is broken" instead of
          "I haven't logged any applications yet." */}
      {stats.total === 0 ? (
        <p className="muted" style={{ marginTop: -6, marginBottom: 16, fontSize: 13 }}>
          The rates above are calculated from <strong>your own tracker</strong> — they fill in as you
          add applications and move them through the stages below.
        </p>
      ) : null}

      <LiveOpeningsPanel onTracked={refresh} />

      {error ? (
        <div role="alert" className="alert alert-error jobs-alert">
          {error}
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="jobs-upcoming" aria-label="Upcoming follow-ups">
          <h2 className="heading-md">Upcoming actions</h2>
          <ul>
            {upcoming.map((job) => {
              const delta = daysUntil(job.nextActionAt);
              const label =
                delta == null
                  ? ''
                  : delta < 0
                  ? `${Math.abs(delta)} day(s) overdue`
                  : delta === 0
                  ? 'Today'
                  : `In ${delta} day(s)`;
              return (
                <li key={job.id}>
                  <strong>{job.company}</strong> — {job.role}{' '}
                  <span className="muted">({JOB_STATUS_LABELS[job.status as JobStatus]})</span>
                  <span className={`upcoming-chip ${delta != null && delta < 0 ? 'overdue' : ''}`}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {loadState === 'loading' ? (
        <DataLoader label="Loading your job tracker…" />
      ) : (
        <div className="kanban" role="list">
          {KANBAN_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              jobs={grouped[status]}
              onEdit={openEdit}
              onDelete={removeJob}
              onMove={moveStatus}
            />
          ))}
        </div>
      )}

      {(grouped.rejected.length > 0 || grouped.withdrawn.length > 0) && (
        <section className="jobs-closed" aria-label="Closed applications">
          <h2 className="heading-md">Closed</h2>
          <div className="kanban kanban--compact">
            {CLOSED_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                jobs={grouped[status]}
                onEdit={openEdit}
                onDelete={removeJob}
                onMove={moveStatus}
              />
            ))}
          </div>
        </section>
      )}

      {showForm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Job application">
          <form className="modal card" onSubmit={submitForm}>
            <h2 className="heading-lg">{editing ? 'Edit application' : 'New application'}</h2>
            <div className="form-grid">
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
              <label>
                JD URL
                <input
                  type="url"
                  value={form.jdUrl || ''}
                  onChange={(e) => setForm({ ...form, jdUrl: e.target.value })}
                />
              </label>
              <label>
                Location
                <input
                  value={form.location || ''}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </label>
              <label>
                Salary range
                <input
                  value={form.salaryRange || ''}
                  onChange={(e) => setForm({ ...form, salaryRange: e.target.value })}
                />
              </label>
              <label>
                Status
                <select
                  value={form.status || 'wishlist'}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as JobStatus })
                  }
                >
                  {JOB_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {JOB_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <input
                  list="job-sources"
                  value={form.source || ''}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                />
                <datalist id="job-sources">
                  <option value="linkedin" />
                  <option value="referral" />
                  <option value="company-site" />
                  <option value="recruiter" />
                  <option value="job-board" />
                </datalist>
              </label>
              <label>
                Referral
                <input
                  value={form.referral || ''}
                  onChange={(e) => setForm({ ...form, referral: e.target.value })}
                />
              </label>
              <label>
                Next action
                <input
                  type="date"
                  value={typeof form.nextActionAt === 'string' ? form.nextActionAt : ''}
                  onChange={(e) => setForm({ ...form, nextActionAt: e.target.value })}
                />
              </label>
              <label>
                Applied on
                <input
                  type="date"
                  value={typeof form.appliedAt === 'string' ? form.appliedAt : ''}
                  onChange={(e) => setForm({ ...form, appliedAt: e.target.value })}
                />
              </label>
              <label className="form-full">
                Notes
                <textarea
                  rows={4}
                  value={form.notes || ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <label className="form-full">
                Job description (paste for AI matching)
                <textarea
                  rows={6}
                  value={form.jdText || ''}
                  onChange={(e) => setForm({ ...form, jdText: e.target.value })}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={loadState === 'saving'}>
                {loadState === 'saving' ? 'Saving…' : editing ? 'Save changes' : 'Add application'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, tone, hint }: { label: string; value: number | string; tone?: string; hint?: string }) {
  return (
    <div
      className={`stat-card ${tone ? `stat-card--${tone}` : ''}`}
      title={hint}
      aria-label={hint ? `${label}. ${hint}` : label}
    >
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}

function KanbanColumn({
  status,
  jobs,
  onEdit,
  onDelete,
  onMove,
}: {
  status: JobStatus;
  jobs: JobApplication[];
  onEdit: (job: JobApplication) => void;
  onDelete: (job: JobApplication) => void;
  onMove: (job: JobApplication, next: JobStatus) => void;
}) {
  return (
    <div className="kanban-column" role="listitem" data-status={status}>
      <header>
        <h3>{JOB_STATUS_LABELS[status]}</h3>
        <span className="badge">{jobs.length}</span>
      </header>
      {jobs.length === 0 ? (
        <div className="kanban-empty muted">No applications yet.</div>
      ) : (
        <ul>
          {jobs.map((job) => (
            <li key={job.id} className="kanban-card">
              <div className="kanban-card__top">
                <strong>{job.company}</strong>
                <span className="muted"> — {job.role}</span>
              </div>
              {job.location ? <div className="muted">{job.location}</div> : null}
              {job.nextActionAt ? (
                <div className="muted">
                  Next action: {new Date(job.nextActionAt).toLocaleDateString()}
                </div>
              ) : null}
              <div className="kanban-card__actions">
                <button className="btn tertiary" onClick={() => onEdit(job)} type="button">
                  Edit
                </button>
                <select
                  aria-label="Move to status"
                  value={job.status}
                  onChange={(e) => onMove(job, e.target.value as JobStatus)}
                >
                  {[...ACTIVE_STATUSES, ...CLOSED_STATUSES].map((s) => (
                    <option key={s} value={s}>
                      {JOB_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button className="btn tertiary danger" onClick={() => onDelete(job)} type="button">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
