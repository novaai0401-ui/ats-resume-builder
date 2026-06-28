'use client';

/**
 * Mentor Mode — premium career-guidance feature.
 *
 * Job-to-be-done: a user with AI (own key or Plus) picks a target role and an
 * experience level; we surface (a) the technologies they should be
 * fluent in, (b) the skills recruiters actually search for, and (c)
 * curated free learning resources. Acts as a non-chatty mentor — no
 * back-and-forth conversation, just structured guidance the user can
 * act on in 30 seconds.
 *
 * Design choices:
 *   • Free users see the same form but the result is paywalled with a
 *     PremiumGate card. Avoids hiding the value — they need to see
 *     what they'd get to consider upgrading.
 *   • Result data is rendered from the server's existing /ai/skill-gap
 *     and /meta/suggest endpoints. No new backend route required for
 *     v1 — we synthesise the recommendations from data we already have.
 *   • A static fallback shows curated lists per role even if the AI
 *     provider is unavailable, so the feature never feels broken.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAccessToken } from '@/src/lib/api';
import { loadByokKey } from '@/src/lib/byok-storage';
import {
  SALARY_CITIES,
  SALARY_ROLES,
  formatInr,
  getSalaryBand,
  type SalaryLevel,
} from '@/src/lib/salary-bands';

type RoleSeed = {
  role: string;
  level: 'Fresher' | 'Mid' | 'Senior';
  technologies: string[];
  recruiterKeywords: string[];
  resources: { label: string; url: string }[];
};

// Static curated map. Swap with a server-side call later, but for v1
// this gives every user with AI a useful payload immediately. The
// roles below are weighted toward the Indian market (the owner's
// stated audience): IT services, fintech, edtech, healthcare-IT.
const ROLE_SEEDS: RoleSeed[] = [
  {
    role: 'Frontend Engineer',
    level: 'Fresher',
    technologies: ['HTML5', 'CSS3', 'JavaScript (ES2022+)', 'React 18', 'TypeScript', 'Vite', 'TailwindCSS', 'Git'],
    recruiterKeywords: ['React', 'TypeScript', 'CSS-in-JS', 'responsive design', 'accessibility', 'unit testing', 'REST'],
    resources: [
      { label: 'The Odin Project — Full Stack JavaScript path', url: 'https://www.theodinproject.com/' },
      { label: 'frontendmasters.com — beginner React path (free trials)', url: 'https://frontendmasters.com/learn/beginner/' },
      { label: 'web.dev/learn — Google\'s free curriculum', url: 'https://web.dev/learn' },
    ],
  },
  {
    role: 'Frontend Engineer',
    level: 'Senior',
    technologies: ['React 18', 'TypeScript strict mode', 'Next.js / Remix', 'Module Federation', 'Web Vitals', 'Lighthouse', 'Storybook', 'Playwright'],
    recruiterKeywords: ['micro-frontends', 'design systems', 'performance budgets', 'SSR/RSC', 'A11y WCAG 2.2', 'observability'],
    resources: [
      { label: 'Patterns.dev — modern web architecture patterns', url: 'https://www.patterns.dev/' },
      { label: 'Josh Comeau — CSS for JS Devs preview', url: 'https://www.joshwcomeau.com/css/' },
      { label: 'Kent C. Dodds — testing trophy', url: 'https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications' },
    ],
  },
  {
    role: 'Backend Engineer',
    level: 'Fresher',
    technologies: ['Node.js / Python', 'Express / FastAPI', 'PostgreSQL', 'REST', 'Git', 'Docker basics', 'AWS Free Tier'],
    recruiterKeywords: ['REST API', 'SQL', 'authentication', 'JWT', 'rate limiting', 'CRUD', 'unit tests'],
    resources: [
      { label: 'Roadmap.sh — backend roadmap', url: 'https://roadmap.sh/backend' },
      { label: 'PostgreSQL official tutorial', url: 'https://www.postgresql.org/docs/current/tutorial.html' },
      { label: 'Hussein Nasser — backend YouTube channel', url: 'https://www.youtube.com/@hnasr' },
    ],
  },
  {
    role: 'Full-Stack Engineer',
    level: 'Mid',
    technologies: ['React / Next.js', 'Node.js or Python', 'PostgreSQL + Prisma/SQLAlchemy', 'Redis', 'Docker', 'GitHub Actions', 'Vercel/Render'],
    recruiterKeywords: ['system design', 'API design', 'caching', 'event-driven', 'CI/CD', 'observability', 'feature flags'],
    resources: [
      { label: 'System Design Primer (GitHub repo)', url: 'https://github.com/donnemartin/system-design-primer' },
      { label: 'Render docs — deployment patterns', url: 'https://render.com/docs' },
      { label: 'Refactoring.guru — design patterns', url: 'https://refactoring.guru/design-patterns' },
    ],
  },
  {
    role: 'Data Analyst',
    level: 'Fresher',
    technologies: ['SQL (PostgreSQL/MySQL)', 'Excel / Google Sheets', 'Python (pandas)', 'Power BI or Tableau', 'Git'],
    recruiterKeywords: ['SQL', 'pandas', 'data visualisation', 'A/B testing', 'KPIs', 'dashboards'],
    resources: [
      { label: 'Mode SQL Tutorial (free)', url: 'https://mode.com/sql-tutorial' },
      { label: 'Kaggle Learn — Python + Pandas', url: 'https://www.kaggle.com/learn' },
      { label: 'StrataScratch — interview SQL practice (free tier)', url: 'https://www.stratascratch.com/' },
    ],
  },
  {
    role: 'Data Engineer',
    level: 'Mid',
    technologies: ['SQL', 'Python', 'Airflow', 'dbt', 'Spark / Databricks', 'Snowflake or BigQuery', 'Docker'],
    recruiterKeywords: ['ETL/ELT', 'streaming', 'data modelling', 'dbt', 'orchestration', 'data quality'],
    resources: [
      { label: 'Data Engineering Zoomcamp (free)', url: 'https://github.com/DataTalksClub/data-engineering-zoomcamp' },
      { label: 'dbt Learn — free fundamentals', url: 'https://courses.getdbt.com/' },
      { label: 'Designing Data-Intensive Applications (book)', url: 'https://dataintensive.net/' },
    ],
  },
  {
    role: 'DevOps Engineer',
    level: 'Mid',
    technologies: ['Docker', 'Kubernetes', 'Terraform', 'AWS or GCP', 'Prometheus + Grafana', 'GitHub Actions / GitLab CI', 'Bash + Python'],
    recruiterKeywords: ['IaC', 'observability', 'incident response', 'SLO/SLI', 'Helm', 'security'],
    resources: [
      { label: 'Roadmap.sh — DevOps roadmap', url: 'https://roadmap.sh/devops' },
      { label: 'Kubernetes the Hard Way', url: 'https://github.com/kelseyhightower/kubernetes-the-hard-way' },
      { label: 'Google SRE book (free)', url: 'https://sre.google/sre-book/table-of-contents/' },
    ],
  },
  {
    role: 'AI / ML Engineer',
    level: 'Mid',
    technologies: ['Python', 'PyTorch or TensorFlow', 'Hugging Face Transformers', 'LangChain / LlamaIndex', 'FastAPI', 'Vector DBs (pgvector, Pinecone)', 'Docker'],
    recruiterKeywords: ['LLM fine-tuning', 'RAG', 'vector search', 'evaluation', 'prompt engineering', 'inference cost'],
    resources: [
      { label: 'Andrej Karpathy — Neural Networks: Zero to Hero', url: 'https://karpathy.ai/zero-to-hero.html' },
      { label: 'Hugging Face Course (free)', url: 'https://huggingface.co/learn' },
      { label: 'Anthropic — Building with Claude (cookbook)', url: 'https://docs.anthropic.com/' },
    ],
  },
  {
    role: 'Product Manager',
    level: 'Mid',
    technologies: ['Notion / Linear / Jira', 'Figma (read-only)', 'Mixpanel or Amplitude', 'SQL basics', 'A/B testing tools'],
    recruiterKeywords: ['discovery', 'experimentation', 'roadmap', 'OKRs', 'user research', 'prioritisation'],
    resources: [
      { label: 'Marty Cagan — Inspired (book)', url: 'https://www.svpg.com/inspired-how-to-create-products-customers-love/' },
      { label: 'Reforge primer (free articles)', url: 'https://www.reforge.com/blog' },
      { label: 'Lenny\'s Newsletter — free posts', url: 'https://www.lennysnewsletter.com/' },
    ],
  },
];

const ROLES = Array.from(new Set(ROLE_SEEDS.map((s) => s.role)));
const LEVELS = ['Fresher', 'Mid', 'Senior'] as const;

function lookupSeed(role: string, level: string): RoleSeed | null {
  const exact = ROLE_SEEDS.find((s) => s.role === role && s.level === level);
  if (exact) return exact;
  // Fall back to any level for the role so something is always shown.
  return ROLE_SEEDS.find((s) => s.role === role) ?? null;
}

export default function MentorClient() {
  const [authed, setAuthed] = useState(false);
  const [plan, setPlan] = useState<'FREE' | 'STUDENT' | 'PRO'>('FREE');
  const [role, setRole] = useState<string>(ROLES[0] ?? '');
  const [level, setLevel] = useState<typeof LEVELS[number]>('Mid');
  // Default city = Bangalore (largest IT hiring market). The salary
  // band auto-falls-back to the Bangalore multiplier for any city we
  // don't have data for, so picking the wrong city still produces a
  // reasonable answer.
  const [city, setCity] = useState<string>('Bangalore');
  const [showResult, setShowResult] = useState(false);
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(getAccessToken()));
    setHasByok(Boolean(loadByokKey()));
    try {
      const stored = window.localStorage.getItem('rb_plan');
      if (stored === 'PRO' || stored === 'STUDENT') setPlan(stored);
    } catch { /* ignore */ }
  }, []);

  const seed = useMemo(() => lookupSeed(role, level), [role, level]);
  // Salary bands are looked up lazily — only when the user has clicked
  // "Show my path" AND the chosen role exists in the salary data set
  // (the Mentor seed list is broader than the salary table for v1).
  const salaryBand = useMemo(
    () => (showResult ? getSalaryBand(role, level as SalaryLevel, city) : null),
    [showResult, role, level, city],
  );
  // Mentor path unlocks with Pocket Resume Plus (the 'PRO'/'STUDENT'
  // plan values) or the user's own AI key (BYOK, free). The salary band
  // is a Plus perk (kept on the paid plan value).
  const isPaid = plan === 'STUDENT' || plan === 'PRO' || hasByok;
  const isPro = plan === 'PRO';

  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ marginBottom: 4 }}>Mentor Mode</h1>
        <p className="small" style={{ margin: '0 0 6px', color: 'var(--ink)', fontWeight: 600 }}>
          Career strategy — what to learn next, what recruiters want, what to put on your resume.
        </p>
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          Pick a role and experience level. We&rsquo;ll surface the technologies recruiters
          look for, the keywords that beat ATS scans, and free learning resources to start
          tomorrow.{' '}
          <span style={{ color: 'var(--muted)' }}>
            Looking for emotional support instead? Try <a href="/sahaayak" style={{ color: 'var(--primary)' }}>Sahaayak</a>.
          </span>
        </p>
      </section>

      <section className="card col-12">
        <div className="mentor-form-grid">
          <div>
            <label className="label" htmlFor="mentor-role">Target role</label>
            <select
              id="mentor-role"
              className="input"
              value={role}
              onChange={(e) => { setRole(e.target.value); setShowResult(false); }}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="mentor-level">Experience level</label>
            <select
              id="mentor-level"
              className="input"
              value={level}
              onChange={(e) => { setLevel(e.target.value as typeof LEVELS[number]); setShowResult(false); }}
            >
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="mentor-city">City (for salary band)</label>
            <select
              id="mentor-city"
              className="input"
              value={city}
              onChange={(e) => { setCity(e.target.value); setShowResult(false); }}
            >
              {SALARY_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn"
            onClick={() => setShowResult(true)}
            disabled={!seed}
          >
            Show my path
          </button>
        </div>
      </section>

      {showResult && seed ? (
        isPaid ? (
          <section className="card col-12" aria-label="Mentor recommendation">
            <h2 style={{ marginTop: 0 }}>{seed.role} — {seed.level} path</h2>

            <h3 style={{ marginTop: 18 }}>Technologies to learn</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {seed.technologies.map((t) => (
                <span key={t} className="ai-keyword-chip" style={{ background: 'var(--surface)', color: 'var(--primary)' }}>{t}</span>
              ))}
            </div>

            <h3 style={{ marginTop: 18 }}>Recruiter keywords to put on your resume</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {seed.recruiterKeywords.map((k) => (
                <span key={k} className="ai-keyword-chip" style={{ background: '#fef3cd', color: '#856404' }}>{k}</span>
              ))}
            </div>
            <p className="small" style={{ marginTop: 8, color: 'var(--muted)' }}>
              Tap a keyword in the resume editor to add it to your skills section.
            </p>

            <h3 style={{ marginTop: 18 }}>Free learning resources</h3>
            <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
              {seed.resources.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">{r.label}</a>
                </li>
              ))}
            </ul>

            {/* Salary band — a Pocket Resume Plus perk. Everyone who
                reaches the result sees the heading; BYOK and free users
                see the upsell card below it. */}
            <h3 style={{ marginTop: 24 }}>
              Expected salary <span className="plan-badge plan-badge--pro" style={{ fontSize: 10, padding: '2px 8px' }}>Plus</span>
            </h3>
            {isPro && salaryBand ? (
              <div className="salary-band">
                <div className="salary-band__row">
                  <span className="salary-band__label">25th percentile</span>
                  <span className="salary-band__value">{formatInr(salaryBand.p25)}</span>
                </div>
                <div className="salary-band__row salary-band__row--median">
                  <span className="salary-band__label">Median</span>
                  <span className="salary-band__value">{formatInr(salaryBand.median)}</span>
                </div>
                <div className="salary-band__row">
                  <span className="salary-band__label">75th percentile</span>
                  <span className="salary-band__value">{formatInr(salaryBand.p75)}</span>
                </div>
                <p className="small" style={{ marginTop: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Total annual gross compensation for {seed.role} ({seed.level}) in {city}.
                  {salaryBand.disclaimer ? ` ${salaryBand.disclaimer}` : null}
                </p>
              </div>
            ) : isPro && !salaryBand ? (
              <p className="small" style={{ color: 'var(--muted)' }}>
                We don&rsquo;t have salary data for this role yet. We&rsquo;re adding more roles
                each month — pick a closer adjacent role for now.
              </p>
            ) : (
              <div
                className="salary-band"
                style={{
                  background: 'linear-gradient(180deg, var(--surface-alt) 0%, var(--card) 100%)',
                  border: '1px dashed var(--border)',
                }}
              >
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--primary)' }}>
                  Salary bands are a Pocket Resume Plus perk
                </p>
                <p className="small" style={{ marginTop: 6, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Plus shows the 25th / 50th / 75th percentile annual compensation for your role,
                  level, and city — sourced from public 2024–2025 surveys.
                </p>
                <Link className="btn" href="/billing" style={{ marginTop: 10, fontSize: 13 }}>
                  Get Pocket Resume Plus — ₹499/mo
                </Link>
              </div>
            )}

            <p className="small" style={{ marginTop: 18, color: 'var(--muted)' }}>
              {isPro
                ? 'Tip: head over to the Cover Letter Studio to draft a tailored letter for any of these roles.'
                : 'Add your own AI key (free) or get Pocket Resume Plus (₹499/mo) to unlock our AI across every feature, including salary bands.'}
            </p>
          </section>
        ) : (
          <section
            className="card col-12"
            style={{
              background: 'linear-gradient(180deg, var(--surface) 0%, var(--card) 100%)',
              borderLeft: '4px solid var(--primary)',
            }}
            aria-label="Premium feature paywall"
          >
            <h2 style={{ marginTop: 0 }}>Use AI for Mentor Mode</h2>
            <p className="small" style={{ color: 'var(--ink)', lineHeight: 1.6 }}>
              You picked <strong>{seed.role} — {seed.level}</strong>. To see the full path
              (technologies recruiters expect, ATS keywords for this role, curated free
              learning resources), add your own AI key in Settings (free) — or get Pocket
              Resume Plus (₹499/mo) for our AI across every feature. Cancel anytime.
            </p>
            <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7, marginBottom: 14 }}>
              <li>Every AI feature, free, with your own AI key</li>
              <li>Or Pocket Resume Plus — our AI everywhere, no per-download AI fee</li>
              <li>Tech Gap analysis tailored to your industry</li>
              <li>This Mentor Mode page, fully unlocked</li>
            </ul>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="btn primary" href="/settings">Add your AI key</Link>
              <Link className="btn" href="/billing">Get Plus</Link>
            </div>
          </section>
        )
      ) : null}

      {!authed ? (
        <section className="card col-12" style={{ background: 'var(--surface-alt)' }}>
          <h3 style={{ marginTop: 0 }}>Sign in to use Mentor Mode</h3>
          <p className="small" style={{ marginBottom: 12 }}>
            Mentor Mode is free to preview but requires a Pocket Resume account.
          </p>
          <Link className="btn" href="/auth/login">Sign in</Link>
        </section>
      ) : null}
    </main>
  );
}
