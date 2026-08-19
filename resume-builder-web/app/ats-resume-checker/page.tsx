import Link from 'next/link';
import type { Metadata } from 'next';
import AtsCheckWidget from './AtsCheckWidget';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

export const metadata: Metadata = {
  title: 'Free ATS Resume Checker & Scanner — CallbackCV',
  description:
    'Check if your resume passes applicant tracking systems. Get an explainable ATS score, see the literal recruiter-view text an ATS extracts, and simulate the AI hiring screen against a job description — free.',
  alternates: { canonical: '/ats-resume-checker' },
  openGraph: {
    title: 'ATS Resume Checker — score, simulate, and beat the bots',
    description: 'Explainable ATS score + recruiter-view simulation + AI hiring-screen verdict.',
    url: `${SITE_URL}/ats-resume-checker`,
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'How does the ATS resume checker work?',
    a: 'Upload or build your resume and CallbackCV scores its ATS-friendliness with specific, explainable feedback — missing keywords, weak action verbs, and formatting that breaks parsing. The ATS Simulator then shows the literal text an ATS would extract.',
  },
  {
    q: 'Is the ATS checker free?',
    a: 'Yes, the ATS score and recruiter-view simulation are free. The Recruiter-AI Simulator (an LLM hiring-screen verdict against a specific job description) is an AI feature — free with your own AI key, or included in CallbackCV Plus (₹499/mo).',
  },
  {
    q: 'What is the difference between an ATS score and the ATS Simulator?',
    a: 'The ATS score is a number with reasons. The ATS Simulator is more honest — it renders the actual parsed text a recruiter sees inside Workday or Greenhouse, so you catch "95% score but no callbacks" formatting problems.',
  },
  {
    q: 'Will it tell me how an AI hiring screen rates me?',
    a: 'Yes. The Recruiter-AI Simulator role-plays the LLM screen many ATS pipelines now run, returning a verdict (advance / borderline / reject), a fit score, strengths, concerns, and missing must-haves for a specific JD.',
  },
];

export default function AtsResumeCheckerPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'ATS Resume Checker', item: `${SITE_URL}/ats-resume-checker` },
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

  const steps = [
    { h: '1. Score', p: 'Get an explainable ATS score: missing keywords, weak verbs, and format risks — not a black box.' },
    { h: '2. Simulate', p: 'The ATS Simulator renders the exact text Workday / Greenhouse / iCIMS would extract from your file.' },
    { h: '3. Screen', p: 'The Recruiter-AI Simulator gives the verdict an AI hiring screen would return against a real job description.' },
    { h: '4. Fix', p: 'Tap a missing must-have to jump into the editor and rewrite the bullet with the AI bullet rewriter.' },
  ];

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="hero">
        <h1>Free ATS resume checker</h1>
        <p className="small">
          Find out whether your resume passes applicant tracking systems — and what to fix. Explainable
          ATS score, recruiter-view simulation, and an AI hiring-screen verdict in one place.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className="btn" href="/resume/start">Check my resume — free</Link>
          <Link className="btn secondary" href="/ats-resume-templates">ATS-safe templates</Link>
        </div>
      </section>

      <AtsCheckWidget />

      <section className="grid" aria-label="How it works">
        {steps.map((s) => (
          <article key={s.h} className="card col-6">
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{s.h}</h2>
            <p className="small">{s.p}</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Most resume checkers stop at a score. We measure outcomes.</h2>
        <p className="small">
          A score predicts; CallbackCV also tracks what actually happens. The Outcome Loop records your
          real response, interview, and offer rates per resume version, so you can see whether a higher
          ATS score truly moved your callback rate — proof, not opinions.
        </p>
        <Link className="btn" href="/auth/register" style={{ marginTop: 8, display: 'inline-flex' }}>
          Create a free account
        </Link>
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
