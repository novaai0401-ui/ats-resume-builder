'use client';

/**
 * Mentor Mode — premium career-guidance feature.
 *
 * Job-to-be-done: a Student/Pro user picks a target role and an
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
// this gives every Student/Pro user a useful payload immediately. The
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

  useEffect(() => {
    setAuthed(Boolean(getAccessToken()));
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
  const isPaid = plan === 'STUDENT' || plan === 'PRO';
  const isPro = plan === 'PRO';

  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ marginBottom: 4 }}>Mentor Mode</h1>
        <p className="small" style={{ margin: '0 0 6px', color: '#1b2b3c', fontWeight: 600 }}>
          Career strategy — what to learn next, what recruiters want, what to put on your resume.
        </p>
        <p className="small" style={{ margin: 0, color: '#5a6778' }}>
          Pick a role and experience level. We&rsquo;ll surface the technologies recruiters
          look for, the keywords that beat ATS scans, and free learning resources to start
          tomorrow.{' '}
          <span style={{ color: '#8a98ac' }}>
            Looking for emotional support instead? Try <a href="/sahaayak" style={{ color: '#1a3a5c' }}>Sahaayak</a>.
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
                <span key={t} className="ai-keyword-chip" style={{ background: '#eef5ff', color: '#1a3a5c' }}>{t}</span>
              ))}
            </div>

            <h3 style={{ marginTop: 18 }}>Recruiter keywords to put on your resume</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {seed.recruiterKeywords.map((k) => (
                <span key={k} className="ai-keyword-chip" style={{ background: '#fef3cd', color: '#856404' }}>{k}</span>
              ))}
            </div>
            <p className="small" style={{ marginTop: 8, color: '#5a6778' }}>
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

            {/* Salary band — Pro only. Student/Pro both see the
                section heading so Student users know the feature
                exists and what they're paying extra for at the Pro
                tier. Free users land in the outer paywall card and
                never reach this branch. */}
            <h3 style={{ marginTop: 24 }}>
              Expected salary <span className="plan-badge plan-badge--pro" style={{ fontSize: 10, padding: '2px 8px' }}>Pro</span>
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
                <p className="small" style={{ marginTop: 10, color: '#5a6778', lineHeight: 1.5 }}>
                  Total annual gross compensation for {seed.role} ({seed.level}) in {city}.
                  {salaryBand.disclaimer ? ` ${salaryBand.disclaimer}` : null}
                </p>
              </div>
            ) : isPro && !salaryBand ? (
              <p className="small" style={{ color: '#5a6778' }}>
                We don&rsquo;t have salary data for this role yet. We&rsquo;re adding more roles
                each month — pick a closer adjacent role for now.
              </p>
            ) : (
              <div
                className="salary-band"
                style={{
                  background: 'linear-gradient(180deg, #f7f9fc 0%, #ffffff 100%)',
                  border: '1px dashed #c4d5e0',
                }}
              >
                <p style={{ margin: 0, fontWeight: 600, color: '#1a3a5c' }}>
                  Salary bands are a Pro feature
                </p>
                <p className="small" style={{ marginTop: 6, color: '#5a6778', lineHeight: 1.5 }}>
                  Pro shows the 25th / 50th / 75th percentile annual compensation for your role,
                  level, and city — sourced from public 2024–2025 surveys.
                </p>
                <Link className="btn" href="/billing" style={{ marginTop: 10, fontSize: 13 }}>
                  Upgrade to Pro — ₹799/mo
                </Link>
              </div>
            )}

            <p className="small" style={{ marginTop: 18, color: '#5a6778' }}>
              {isPro
                ? 'Pro tip: head over to the Cover Letter Studio to draft a tailored letter for any of these roles.'
                : 'Student covers AI critique, Cover Letter, and Mentor Mode. Pro adds salary bands, interview prep, and priority AI access.'}
            </p>
          </section>
        ) : (
          <section
            className="card col-12"
            style={{
              background: 'linear-gradient(180deg, #eef5ff 0%, #ffffff 100%)',
              borderLeft: '4px solid #1a3a5c',
            }}
            aria-label="Premium feature paywall"
          >
            <h2 style={{ marginTop: 0 }}>Mentor Mode is a Student / Pro feature</h2>
            <p className="small" style={{ color: '#3a4655', lineHeight: 1.6 }}>
              You picked <strong>{seed.role} — {seed.level}</strong>. To see the full path
              (technologies recruiters expect, ATS keywords for this role, curated free
              learning resources), upgrade to the Student plan for ₹399/mo. Cancel anytime.
            </p>
            <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7, marginBottom: 14 }}>
              <li>50 ATS scans/mo · 25 PDF + Word exports/mo</li>
              <li>AI Resume Critique with the GROQ Llama 3.3 70B model</li>
              <li>Tech Gap analysis tailored to your industry</li>
              <li>This Mentor Mode page, fully unlocked</li>
            </ul>
            <Link className="btn" href="/billing">See plans</Link>
          </section>
        )
      ) : null}

      {!authed ? (
        <section className="card col-12" style={{ background: '#f7f9fc' }}>
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
