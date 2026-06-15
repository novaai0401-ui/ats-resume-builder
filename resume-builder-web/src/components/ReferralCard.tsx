'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '@/src/lib/api';

/**
 * R-037 — Settings card: your referral link + credit balance.
 *
 * Copy is deliberately concrete: "1 referral = 1 free export" is
 * legible without a pricing table because the sachet rail already
 * taught users one export ≈ ₹49.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

type ReferralMe = {
  code: string;
  creditedReferrals: number;
  credits: number;
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

function referralUrl(code: string) {
  if (typeof window === 'undefined') return `/auth/register?ref=${code}`;
  return `${window.location.origin}/auth/register?ref=${code}`;
}

export default function ReferralCard() {
  const [me, setMe] = useState<ReferralMe | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/referrals/me');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ReferralMe;
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const copy = async () => {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(referralUrl(me.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Hide entirely on failure — a broken referral card is worse than
  // no referral card, and the feature is purely additive.
  if (failed) return null;

  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="referral-title">
      <h2 id="referral-title" style={{ marginTop: 0 }}>Refer a friend, earn exports</h2>
      <p className="small" style={{ color: '#5a6778', marginTop: 4 }}>
        Each friend who signs up with your link earns you <strong>1 free resume
        export</strong> — usable even after your monthly limit runs out.
      </p>

      {me === null ? (
        <p className="small" style={{ color: '#5a6778' }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <code
              style={{
                flex: 1,
                minWidth: 0,
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {referralUrl(me.code)}
            </code>
            <button className="btn" onClick={copy} style={{ fontSize: 13, padding: '6px 14px' }}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
          <p className="small" style={{ margin: '10px 0 0', color: '#5a6778' }}>
            {me.creditedReferrals} successful referral{me.creditedReferrals === 1 ? '' : 's'} ·{' '}
            <strong style={{ color: '#1e7a3a' }}>
              {me.credits} export credit{me.credits === 1 ? '' : 's'}
            </strong>{' '}
            available
          </p>
        </>
      )}
    </section>
  );
}
