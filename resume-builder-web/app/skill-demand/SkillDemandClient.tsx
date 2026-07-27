'use client';

/**
 * Skill-Demand Agent UI. Pulls the skills off the user's current resume and
 * shows which are in demand, what to learn next, and who's hiring. Free users
 * see a curated 2026 snapshot with an upsell; paid users get an AI-personalized
 * analysis.
 */

import { useState } from 'react';
import Link from 'next/link';
import { api, type SkillDemandResult, type SkillDemandItem } from '@/src/lib/api';
import { useSavedResumeFallback } from '@/src/lib/use-saved-resume-fallback';
import { handleFreeTrialError } from '@/src/lib/free-trial';

const DEMAND_COLOR: Record<SkillDemandItem['demand'], string> = {
  'very-high': '#147a3a',
  high: '#2f7a2f',
  moderate: '#b07906',
  stable: '#5a6778',
};
const DEMAND_LABEL: Record<SkillDemandItem['demand'], string> = {
  'very-high': 'Very high', high: 'High', moderate: 'Moderate', stable: 'Stable',
};

export default function SkillDemandClient() {
  // Store draft when the editor populated it, else the saved resume
  // (active selection → most recent) via the shared fallback hook.
  const resume = useSavedResumeFallback();
  const [result, setResult] = useState<SkillDemandResult | null>(null);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const skills = resume?.skills ?? [];

  async function run() {
    setError('');
    setResult(null);
    if (!skills.length) {
      setError('No skills found on your resume. Add some skills first.');
      return;
    }
    setLoading(true);
    try {
      setResult(await api.skillDemand(skills, location.trim() || undefined));
    } catch (err) {
      // R-098 — a spent free run opens the app-wide popup, not an inline error.
      if (handleFreeTrialError(err)) return;
      setError(err instanceof Error ? err.message : 'Could not analyze skills.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1>Skill Demand</h1>
        <p className="small">
          See which of your skills are in demand right now, what to learn next, and which companies are hiring.
        </p>
        {skills.length > 0 ? (
          <p className="small" style={{ color: 'var(--muted)' }}>Analyzing {skills.length} skill{skills.length === 1 ? '' : 's'} from your current resume.</p>
        ) : (
          <p className="small" style={{ color: '#a8412c' }}>No skills on your resume yet. <Link href="/dashboard">Open a resume</Link> first.</p>
        )}
        <input
          className="input"
          placeholder="Location for live openings (optional, e.g. Bengaluru)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{ marginTop: 8, maxWidth: 360 }}
        />
        {error && <p className="small" style={{ color: '#a8412c' }}>{error}</p>}
        <button className="btn" onClick={run} disabled={loading} style={{ marginTop: 8 }}>
          {loading ? 'Analyzing…' : 'Analyze my skills'}
        </button>
      </section>

      {result && (
        <>
          <section className="card col-12" style={{ borderLeft: `4px solid ${result.realtime ? '#147a3a' : '#b07906'}` }}>
            <strong>{result.realtime ? '✓ AI-personalized analysis' : 'Curated 2026 snapshot'}</strong>
            <p className="small" style={{ margin: '4px 0 0', color: 'var(--muted)' }}>{result.message}</p>
            {!result.realtime && (
              <Link className="btn secondary" href="/settings" style={{ marginTop: 10 }}>Add your AI key for a tailored analysis</Link>
            )}
          </section>

          <section className="card col-12">
            <h3 style={{ marginTop: 0 }}>Hottest skills right now</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {result.topInDemand.map((s, i) => (
                <span key={i} style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(20,122,58,0.1)', color: '#147a3a', fontSize: 13, fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          </section>

          {result.liveOpenings.length > 0 && (
            <section className="card col-12">
              <h3 style={{ marginTop: 0 }}>Live openings for your stack</h3>
              <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>Real listings, refreshed from the jobs feed.</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.liveOpenings.map((job, i) => (
                  <a key={i} href={job.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: 12, border: '1px solid var(--border, #ddd)', borderRadius: 8, textDecoration: 'none' }}>
                    <div style={{ fontWeight: 600 }}>{job.title}</div>
                    <div className="small" style={{ color: 'var(--muted)' }}>
                      {[job.company, job.location, job.salaryText].filter(Boolean).join(' · ')}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {result.realtime && result.liveOpenings.length === 0 && result.liveOpeningsAvailable && (
            <section className="card col-12">
              <p className="small" style={{ margin: 0, color: '#5a6778' }}>No live openings matched right now — try a broader location or check back later.</p>
            </section>
          )}

          {result.yourSkills.map((item, i) => (
            <section key={i} className="card col-6">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong>{item.skill}</strong>
                <span style={{ color: DEMAND_COLOR[item.demand], fontWeight: 700, fontSize: 13 }}>{DEMAND_LABEL[item.demand]}</span>
              </div>
              <p className="small" style={{ color: '#5a6778', margin: '4px 0 8px' }}>{item.trend}</p>
              {item.alsoLearn.length > 0 && (
                <p className="small" style={{ margin: '0 0 6px' }}>
                  <strong>Learn next:</strong> {item.alsoLearn.join(', ')}
                </p>
              )}
              {item.companiesHiring.length > 0 && (
                <p className="small" style={{ margin: 0 }}>
                  <strong>Hiring:</strong> {item.companiesHiring.join(', ')}
                </p>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
