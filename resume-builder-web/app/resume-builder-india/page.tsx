import Link from 'next/link';
import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pocketresume.app';

export const metadata: Metadata = {
  title: 'Resume Builder for India — ATS-friendly, ₹ pricing — Pocket Resume',
  description:
    'An India-first ATS resume builder. Sub-₹400/month plans, UPI & cards via Razorpay, India-aware live job openings, and ATS-safe templates that pass Indian and global applicant tracking systems.',
  alternates: { canonical: '/resume-builder-india' },
  openGraph: {
    title: 'Resume Builder for India — ATS-friendly with ₹ pricing',
    description: 'India-first: ₹ pricing, UPI/Razorpay, India-aware live openings, ATS-safe templates.',
    url: `${SITE_URL}/resume-builder-india`,
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'Is there a resume builder made for the India job market?',
    a: 'Yes. Pocket Resume is India-first: sub-₹400/month pricing, UPI/card/netbanking payments via Razorpay, India-aware live job openings, and templates that pass both Indian and global applicant tracking systems.',
  },
  {
    q: 'How much does it cost in India?',
    a: 'You can build and score resumes for free. Paid Student/Pro plans are priced for India (sub-₹400/month) and unlock AI features; a one-time micro-charge applies per clean PDF/Word export.',
  },
  {
    q: 'Does it support UPI and Indian payment methods?',
    a: 'Yes — payments run through Razorpay, so UPI, cards, netbanking, and wallets all work.',
  },
  {
    q: 'Will it find jobs in India?',
    a: 'The Skill-Demand Agent surfaces real, current openings via a live jobs feed with India-aware location filtering, and you can track them on the built-in job board in one tap.',
  },
];

export default function ResumeBuilderIndiaPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Resume Builder India', item: `${SITE_URL}/resume-builder-india` },
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

  const points = [
    { h: '₹ pricing, UPI-ready', p: 'Sub-₹400/month plans with UPI, cards, and netbanking via Razorpay. A free forever tier to start.' },
    { h: 'India-aware live openings', p: 'Real, current job openings with location filtering for Indian cities — one tap to track them.' },
    { h: 'ATS-safe, globally', p: 'Templates that parse cleanly for Indian employers and global ATS (Workday, Greenhouse, iCIMS).' },
    { h: 'Privacy-first', p: 'Local-first storage with zero-knowledge encrypted backup. Your resume is never sold or used to train AI without opt-in.' },
  ];

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="hero">
        <h1>The resume builder built for India</h1>
        <p className="small">
          ATS-friendly resumes, ₹ pricing, UPI payments, and India-aware live job openings — plus AI tools
          that tell you whether your resume is actually getting callbacks.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className="btn" href="/resume/start">Start free</Link>
          <Link className="btn secondary" href="/skill-demand">See in-demand skills &amp; jobs</Link>
        </div>
      </section>

      <section className="grid" aria-label="Why India-first">
        {points.map((p) => (
          <article key={p.h} className="card col-6">
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{p.h}</h2>
            <p className="small">{p.p}</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Made for freshers, students, and career switchers</h2>
        <p className="small">
          Whether it&apos;s your first campus placement, a switch after a break, or a jump to a new field,
          Pocket Resume gives you ATS-safe <Link href="/ats-resume-templates">templates</Link>, a free{' '}
          <Link href="/ats-resume-checker">ATS checker</Link>, and proof of what&apos;s working through the
          Outcome Loop.
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
