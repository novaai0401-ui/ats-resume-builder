import Link from 'next/link';
import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pocketresume.app';

export const metadata: Metadata = {
  title: 'CallbackCV vs Rezi, Teal & Jobscan — an honest comparison',
  description:
    'How CallbackCV compares to Rezi, Teal, and Jobscan. The difference: it measures your real callback rate per resume version and simulates the AI hiring screen — not just a predicted ATS score.',
  alternates: { canonical: '/compare' },
  openGraph: {
    title: 'CallbackCV vs Rezi, Teal & Jobscan',
    description: 'Most tools predict an ATS score. CallbackCV measures real callbacks and simulates the AI hiring screen.',
    url: `${SITE_URL}/compare`,
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'What is the best alternative to Rezi, Teal, or Jobscan?',
    a: 'CallbackCV is a strong alternative if you want proof your resume works, not just a predicted ATS score. It measures real callback/interview/offer rates per resume version, simulates the AI hiring screen against a JD, and is India-first with a free tier.',
  },
  {
    q: 'What does CallbackCV do that most ATS tools do not?',
    a: 'Three things are rare or unique: the Outcome Loop (observed callback rate per resume version), the Recruiter-AI Simulator (an LLM hiring-screen verdict against a specific job), and the ATS Simulator (the literal recruiter-view text an ATS extracts).',
  },
  {
    q: 'Is CallbackCV free?',
    a: 'Yes — the resume editor and ATS scorer are free forever. AI career features are free with your own AI key (BYOK), or get CallbackCV Plus at ₹499/mo for our AI everywhere. Downloads are ₹49 each.',
  },
];

export default function ComparePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Compare', item: `${SITE_URL}/compare` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  const differentiators = [
    { h: 'Outcome Loop — real callback rate', p: 'Tracks observed response, interview, and offer rates per resume version. You see "v3 got 2.4× more replies than v1" — measured, not predicted. Most tools stop at a score.' },
    { h: 'Recruiter-AI Simulator', p: 'Role-plays the LLM hiring screen many ATS pipelines now run: verdict, fit score, strengths, concerns, and missing must-haves against a specific job description.' },
    { h: 'ATS Simulator', p: 'Shows the literal recruiter-view text an ATS (Workday, Greenhouse, iCIMS) extracts — catching "high score, no callbacks" formatting problems keyword tools miss.' },
    { h: 'Skill-Demand + live openings', p: 'In-demand skills for your stack, what to learn next, and real current job openings with one-click tracking.' },
    { h: 'Privacy & India-first', p: 'Local-first storage with zero-knowledge encrypted backup, ₹ pricing, UPI/Razorpay, and a free forever tier.' },
  ];

  const alternatives = [
    { name: 'Rezi', note: 'Known for a multi-metric "Rezi Score" and AI keyword targeting.' },
    { name: 'Teal', note: 'An all-in-one job tracker plus resume builder and matching, with a Chrome extension.' },
    { name: 'Jobscan', note: 'Known for deep keyword-match reports between a resume and a job description.' },
  ];

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="hero">
        <h1>CallbackCV vs Rezi, Teal &amp; Jobscan</h1>
        <p className="small">
          Most ATS tools predict a score. CallbackCV measures whether your resume is actually getting
          callbacks — and simulates the AI screen recruiters now run before a human sees you.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className="btn" href="/resume/start">Try it free</Link>
          <Link className="btn secondary" href="/ats-resume-checker">Check my resume</Link>
        </div>
      </section>

      <section className="grid" aria-label="What makes CallbackCV different">
        {differentiators.map((d) => (
          <article key={d.h} className="card col-6">
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{d.h}</h2>
            <p className="small">{d.p}</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Popular alternatives</h2>
        <p className="small" style={{ color: '#5a6778' }}>
          All three are well-regarded tools. The summaries below are our neutral take on where each is
          commonly used; check each product for current details.
        </p>
        {alternatives.map((a) => (
          <div key={a.name} style={{ marginTop: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>CallbackCV vs {a.name}</h3>
            <p className="small" style={{ marginTop: 4 }}>
              {a.note} CallbackCV&apos;s edge is measuring real outcomes (callback rate per version) and
              simulating the AI hiring screen — plus a free tier and India-first pricing.
            </p>
          </div>
        ))}
      </section>

      <section className="card" style={{ marginTop: 18 }} aria-labelledby="faq">
        <h2 id="faq">Frequently asked questions</h2>
        {FAQ.map((f) => (
          <div key={f.q} style={{ marginTop: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{f.q}</h3>
            <p className="small" style={{ marginTop: 4 }}>{f.a}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
