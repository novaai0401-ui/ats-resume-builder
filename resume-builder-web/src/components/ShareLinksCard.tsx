'use client';

import { useCallback, useEffect, useState } from 'react';

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
  enabled: boolean;
  headline: string | null;
  allowSearchIndexing: boolean;
  maskContact: boolean;
  viewCount: number;
  downloadCount: number;
  lastVisitedAt: string | null;
  createdAt: string;
};

type Resume = { id: string; title: string };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

function authedFetch(path: string, init: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('rb_access_token') : null;
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
      <p className="small" style={{ color: '#5a6778', marginTop: 4 }}>
        Turn a saved resume into a public URL you can paste in an outreach email,
        a LinkedIn message, or your bio. Recruiters can view the portfolio and
        download the PDF — no login required. <strong>Strictly opt-in:</strong>{' '}
        nothing becomes public until you create a link here, and one click revokes it.
      </p>

      <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
        <label className="small" style={{ display: 'grid', gap: 4 }}>
          Resume
          <select
            value={pickedResumeId}
            onChange={(e) => setPickedResumeId(e.target.value)}
            disabled={busy || resumes.length === 0}
          >
            {resumes.length === 0 ? <option value="">No saved resumes yet</option> : null}
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>{r.title || r.id.slice(0, 8)}</option>
            ))}
          </select>
        </label>
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
          <p className="small" role="alert" style={{ color: '#b91c1c', margin: 0 }}>{error}</p>
        ) : null}
      </div>

      <div style={{ marginTop: 18 }}>
        {links === null ? (
          <p className="small" style={{ color: '#5a6778' }}>Loading…</p>
        ) : links.length === 0 ? (
          <p className="small" style={{ color: '#5a6778' }}>You don't have any share links yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {links.map((link) => (
              <li
                key={link.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  background: link.enabled ? '#ffffff' : '#fafafa',
                  opacity: link.enabled ? 1 : 0.7,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <code
                    style={{
                      background: '#f1f5f9',
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
                      <button className="btn ghost" onClick={() => revoke(link.id)} style={{ ...btnSm, color: '#b91c1c' }}>
                        Revoke
                      </button>
                    ) : (
                      <span className="small" style={{ alignSelf: 'center', color: '#94a3b8' }}>Revoked</span>
                    )}
                  </div>
                </div>
                {link.headline ? (
                  <p className="small" style={{ margin: '6px 0 0', color: '#475569' }}>{link.headline}</p>
                ) : null}
                <p className="small" style={{ margin: '6px 0 0', color: '#5a6778' }}>
                  {link.viewCount} view{link.viewCount === 1 ? '' : 's'} ·{' '}
                  {link.downloadCount} download{link.downloadCount === 1 ? '' : 's'}
                  {link.lastVisitedAt
                    ? ` · last visit ${new Date(link.lastVisitedAt).toLocaleString()}`
                    : ' · no visits yet'}
                </p>
                {link.enabled ? (
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
                  </div>
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
  color: '#1f2937',
};
