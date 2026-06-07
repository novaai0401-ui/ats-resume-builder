'use client';

/**
 * Public, recruiter-facing portfolio. No login. Renders the snapshot and offers
 * a one-click print/download (browser "Save as PDF") so a recruiter can keep a
 * copy of the candidate's details.
 */

import { useEffect, useState } from 'react';
import { api, type PublicPortfolio } from '@/src/lib/api';

export default function PublicPortfolioView({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicPortfolio | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPublicPortfolio(slug).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Not found.'));
  }, [slug]);

  if (error) {
    return <main style={wrap}><div style={card}><h1 style={{ margin: 0 }}>Portfolio unavailable</h1><p style={{ color: '#5a6778' }}>{error}</p></div></main>;
  }
  if (!data) return <main style={wrap}><p style={{ color: '#5a6778' }}>Loading…</p></main>;

  const s = data.snapshot;
  return (
    <main style={wrap}>
      <div style={card} id="portfolio-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30 }}>{s.fullName || data.title}</h1>
            {s.headline && <div style={{ color: '#3b6cf6', fontWeight: 600, marginTop: 4 }}>{s.headline}</div>}
            {data.contactEmail && <div style={{ color: '#5a6778', fontSize: 14, marginTop: 4 }}>{data.contactEmail}</div>}
          </div>
          <button onClick={() => window.print()} style={dlBtn} className="no-print">Download / Print</button>
        </div>

        {s.summary && <p style={{ marginTop: 16, lineHeight: 1.6, color: '#1b2b3c' }}>{s.summary}</p>}

        {s.skills.length > 0 && (
          <section style={{ marginTop: 18 }}>
            <h2 style={h2}>Skills</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {s.skills.map((sk, i) => <span key={i} style={chip}>{sk}</span>)}
            </div>
          </section>
        )}

        {s.experience.length > 0 && (
          <section style={{ marginTop: 18 }}>
            <h2 style={h2}>Experience</h2>
            {s.experience.map((e, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>{e.role}{e.company ? ` · ${e.company}` : ''}</div>
                <div style={{ fontSize: 13, color: '#7a8aa0' }}>{[e.startDate, e.endDate].filter(Boolean).join(' – ')}</div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {e.highlights.map((h, j) => <li key={j} style={{ lineHeight: 1.5 }}>{h}</li>)}
                </ul>
              </div>
            ))}
          </section>
        )}

        {s.education.length > 0 && (
          <section style={{ marginTop: 18 }}>
            <h2 style={h2}>Education</h2>
            {s.education.map((e, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>{e.degree}{e.institution ? ` · ${e.institution}` : ''}</div>
                <div style={{ fontSize: 13, color: '#7a8aa0' }}>{[e.startDate, e.endDate].filter(Boolean).join(' – ')}</div>
              </div>
            ))}
          </section>
        )}

        {s.projects.length > 0 && (
          <section style={{ marginTop: 18 }}>
            <h2 style={h2}>Projects</h2>
            {s.projects.map((p, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>{p.name}{p.url ? <a href={p.url} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: 13 }}>↗</a> : null}</div>
                {p.description && <div style={{ fontSize: 14, color: '#1b2b3c' }}>{p.description}</div>}
              </div>
            ))}
          </section>
        )}

        <footer style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid #eef1f5', fontSize: 12, color: '#9aa7b8' }} className="no-print">
          Built with Pocket Resume
        </footer>
      </div>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#f5f7fa', padding: 24, display: 'flex', justifyContent: 'center' };
const card: React.CSSProperties = { width: '100%', maxWidth: 760, background: '#fff', borderRadius: 14, padding: 32, boxShadow: '0 8px 40px rgba(16,36,58,0.08)' };
const h2: React.CSSProperties = { fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.5, color: '#5a6778', margin: '0 0 8px' };
const chip: React.CSSProperties = { padding: '3px 10px', borderRadius: 999, background: '#eef2f8', color: '#1b2b3c', fontSize: 13 };
const dlBtn: React.CSSProperties = { background: '#3b6cf6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' };
