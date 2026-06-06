'use client';

/**
 * Public, anonymized Outcome Card. Rendered from a signed token — no login,
 * no resume content, just the numbers. This is the brag/share surface that
 * turns the Outcome Loop into a growth loop.
 */

import { useEffect, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, type OutcomeCard } from '@/src/lib/api';

export default function ShareCardView({ token }: { token: string }) {
  const [card, setCard] = useState<OutcomeCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPublicOutcomeCard(token)
      .then(setCard)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this card.'));
  }, [token]);

  if (error) {
    return (
      <main style={wrap}>
        <div style={card404}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Link unavailable</h1>
          <p style={{ color: '#5a6778' }}>{error}</p>
          <a href="/" style={cta}>Build your own resume →</a>
        </div>
      </main>
    );
  }

  if (!card) return <main style={wrap}><p style={{ color: '#5a6778' }}>Loading…</p></main>;

  const chartData = card.trend.map((t) => ({
    label: `v${t.n}`,
    'ATS score': t.score,
    'Callback %': t.callback,
  }));
  const hasTrend = card.trend.length >= 2 && card.trend.some((t) => t.score !== null || t.callback !== null);

  return (
    <main style={wrap}>
      <div style={cardBox}>
        <div style={{ fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: '#7a8aa0' }}>
          Job-search results · verified by the tracker
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
          <div style={{ fontSize: 64, fontWeight: 800, color: '#10243a', lineHeight: 1 }}>{card.callbackRate}%</div>
          <div style={{ fontSize: 16, color: '#5a6778' }}>callback rate</div>
        </div>
        <div style={{ display: 'flex', gap: 28, marginTop: 16 }}>
          <Stat label="Applications" value={card.applied} />
          <Stat label="Responses" value={card.responses} />
          <Stat label="Interviews" value={card.interviews} />
          <Stat label="Offers" value={card.offers} />
        </div>

        {card.liftMultiplier && card.liftMultiplier >= 1.1 && (
          <div style={liftPill}>
            {card.liftMultiplier.toFixed(1)}× more replies after rewriting
            {card.liftDeltaPoints ? ` (+${card.liftDeltaPoints}pp)` : ''}
          </div>
        )}

        {hasTrend && (
          <div style={{ width: '100%', height: 240, marginTop: 20 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ATS score" stroke="#3b6cf6" strokeWidth={2} connectNulls dot />
                <Line type="monotone" dataKey="Callback %" stroke="#16a34a" strokeWidth={2} connectNulls dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eef1f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#9aa7b8' }}>
            As of {new Date(card.generatedAt).toLocaleDateString()} · no resume content shared
          </span>
          <a href="/" style={cta}>Measure your own callback rate →</a>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#10243a' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#7a8aa0' }}>{label}</div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#f5f7fa' };
const cardBox: React.CSSProperties = { width: '100%', maxWidth: 640, background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 8px 40px rgba(16,36,58,0.08)' };
const card404: React.CSSProperties = { ...cardBox, textAlign: 'center' };
const cta: React.CSSProperties = { color: '#3b6cf6', fontWeight: 600, textDecoration: 'none', fontSize: 14 };
const liftPill: React.CSSProperties = { display: 'inline-block', marginTop: 14, padding: '6px 12px', borderRadius: 999, background: 'rgba(22,163,74,0.12)', color: '#147a3a', fontSize: 13, fontWeight: 600 };
