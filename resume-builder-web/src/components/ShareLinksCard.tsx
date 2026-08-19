'use client';

import { useCallback, useEffect, useState } from 'react';
import { TkxSelect } from 'tekivex-ui';
import { getAccessToken } from '@/src/lib/api';

/**
 * R-038 — Settings card for managing public share links.
 *
 * What the user can do here:
 *   - See their existing share links (URL, view count, download count,
 *     created-at, "Indexed by search" + "Contact masked" toggles).
 *   - Create a new link for one of their saved resumes.
 *   - Toggle maskContact / allowSearchIndexing per link.
 *   - Revoke (soft delete) a link. Once revoked the URL returns 404.
 *
 * What's deliberately NOT here yet (follow-up commit):
 *   - Editor's Export modal integration ("Share this resume" CTA).
 *   - Per-link visit log UI ("3 views from Bengaluru this week").
 *   - expiresAt picker.
 *   - Contact-relay form (recipient side of maskContact).
 */

type ShareLink = {
  id: string;
  slug: string;
  resumeId: string;
  resumeVersionId: string | null;
  enabled: boolean;
  headline: string | null;
  allowSearchIndexing: boolean;
  maskContact: boolean;
  expiresAt: string | null;
  viewCount: number;
  downloadCount: number;
  lastVisitedAt: string | null;
  createdAt: string;
};

type Resume = { id: string; title: string };

type ResumeVersion = {
  id: string;
  label: string | null;
  createdAt: string;
};

type VisitEvent = {
  id: string;
  kind: 'view' | 'download';
  userAgent: string | null;
  country: string | null;
  city: string | null;
  referrer: string | null;
  createdAt: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

function authedFetch(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
  });
}

function publicShareUrl(slug: string) {
  if (typeof window === 'undefined') return `/p/${slug}`;
  return `${window.location.origin}/p/${slug}`;
}

export default function ShareLinksCard() {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [pickedResumeId, setPickedResumeId] = useState<string>('');
  const [headline, setHeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Per-link expanded UI state. Map by link.id so multiple links can
  // be inspected at once without clobbering each other.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [events, setEvents] = useState<Record<string, VisitEvent[]>>({});
  const [versionsByResume, setVersionsByResume] = useState<Record<string, ResumeVersion[]>>({});

  const load = useCallback(async () => {
    try {
      const [linksRes, resumesRes] = await Promise.all([
        authedFetch('/share-links'),
        authedFetch('/resumes'),
      ]);
      if (linksRes.ok) setLinks(await linksRes.json());
      else setLinks([]);
      if (resumesRes.ok) {
        const data = await resumesRes.json();
        const list: Resume[] = Array.isArray(data) ? data : (data?.resumes ?? []);
        setResumes(list);
        if (list[0]) setPickedResumeId((prev) => prev || list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load share links');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createLink = async () => {
    if (!pickedResumeId) {
      setError('Pick a resume first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch('/share-links', {
        method: 'POST',
        body: JSON.stringify({
          resumeId: pickedResumeId,
          headline: headline.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      setHeadline('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setBusy(false);
    }
  };

  const patchLink = async (id: string, patch: Partial<ShareLink>) => {
    const res = await authedFetch(`/share-links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (res.ok) await load();
  };

  const revoke = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Revoke this share link? The public URL will return 404 immediately.')) return;
    const res = await authedFetch(`/share-links/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const loadEvents = async (id: string) => {
    try {
      const res = await authedFetch(`/share-links/${id}/events`);
      if (res.ok) {
        const data = (await res.json()) as VisitEvent[];
        setEvents((prev) => ({ ...prev, [id]: data }));
      }
    } catch {
      // visit log is non-critical — silent fail keeps the card usable
    }
  };

  const loadVersions = async (resumeId: string) => {
    if (versionsByResume[resumeId]) return;
    try {
      const res = await authedFetch(`/resumes/${resumeId}/versions`);
      if (res.ok) {
        const data = await res.json();
        const list: ResumeVersion[] = Array.isArray(data) ? data : (data?.versions ?? []);
        setVersionsByResume((prev) => ({ ...prev, [resumeId]: list }));
      }
    } catch {
      // version list is optional UI; show nothing on failure
    }
  };

  const toggleExpand = (link: ShareLink) => {
    setExpanded((prev) => {
      const next = !prev[link.id];
      if (next) {
        void loadEvents(link.id);
        void loadVersions(link.resumeId);
      }
      return { ...prev, [link.id]: next };
    });
  };

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(publicShareUrl(slug));
      setCopied(slug);
      setTimeout(() => setCopied((s) => (s === slug ? null : s)), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="share-links-title">
      <h2 id="share-links-title" style={{ marginTop: 0 }}>
        Public share links
      </h2>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 4 }}>
        Turn a saved resume into a public URL you can paste in an outreach email,
        a LinkedIn message, or your bio. Recruiters can view the portfolio and
        download the PDF — no login required. <strong>Strictly opt-in:</strong>{' '}
        nothing becomes public until you create a link here, and one click revokes it.
      </p>

      <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
        <TkxSelect
          label="Resume"
          searchable
          value={pickedResumeId || undefined}
          isDisabled={busy || resumes.length === 0}
          placeholder={resumes.length === 0 ? 'No saved resumes yet' : 'Select a resume'}
          options={resumes.map((r) => ({ value: r.id, label: r.title || r.id.slice(0, 8) }))}
          onChange={(value) => setPickedResumeId(String(value || ''))}
        />
        <label className="small" style={{ display: 'grid', gap: 4 }}>
          Headline (optional — shown at the top of the public page)
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder='e.g. "Open to senior frontend roles in Bengaluru / remote"'
            maxLength={280}
            disabled={busy}
          />
        </label>
        <div>
          <button
            className="btn"
            onClick={createLink}
            disabled={busy || !pickedResumeId}
            style={{ marginTop: 4 }}
          >
            {busy ? 'Creating…' : 'Create share link'}
          </button>
        </div>
        {error ? (
          <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
        ) : null}
      </div>

      <div style={{ marginTop: 18 }}>
        {links === null ? (
          <p className="small" style={{ color: 'var(--muted)' }}>Loading…</p>
        ) : links.length === 0 ? (
          <p className="small" style={{ color: 'var(--muted)' }}>You don't have any share links yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {links.map((link) => (
              <li
                key={link.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  background: link.enabled ? 'var(--card)' : 'var(--surface-alt)',
                  opacity: link.enabled ? 1 : 0.7,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <code
                    style={{
                      background: 'var(--surface-alt)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 13,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {publicShareUrl(link.slug)}
                  </code>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn ghost" onClick={() => copy(link.slug)} style={btnSm}>
                      {copied === link.slug ? 'Copied ✓' : 'Copy link'}
                    </button>
                    <a
                      className="btn ghost"
                      href={publicShareUrl(link.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={btnSm}
                    >
                      Open
                    </a>
                    {link.enabled ? (
                      <button className="btn ghost" onClick={() => revoke(link.id)} style={{ ...btnSm, color: 'var(--danger)' }}>
                        Revoke
                      </button>
                    ) : (
                      <span className="small" style={{ alignSelf: 'center', color: 'var(--muted)' }}>Revoked</span>
                    )}
                  </div>
                </div>
                {link.headline ? (
                  <p className="small" style={{ margin: '6px 0 0', color: 'var(--ink)' }}>{link.headline}</p>
                ) : null}
                <p className="small" style={{ margin: '6px 0 0', color: 'var(--muted)' }}>
                  {link.viewCount} view{link.viewCount === 1 ? '' : 's'} ·{' '}
                  {link.downloadCount} download{link.downloadCount === 1 ? '' : 's'}
                  {link.lastVisitedAt
                    ? ` · last visit ${new Date(link.lastVisitedAt).toLocaleString()}`
                    : ' · no visits yet'}
                </p>
                {link.enabled ? (
                  <>
                    <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <label className="small" style={toggleStyle}>
                        <input
                          type="checkbox"
                          checked={link.maskContact}
                          onChange={(e) => patchLink(link.id, { maskContact: e.target.checked })}
                        />
                        Mask email + phone
                      </label>
                      <label className="small" style={toggleStyle}>
                        <input
                          type="checkbox"
                          checked={link.allowSearchIndexing}
                          onChange={(e) => patchLink(link.id, { allowSearchIndexing: e.target.checked })}
                        />
                        Let search engines index this page
                      </label>
                      <button
                        className="btn ghost"
                        onClick={() => toggleExpand(link)}
                        style={{ ...btnSm, marginLeft: 'auto' }}
                        aria-expanded={Boolean(expanded[link.id])}
                      >
                        {expanded[link.id] ? 'Hide details' : 'Visit log & options'}
                      </button>
                    </div>
                    {expanded[link.id] ? (
                      <LinkDetails
                        link={link}
                        events={events[link.id] || null}
                        versions={versionsByResume[link.resumeId] || null}
                        onPatch={(patch) => patchLink(link.id, patch)}
                      />
                    ) : null}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const btnSm: React.CSSProperties = { fontSize: 12, padding: '4px 10px' };
const toggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--ink)',
};

/**
 * Per-link expanded panel:
 *   - resumeVersionId picker (pins the public page to a frozen snapshot
 *     so future edits don't change what recruiters see — C-007: every
 *     view also gets attributable back to that specific version)
 *   - expiresAt picker (auto-revoke on a date)
 *   - visit log: last 50 view/download events with timestamp + coarse
 *     geo + truncated UA. Owner sees activity, NEVER the raw IP.
 */
function LinkDetails({
  link,
  events,
  versions,
  onPatch,
}: {
  link: ShareLink;
  events: VisitEvent[] | null;
  versions: ResumeVersion[] | null;
  onPatch: (patch: Partial<ShareLink>) => void;
}) {
  const expiresValue = link.expiresAt ? link.expiresAt.slice(0, 10) : '';
  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        background: 'var(--surface-alt)',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <TkxSelect
          label="Pin to version (optional)"
          clearable
          value={link.resumeVersionId || '' || undefined}
          placeholder="Live resume (always latest)"
          isLoading={versions === null}
          hint={
            versions !== null && versions.length === 0
              ? 'No snapshots saved for this resume'
              : undefined
          }
          options={(versions ?? []).map((v) => ({
            value: v.id,
            label: v.label || `Snapshot ${new Date(v.createdAt).toLocaleDateString()}`,
          }))}
          onChange={(value) =>
            onPatch({ resumeVersionId: String(value || '') || null } as Partial<ShareLink>)
          }
        />
        <label className="small" style={{ display: 'grid', gap: 4 }}>
          Expires on (optional)
          <input
            type="date"
            value={expiresValue}
            onChange={(e) => {
              const v = e.target.value;
              // ISO yyyy-mm-dd → end-of-day UTC so the link stays usable
              // through the day the user picked, not until midnight UTC
              // morning which silently revokes a few hours early in IST.
              onPatch({ expiresAt: v ? `${v}T23:59:59Z` : null } as Partial<ShareLink>);
            }}
            min={new Date().toISOString().slice(0, 10)}
          />
        </label>
      </div>
      <p className="small" style={{ marginTop: 10, color: 'var(--muted)' }}>
        {link.resumeVersionId
          ? 'This link is pinned to a saved snapshot. Future edits to the resume will NOT change what recruiters see here.'
          : 'This link follows the latest version of your resume. Edits show up immediately.'}
        {link.expiresAt
          ? ` Will auto-revoke after ${new Date(link.expiresAt).toLocaleDateString()}.`
          : ''}
      </p>

      <h3 style={{ margin: '14px 0 6px', fontSize: 13, color: 'var(--primary)' }}>Visits</h3>
      {events === null ? (
        <p className="small" style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : events.length === 0 ? (
        <p className="small" style={{ color: 'var(--muted)' }}>No visits yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {events.map((e) => (
            <li
              key={e.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                fontSize: 12,
                color: 'var(--ink)',
                background: 'var(--card)',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: e.kind === 'download' ? 'var(--success)' : 'var(--primary)',
                  minWidth: 70,
                }}
              >
                {e.kind === 'download' ? 'Download' : 'View'}
              </span>
              <span style={{ flex: 1 }}>
                {new Date(e.createdAt).toLocaleString()}
                {e.country || e.city ? (
                  <span style={{ color: 'var(--muted)' }}> · {[e.city, e.country].filter(Boolean).join(', ')}</span>
                ) : null}
                {e.referrer ? (
                  <span style={{ color: 'var(--muted)' }}> · from {hostnameOf(e.referrer)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="small" style={{ marginTop: 8, color: 'var(--muted)', fontSize: 11 }}>
        We never store the visitor's IP address. Each row above is the most we know.
      </p>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}
