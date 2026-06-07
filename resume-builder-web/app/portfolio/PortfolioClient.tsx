'use client';

/**
 * Portfolio manager. A subscribed user snapshots a resume into a public,
 * shareable page recruiters can open (and print/download) without an account.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type PortfolioSummary } from '@/src/lib/api';

type ResumeRow = { id: string; title?: string | null };

export default function PortfolioClient() {
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [resumeId, setResumeId] = useState('');
  const [title, setTitle] = useState('');
  const [headline, setHeadline] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);

  async function refresh() {
    try {
      setPortfolios(await api.listPortfolios());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load portfolios.');
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const list = (await api.listResumes()) as ResumeRow[];
        setResumes(list);
        if (list.length) setResumeId(list[0].id);
      } catch { /* ignore */ }
    })();
    refresh();
  }, []);

  async function create() {
    setError('');
    setPaywall(false);
    if (!resumeId) { setError('Pick a resume to build the portfolio from.'); return; }
    setBusy(true);
    try {
      await api.createPortfolio({ resumeId, title: title.trim() || undefined, headline: headline.trim() || undefined, contactEmail: contactEmail.trim() || undefined });
      setTitle(''); setHeadline(''); setContactEmail('');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create the portfolio.';
      if (/PORTFOLIO_REQUIRES_PLAN/i.test(msg)) setPaywall(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(p: PortfolioSummary) {
    await api.updatePortfolio(p.id, { published: !p.published });
    refresh();
  }
  async function refreshSnapshot(p: PortfolioSummary) {
    await api.updatePortfolio(p.id, { refreshFromResume: true });
    refresh();
  }
  async function remove(p: PortfolioSummary) {
    await api.deletePortfolio(p.id);
    refresh();
  }

  function publicUrl(slug: string) {
    return typeof window !== 'undefined' ? `${window.location.origin}/p/${slug}` : `/p/${slug}`;
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1>Portfolio</h1>
        <p className="small">Turn a resume into a shareable page recruiters can open and download — no account needed on their side.</p>
      </section>

      {paywall && (
        <section className="card col-12" style={{ borderColor: '#b07906' }}>
          <h3>Shareable portfolios are a Student/Pro feature</h3>
          <p className="small">Upgrade to publish a recruiter-facing portfolio link.</p>
          <Link className="btn" href="/billing">See plans</Link>
        </section>
      )}

      <section className="card col-12">
        <h3 style={{ marginTop: 0 }}>Create a portfolio</h3>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label className="small">From resume
            <select className="input" value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.title || r.id.slice(0, 8)}</option>)}
            </select>
          </label>
          <input className="input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Headline, e.g. Senior Backend Engineer (optional)" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          <input className="input" placeholder="Public contact email (optional)" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <button className="btn" onClick={create} disabled={busy || !resumeId}>{busy ? 'Creating…' : 'Create portfolio'}</button>
          {error && <p className="small" style={{ color: '#a8412c' }}>{error}</p>}
        </div>
      </section>

      {portfolios.map((p) => (
        <section key={p.id} className="card col-12">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong>{p.title}</strong>{!p.published && <span style={{ marginLeft: 8, fontSize: 12, color: '#a8412c' }}>(unpublished)</span>}
              <div className="small" style={{ color: '#5a6778' }}>{p.views} view{p.views === 1 ? '' : 's'} · <a href={publicUrl(p.slug)} target="_blank" rel="noreferrer">{publicUrl(p.slug)}</a></div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(publicUrl(p.slug))}>Copy link</button>
              <button className="btn secondary" onClick={() => refreshSnapshot(p)}>Refresh from resume</button>
              <button className="btn secondary" onClick={() => togglePublished(p)}>{p.published ? 'Unpublish' : 'Publish'}</button>
              <button className="btn secondary" onClick={() => remove(p)} style={{ color: '#a8412c' }}>Delete</button>
            </div>
          </div>
        </section>
      ))}
    </main>
  );
}
