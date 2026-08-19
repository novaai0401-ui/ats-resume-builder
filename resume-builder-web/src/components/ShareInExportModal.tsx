'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '@/src/lib/api';
import { TkxButton } from 'tekivex-ui';

/**
 * R-038 Phase 2 — discovery surface inside the editor's Export modal.
 *
 * The Settings card is where power users manage their links, but most
 * users never visit Settings. The moment the user opens "Export &
 * Finalize" they are thinking about handing the resume to someone —
 * which is exactly when a shareable URL is most valuable. This
 * component fits inside the existing modal and:
 *
 *   - shows the existing share link for this resume (if any) with a
 *     one-click copy;
 *   - offers a one-click "Create a share link" for resumes that don't
 *     have one yet;
 *   - links out to Settings for the deeper controls (visit log,
 *     mask-contact, version pinning, expiresAt).
 *
 * Strictly opt-in: nothing happens until the user clicks the button.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

type ShareLink = {
  id: string;
  slug: string;
  resumeId: string;
  enabled: boolean;
  viewCount: number;
  downloadCount: number;
};

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

export default function ShareInExportModal({ resumeId }: { resumeId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<ShareLink | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!resumeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/share-links');
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const all = (await res.json()) as ShareLink[];
        if (cancelled) return;
        // Prefer the most-recent enabled link for this resume; fall back
        // to a disabled one (so we don't surprise the user by silently
        // creating a fresh one when they already revoked one).
        const forResume = all.filter((l) => l.resumeId === resumeId);
        const live = forResume.find((l) => l.enabled);
        setExisting(live || forResume[0] || null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load share link');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [resumeId]);

  const createLink = async () => {
    if (!resumeId) return;
    setCreating(true);
    setError(null);
    try {
      const res = await authedFetch('/share-links', {
        method: 'POST',
        body: JSON.stringify({ resumeId }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const link = (await res.json()) as ShareLink;
      setExisting(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!existing) return;
    try {
      await navigator.clipboard.writeText(publicShareUrl(existing.slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!resumeId) return null;

  const container: React.CSSProperties = {
    marginTop: 14,
    padding: '12px 14px',
    background: '#f0f7ff',
    border: '1px solid #c4d5e6',
    borderRadius: 10,
  };

  return (
    <section style={container} aria-labelledby="share-cta-title">
      <h4 id="share-cta-title" style={{ margin: 0, fontSize: 14, color: '#1a3a5c' }}>
        Share this resume as a link
      </h4>
      <p className="small" style={{ margin: '4px 0 8px', color: '#475569' }}>
        Send recruiters a single URL. They view it without an account and download
        the PDF in one click. Downloads don't count against your monthly quota.
      </p>

      {loading ? (
        <p className="small" style={{ margin: 0, color: '#5a6778' }}>Loading…</p>
      ) : existing && existing.enabled ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <code
            style={{
              flex: 1,
              minWidth: 0,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {publicShareUrl(existing.slug)}
          </code>
          <TkxButton onClick={copy} style={{ fontSize: 13, padding: '6px 14px' }}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </TkxButton>
          <a
            href={publicShareUrl(existing.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost"
            style={{ fontSize: 13, padding: '6px 14px' }}
          >
            Open
          </a>
          <p className="small" style={{ margin: '6px 0 0', width: '100%', color: '#5a6778' }}>
            {existing.viewCount} view{existing.viewCount === 1 ? '' : 's'} ·{' '}
            {existing.downloadCount} download{existing.downloadCount === 1 ? '' : 's'} ·{' '}
            <a href="/settings#share-links-title" style={{ color: '#1a3a5c' }}>
              Manage in Settings →
            </a>
          </p>
        </div>
      ) : existing && !existing.enabled ? (
        <div>
          <p className="small" style={{ margin: 0, color: '#5a6778' }}>
            You revoked this resume's share link. Create a new one (a fresh URL) or
            re-enable the old one from Settings.
          </p>
          <TkxButton
           
            onClick={createLink}
            disabled={creating}
            style={{ fontSize: 13, padding: '6px 14px', marginTop: 6 }}
          >
            {creating ? 'Creating…' : 'Create a new share link'}
          </TkxButton>
        </div>
      ) : (
        <div>
          <TkxButton
           
            onClick={createLink}
            disabled={creating}
            style={{ fontSize: 13, padding: '6px 14px' }}
          >
            {creating ? 'Creating…' : 'Create a share link'}
          </TkxButton>
          <p className="small" style={{ margin: '6px 0 0', color: '#5a6778' }}>
            We'll generate an unguessable URL. You can revoke it any time, mask
            your email + phone, or pin to a specific snapshot from Settings.
          </p>
        </div>
      )}

      {error ? (
        <p className="small" role="alert" style={{ color: '#b91c1c', margin: '8px 0 0' }}>{error}</p>
      ) : null}
    </section>
  );
}
