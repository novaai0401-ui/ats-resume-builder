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

/**
 * "Posted 3 days ago" rather than a raw timestamp — recency is what people
 * actually judge a listing on, and an exact date makes them do the arithmetic.
 * Returns '' for a missing or unparseable date so the caller can omit it
 * instead of rendering "Invalid Date".
 */
function postedLabel(postedAt: string | null): string {
  if (!postedAt) return '';
  const then = new Date(postedAt).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 0) return '';
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Posted last month' : `Posted ${months} months ago`;
}

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
  const [matching, setMatching] = useState(false);
  // Explains where the current results came from. The prefill above is a guess
  // from localStorage; a profile match is derived from the actual resume, and
  // the user should be able to tell which they are looking at.
  const [matchNote, setMatchNote] = useState('');

  /**
   * Search using the user's most recent resume instead of the text fields.
   *
   * The server derives the query (latest job title + a few skills, filtered to
   * their city), so this needs no input at all. It writes the derived query
   * back into the fields so the search stays visible and editable — otherwise
   * results look arbitrary and a thin resume is indistinguishable from a bad
   * feed.
   */
  async function matchFromResume() {
    setError('');
    setPaywall(false);
    setOpenings(null);
    setMatchNote('');
    setMatching(true);
    try {
      const resumes = await api.listResumes();
      if (!resumes.length) {
        setError('Create a resume first — matching reads your role and skills from it.');
        return;
      }
      // listResumes is newest-first, so [0] is what they last worked on.
      const res = await api.jobMatches(resumes[0].id, { limit: 10 });

      if (!res.configured) {
        setError('Live job feed is not configured on this server yet.');
        return;
      }
      if (res.reason) {
        // A provider refusal is a server fault, not a thin resume. Showing the
        // provider's own words means an admin can act on it instead of guessing
        // — the message usually names the exact IP that was rejected.
        setError(
          res.providerErrors?.length
            ? `${res.reason} (${res.providerErrors.join('; ')})`
            : res.reason,
        );
        return;
      }

      setOpenings(res.jobs);
      // Show and keep the derived search so it can be refined by hand.
      setQ(res.query);
      setLocation(res.where || '');
      setPrefilled(false);
      setMatchNote(
        (res.broadened
          ? // Say so explicitly. Silently widening and presenting the results as
            // an exact profile match would misrepresent how close they are.
            `Your exact role matched nothing, so this was broadened — searched "${res.query}"`
          : `Matched from your resume — searched "${res.query}"`) +
          `${res.where ? ` in ${res.where}` : ' (any location)'}. Edit above to refine.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not match jobs to your resume.';
      if (/LIVE_JOBS_REQUIRES_PLAN/i.test(msg)) setPaywall(true);
      else setError(msg);
    } finally {
      setMatching(false);
    }
  }

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
        <TkxButton variant="solid" colorScheme="primary" onClick={search} disabled={loading || matching}>{loading ? 'Searching…' : 'Search'}</TkxButton>
        <TkxButton
          variant="outline"
          data-testid="match-from-resume"
          onClick={matchFromResume}
          disabled={loading || matching}
          title="Search using the role and skills from your latest resume"
        >
          {matching ? 'Matching…' : '🎯 Match my resume'}
        </TkxButton>
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
      {matchNote ? (
        <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }} data-testid="match-note">
          {matchNote}
        </p>
      ) : prefilled ? (
        <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          Pre-filled from your last search — or hit “Match my resume” to use your actual role and skills.
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
                  {/* Age and feed. Recency is the first thing anyone judges a
                      listing on, and naming the source lets a user tell a stale
                      aggregator entry from a fresh one. */}
                  <div className="muted" style={{ fontSize: 11, opacity: 0.8 }}>
                    {[postedLabel(job.postedAt), job.source].filter(Boolean).join(' · ')}
                  </div>
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
