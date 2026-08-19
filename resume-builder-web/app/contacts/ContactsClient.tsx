'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TkxSelect } from 'tekivex-ui';
import type {
  JobApplication,
  NetworkContact,
  NetworkContactInput,
  ContactRelationship,
} from 'resume-builder-shared';
import { CONTACT_RELATIONSHIPS } from 'resume-builder-shared';
import { api } from '@/src/lib/api';
import DataLoader from '@/src/components/DataLoader';

type LoadState = 'idle' | 'loading' | 'saving' | 'error';

const RELATIONSHIP_LABELS: Record<ContactRelationship, string> = {
  recruiter: 'Recruiter',
  referrer: 'Referrer',
  colleague: 'Colleague',
  manager: 'Manager',
  alumni: 'Alumni',
  friend: 'Friend',
  other: 'Other',
};

const EMPTY_FORM: NetworkContactInput = {
  name: '',
  company: '',
  title: '',
  email: '',
  linkedinUrl: '',
  phone: '',
  relationship: 'other',
  jobApplicationId: '',
  notes: '',
  nextFollowUpAt: '',
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

/** Whole-day difference from today; negative = overdue. */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}

function compactPayload(form: NetworkContactInput): NetworkContactInput {
  const out: NetworkContactInput = {
    name: form.name.trim(),
    relationship: form.relationship || 'other',
  };
  for (const key of ['company', 'title', 'email', 'linkedinUrl', 'phone', 'notes'] as const) {
    const v = (form as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[key] = v.trim();
  }
  out.jobApplicationId = form.jobApplicationId ? String(form.jobApplicationId) : null;
  out.nextFollowUpAt = form.nextFollowUpAt ? fromDateInput(String(form.nextFollowUpAt)) : null;
  return out;
}

export default function ContactsClient() {
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<NetworkContact | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NetworkContactInput>(EMPTY_FORM);

  const refresh = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const [rows, jobRows] = await Promise.all([api.listContacts(), api.listJobs()]);
      setContacts(rows);
      setJobs(jobRows);
      setLoadState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const jobLabel = useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      const job = jobs.find((j) => j.id === id);
      return job ? `${job.company} — ${job.role}` : null;
    },
    [jobs],
  );

  const dueSoon = useMemo(
    () =>
      contacts
        .filter((c) => {
          const delta = daysUntil(c.nextFollowUpAt);
          return delta != null && delta <= 7;
        })
        .sort((a, b) =>
          String(a.nextFollowUpAt).localeCompare(String(b.nextFollowUpAt)),
        ),
    [contacts],
  );

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(contact: NetworkContact) {
    setEditing(contact);
    setForm({
      name: contact.name,
      company: contact.company || '',
      title: contact.title || '',
      email: contact.email || '',
      linkedinUrl: contact.linkedinUrl || '',
      phone: contact.phone || '',
      relationship: contact.relationship,
      jobApplicationId: contact.jobApplicationId || '',
      notes: contact.notes || '',
      nextFollowUpAt: toDateInput(contact.nextFollowUpAt),
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
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setLoadState('saving');
    setError(null);
    try {
      const payload = compactPayload(form);
      if (editing) {
        const updated = await api.updateContact(editing.id, payload);
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await api.createContact(payload);
        setContacts((prev) => [created, ...prev]);
      }
      closeForm();
      setLoadState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save contact');
      setLoadState('error');
    }
  }

  async function removeContact(contact: NetworkContact) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${contact.name}"?`)) return;
    setLoadState('saving');
    try {
      await api.deleteContact(contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      setLoadState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete contact');
      setLoadState('error');
    }
  }

  return (
    <div className="card" data-testid="contacts-root">
      <div className="jobs-header">
        <div>
          <h1 className="heading-xl">Networking &amp; Referrals</h1>
          <p className="muted">
            Your warm-intro network in one place — recruiters, referrers, and alumni.
            Set a follow-up date and no good connection goes cold.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={openNew}>
          + Add contact
        </button>
      </div>

      {error ? (
        <div role="alert" className="alert alert-error jobs-alert">
          {error}
        </div>
      ) : null}

      {dueSoon.length > 0 ? (
        <section className="jobs-upcoming" aria-label="Follow up soon">
          <h2 className="heading-md">Follow up with these people</h2>
          <ul>
            {dueSoon.map((c) => {
              const delta = daysUntil(c.nextFollowUpAt);
              const label =
                delta == null
                  ? ''
                  : delta < 0
                  ? `${Math.abs(delta)} day(s) overdue`
                  : delta === 0
                  ? 'Today'
                  : `In ${delta} day(s)`;
              return (
                <li key={c.id}>
                  <strong>{c.name}</strong>
                  {c.company ? <span className="muted"> · {c.company}</span> : null}
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
        <DataLoader label="Loading your contacts…" />
      ) : contacts.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No contacts yet. Add the recruiter, referrer, or alum who could open a door —
          then set a follow-up date so you actually reach back out.
        </p>
      ) : (
        <ul className="contacts-list" role="list" style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12, marginTop: 16 }}>
          {contacts.map((contact) => {
            const delta = daysUntil(contact.nextFollowUpAt);
            const overdue = delta != null && delta < 0;
            const linked = jobLabel(contact.jobApplicationId);
            return (
              <li key={contact.id} className="card" role="listitem" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{contact.name}</strong>
                      <span className="badge" style={{ fontSize: 12 }}>
                        {RELATIONSHIP_LABELS[contact.relationship]}
                      </span>
                    </div>
                    {contact.title || contact.company ? (
                      <div className="muted" style={{ fontSize: 14 }}>
                        {[contact.title, contact.company].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 14 }}>
                      {contact.email ? <a href={`mailto:${contact.email}`}>Email</a> : null}
                      {contact.linkedinUrl ? (
                        <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer">
                          LinkedIn
                        </a>
                      ) : null}
                      {contact.phone ? <span className="muted">{contact.phone}</span> : null}
                    </div>
                    {linked ? (
                      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                        Referral for: <strong>{linked}</strong>
                      </div>
                    ) : null}
                    {contact.notes ? (
                      <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0 }}>{contact.notes}</p>
                    ) : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {contact.nextFollowUpAt ? (
                      <span
                        className={`upcoming-chip ${overdue ? 'overdue' : ''}`}
                        title="Next follow-up"
                      >
                        {overdue
                          ? `${Math.abs(delta as number)}d overdue`
                          : delta === 0
                          ? 'Follow up today'
                          : `Follow up in ${delta}d`}
                      </span>
                    ) : null}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn secondary" onClick={() => openEdit(contact)}>
                        Edit
                      </button>
                      <button type="button" className="btn secondary" onClick={() => removeContact(contact)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showForm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Contact">
          <form className="modal card" onSubmit={submitForm}>
            <h2 className="heading-lg">{editing ? 'Edit contact' : 'New contact'}</h2>
            <div className="form-grid">
              <label>
                Name *
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <TkxSelect
                label="Relationship"
                value={form.relationship || 'other'}
                options={CONTACT_RELATIONSHIPS.map((r) => ({
                  value: r,
                  label: RELATIONSHIP_LABELS[r],
                }))}
                onChange={(value) =>
                  setForm({ ...form, relationship: String(value || '') as ContactRelationship })
                }
              />
              <label>
                Company
                <input
                  value={form.company || ''}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </label>
              <label>
                Title
                <input
                  value={form.title || ''}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                LinkedIn URL
                <input
                  type="url"
                  value={form.linkedinUrl || ''}
                  onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                />
              </label>
              <label>
                Phone
                <input
                  value={form.phone || ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                Next follow-up
                <input
                  type="date"
                  value={typeof form.nextFollowUpAt === 'string' ? form.nextFollowUpAt : ''}
                  onChange={(e) => setForm({ ...form, nextFollowUpAt: e.target.value })}
                />
              </label>
              <TkxSelect
                label="Linked application"
                searchable
                clearable
                value={form.jobApplicationId || '' || undefined}
                placeholder="— None —"
                options={jobs.map((j) => ({ value: j.id, label: `${j.company} — ${j.role}` }))}
                onChange={(value) => setForm({ ...form, jobApplicationId: String(value || '') })}
              />
              <label className="form-full">
                Notes
                <textarea
                  rows={4}
                  value={form.notes || ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={loadState === 'saving'}>
                {loadState === 'saving' ? 'Saving…' : editing ? 'Save changes' : 'Add contact'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
