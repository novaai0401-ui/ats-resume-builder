'use client';

/**
 * Live openings panel for the Job Tracker. Searches the real jobs feed and lets
 * the user one-click "Track" an opening — creating a JobApplication pre-filled
 * from the listing. AI-gated (the API gates it); users without our AI see an upsell
 * to add their own AI key (free) or get Pocket Resume Plus.
 */

import { useState } from 'react';
import Link from 'next/link';
import { TkxButton } from 'tekivex-ui';
import { api, type JobOpening } from '@/src/lib/api';
import { openingToJobInput } from '@/src/lib/job-utils';

export default function LiveOpeningsPanel({ onTracked }: { onTracked: () => void }) {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [openings, setOpenings] = useState<JobOpening[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [tracking, setTracking] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Set<string>>(new Set());

  async function search() {
    setError('');
    setPaywall(false);
    setOpenings(null);
    if (q.trim().length < 2) { setError('Enter a role or skill to search.'); return; }
    setLoading(true);
    try {
      const res = await api.liveOpenings(q.trim(), location.trim() || undefined);
      setOpenings(res.openings);
      if (!res.available) setError('Live job feed is not configured on this server yet.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed.';
      if (/LIVE_JOBS_REQUIRES_PLAN/i.test(msg)) setPaywall(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function track(job: JobOpening) {
    setTracking(job.url);
    try {
      await api.createJob(openingToJobInput(job));
      setTracked((prev) => new Set(prev).add(job.url));
      onTracked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not track this opening.');
    } finally {
      setTracking(null);
    }
  }

  return (
    <section className="jobs-live-openings" style={{ border: '1px solid var(--border, #ddd)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <h2 className="heading-md" style={{ marginTop: 0 }}>Find live openings</h2>
      <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>Search real postings and add them to your board in one tap.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input className="input" placeholder="Role or skill, e.g. React Engineer" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} style={{ flex: '1 1 220px' }} />
        <input className="input" placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} style={{ flex: '1 1 160px' }} />
        <TkxButton variant="solid" colorScheme="primary" onClick={search} disabled={loading}>{loading ? 'Searching…' : 'Search'}</TkxButton>
      </div>

      {paywall && (
        <div className="alert" style={{ background: 'rgba(176,121,6,0.1)', padding: 12, borderRadius: 8 }}>
          <Link href="/settings">Add your own AI key in Settings (free)</Link> to use this now — or get{' '}
          <Link href="/billing">Pocket Resume Plus (₹499/mo)</Link> for our AI across every feature.
        </div>
      )}
      {error && <p className="muted" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      {openings && openings.length === 0 && !error && (
        <p className="muted" style={{ fontSize: 13 }}>No openings matched. Try a broader role or location.</p>
      )}

      {openings && openings.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {openings.map((job, i) => {
            const isTracked = tracked.has(job.url);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 10, border: '1px solid var(--border, #eee)', borderRadius: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <a href={job.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{job.title}</a>
                  <div className="muted" style={{ fontSize: 12 }}>{[job.company, job.location, job.salaryText].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="btn" onClick={() => track(job)} disabled={isTracked || tracking === job.url}>
                  {isTracked ? '✓ Tracked' : tracking === job.url ? 'Adding…' : '+ Track'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
