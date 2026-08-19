'use client';

/**
 * Live openings panel for the Job Tracker. Searches the real jobs feed and lets
 * the user one-click "Track" an opening — creating a JobApplication pre-filled
 * from the listing. AI-gated (the API gates it); users without our AI see an upsell
 * to add their own AI key (free) or get CallbackCV Plus.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TkxButton, TkxInput } from 'tekivex-ui';
import { PROFESSION_INDUSTRIES } from 'resume-builder-shared';
import { api, type JobOpening } from '@/src/lib/api';
import { openingToJobInput } from '@/src/lib/job-utils';

// localStorage keys — the dashboard persists the industry pick; this panel
// persists the last search so a returning user picks up where they left off.
const SELECTED_ROLE_KEY = 'rb_selected_role';
const SELECTED_INDUSTRY_KEY = 'rb_selected_industry';
const JOBS_QUERY_KEY = 'rb_jobs_q';
const JOBS_LOCATION_KEY = 'rb_jobs_loc';

export default function LiveOpeningsPanel({ onTracked }: { onTracked: () => void }) {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from the user's profile on mount (only when the fields are
  // empty): last search > selected role > first role of the selected
  // industry. Editable — this is a starting point, not a restriction.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lastQ = window.localStorage.getItem(JOBS_QUERY_KEY) || '';
    const lastLoc = window.localStorage.getItem(JOBS_LOCATION_KEY) || '';
    const selectedRole = window.localStorage.getItem(SELECTED_ROLE_KEY) || '';
    const industryId = window.localStorage.getItem(SELECTED_INDUSTRY_KEY) || '';
    const industryRole = PROFESSION_INDUSTRIES.find((industry) => industry.id === industryId)?.roles[0]?.label || '';
    const nextQ = lastQ || selectedRole || industryRole;
    setQ((prev) => prev || nextQ);
    setLocation((prev) => prev || lastLoc);
    if (nextQ || lastLoc) setPrefilled(true);
  }, []);
  const [openings, setOpenings] = useState<JobOpening[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [tracking, setTracking] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [savingAlert, setSavingAlert] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');

  async function search() {
    setError('');
    setPaywall(false);
    setOpenings(null);
    if (q.trim().length < 2) { setError('Enter a role or skill to search.'); return; }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(JOBS_QUERY_KEY, q.trim());
      if (location.trim()) window.localStorage.setItem(JOBS_LOCATION_KEY, location.trim());
      else window.localStorage.removeItem(JOBS_LOCATION_KEY);
    }
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
        {/* Labels hidden visually — the heading directly above already says
         * "Find live openings", so visible field headings would be noise in a
         * one-row search bar. Screen readers keep the names. The wrapper divs
         * carry the flex sizing the bare inputs had. */}
        <div className="hide-field-label" style={{ flex: '1 1 220px' }}>
          <TkxInput label="Role or skill" placeholder="Role or skill, e.g. React Engineer" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        </div>
        <div className="hide-field-label" style={{ flex: '1 1 160px' }}>
          <TkxInput label="Location" placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        </div>
        <TkxButton variant="solid" colorScheme="primary" onClick={search} disabled={loading}>{loading ? 'Searching…' : 'Search'}</TkxButton>
        <TkxButton
          variant="outline"
          data-testid="save-job-alert"
          disabled={savingAlert || q.trim().length < 2}
          title="Email me when new openings match this search"
          onClick={async () => {
            setSavingAlert(true);
            setAlertMsg('');
            try {
              await api.createJobAlert({ query: q.trim(), location: location.trim() || undefined });
              setAlertMsg("Alert saved — we'll email you when new openings match this search.");
            } catch (err: unknown) {
              setAlertMsg(err instanceof Error ? err.message : 'Could not save the alert.');
            } finally {
              setSavingAlert(false);
            }
          }}
        >
          {savingAlert ? 'Saving…' : '🔔 Alert me'}
        </TkxButton>
      </div>
      {prefilled ? (
        <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          Pre-filled from your profile — edit to search anything.
        </p>
      ) : null}
      {alertMsg ? <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>{alertMsg}</p> : null}

      {paywall && (
        <div className="alert" style={{ background: 'rgba(176,121,6,0.1)', padding: 12, borderRadius: 8 }}>
          <Link href="/settings">Add your own AI key in Settings (free)</Link> to use this now — or get{' '}
          <Link href="/billing">CallbackCV Plus (₹499/mo)</Link> for our AI across every feature.
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
                <TkxButton onClick={() => track(job)} disabled={isTracked || tracking === job.url}>
                  {isTracked ? '✓ Tracked' : tracking === job.url ? 'Adding…' : '+ Track'}
                </TkxButton>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
