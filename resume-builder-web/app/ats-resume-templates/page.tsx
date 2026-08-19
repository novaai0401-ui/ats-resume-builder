import Link from 'next/link';
import type { Metadata } from 'next';
import { TEMPLATE_CATALOG } from 'resume-builder-shared';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

export const metadata: Metadata = {
  title: 'ATS Resume Templates (Free, ATS-safe) — CallbackCV',
  description:
    'Free ATS-friendly resume templates tested against Workday, Greenhouse, iCIMS, Taleo and BambooHR. Single-column, parse-clean layouts you can fill, score, and export in minutes.',
  alternates: { canonical: '/ats-resume-templates' },
  openGraph: {
    title: 'Free ATS Resume Templates — tested across major ATS',
    description: 'ATS-safe templates that parse cleanly. Build, score, and export — free to start.',
    url: `${SITE_URL}/ats-resume-templates`,
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'What is an ATS-friendly resume template?',
    a: 'An ATS-friendly template uses a single-column, parse-clean structure with standard section headings and no tables, text boxes, or images that applicant tracking systems mis-read. Every CallbackCV template is built and tested this way.',
  },
  {
    q: 'Are these ATS resume templates free?',
    a: 'Yes. Building and previewing with any template is free. A one-time charge applies per clean PDF/Word export, and paid plans add AI features — but the templates themselves are free to use.',
  },
  {
    q: 'Which ATS are the templates tested against?',
    a: 'Workday, Greenhouse, iCIMS, Taleo, and BambooHR. The ATS Simulator additionally shows you the literal text those systems would extract from your file.',
  },
  {
    q: 'Can I switch templates without losing my content?',
    a: 'Yes. Your content is stored separately from the layout, so you can switch templates anytime and your sections re-flow into the new design.',
  },
];

export default function AtsResumeTemplatesPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'ATS Resume Templates', item: `${SITE_URL}/ats-resume-templates` },
        ],
      },
      {
        '@type': 'ItemList',
        name: 'ATS-safe resume templates',
        itemListElement: TEMPLATE_CATALOG.map((t, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: t.name,
          description: t.description,
        })),
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

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="hero">
        <h1>ATS resume templates that actually parse</h1>
        <p className="small">
          Every template is single-column and ATS-safe — tested against Workday, Greenhouse, iCIMS,
          Taleo, and BambooHR. Pick one, fill your sections, check your ATS score, and export.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className="btn" href="/templates/preview">Browse all templates</Link>
          <Link className="btn secondary" href="/resume/start">Start your resume — free</Link>
        </div>
      </section>

      <section className="grid" aria-label="Template list">
        {TEMPLATE_CATALOG.map((t) => (
          <article key={t.id} className="card col-6">
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{t.name}</h2>
            <p className="small">{t.description}</p>
            <p className="small" style={{ color: '#5a6778' }}>
              {(t.tags || []).join(' · ')}
              {t.atsSafety ? ` · ATS safety: ${t.atsSafety}` : ''}
            </p>
            <Link className="btn secondary" href={`/resume/start?template=${encodeURIComponent(t.id)}`}>
              Use {t.name}
            </Link>
          </article>
        ))}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Why ATS-safe formatting matters</h2>
        <p className="small">
          Most applications are first read by software, not a person. Multi-column layouts, tables, and
          graphics routinely get scrambled or dropped on the way into a recruiter&apos;s dashboard — which
          is why a beautiful resume can still score zero. CallbackCV&apos;s templates keep the structure
          machines expect, and the <Link href="/ats-resume-checker">ATS resume checker</Link> shows you
          exactly what survives.
        </p>
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
