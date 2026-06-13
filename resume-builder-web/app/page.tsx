import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pocket Resume — Free ATS resume builder',
  description:
    'Build, score, and export resumes that pass applicant tracking systems. ' +
    'Local-first privacy: your resume stays on your device. Free to start, works on web and mobile.',
  alternates: { canonical: '/' },
};

// The home page is the only marketing surface most users see before
// signing up, so the copy needs to do four jobs at once: explain what
// the product is, who it's for, why it's safe, and where to start.
// Headings use real <h1>/<h2> for SEO; the JSON-LD in layout.tsx
// covers the SoftwareApplication schema separately.

// High-intent Q&A. Doubles as Google FAQ rich-result fuel and as quotable
// facts for AI assistants (GEO) — pair with /llms.txt.
const FAQ = [
  {
    q: 'Is Pocket Resume a free ATS resume builder?',
    a: 'Yes. The resume editor and ATS scorer are free forever. Paid Student/Pro tiers add AI career features like the Recruiter-AI Simulator, mentor chat, and live job openings.',
  },
  {
    q: 'How is Pocket Resume different from other ATS resume builders?',
    a: 'Most tools stop at a predicted ATS score. Pocket Resume measures your real callback rate per resume version (the Outcome Loop), simulates the AI hiring screen recruiters now run (Recruiter-AI Simulator), and shows the literal recruiter-view text an ATS extracts (ATS Simulator).',
  },
  {
    q: 'Does Pocket Resume check if my resume is ATS-compatible?',
    a: 'Yes. It scores ATS-friendliness with explainable feedback and the ATS Simulator renders exactly what an applicant tracking system (Workday, Greenhouse, iCIMS) would parse from your file.',
  },
  {
    q: 'Is my resume data private?',
    a: 'Yes. Storage is local-first with zero-knowledge encrypted backup. Resume content is never sold and never used to train AI unless you explicitly opt in.',
  },
  {
    q: 'Does it work for the India job market?',
    a: 'Yes. Pocket Resume is India-first with sub-₹400/month pricing, India-aware live job openings, and Razorpay payments, while also supporting global users.',
  },
];

export default function Page() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />
      <section className="hero">
        <h1>Free ATS-ready resumes in minutes.</h1>
        <p className="small">
          The resume builder for students, freshers, and career changers.
          Local-first privacy &middot; AI ATS scoring &middot; one click PDF or Word export.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className="btn" href="/resume/start">Start your resume — free</Link>
          <Link className="btn secondary" href="/auth/register">Create account</Link>
        </div>
        <p className="small" style={{ marginTop: 14, opacity: 0.85 }}>
          🔒 HTTPS in transit, encrypted at rest. We never sell your data and never train AI on your resume unless you opt in.
        </p>
      </section>

      <section className="grid" aria-label="Why Pocket Resume">
        <article className="card col-7">
          <h2>Built for the people most resume tools ignore</h2>
          <p className="small">
            Students applying to their first job. Workers re-entering after a break.
            Professionals who can't afford ₹999/month for a resume site. Pocket Resume is free
            forever to build and edit — you only pay a small one-time fee per download (₹49).
          </p>
        </article>
        <article className="card col-5">
          <h2>ATS-safe by default</h2>
          <p className="small">
            Every template uses single-column layouts, real text (not images), and the section
            headers recruiter software expects. We score your resume against the same rules
            applicant tracking systems use.
          </p>
        </article>
        <article className="card col-6">
          <h2>Privacy that's actually true</h2>
          <p className="small">
            Your resume is stored in your Pocket Resume account so it's there on every device you
            sign in from. We don't sell your data and we never train AI on your resume unless you
            opt in (Settings → Training data). Delete any resume — or your whole account — anytime.
          </p>
        </article>
        <article className="card col-6">
          <h2>One account, every device</h2>
          <p className="small">
            Build on your laptop in the morning, polish on your phone over chai, export the PDF
            or Word file when a recruiter asks. Same login on every device — install Pocket Resume
            from your browser's home-screen menu.
          </p>
        </article>
        <article className="card col-12">
          <h2>What's inside the free tier</h2>
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Unlimited resume creation and editing</li>
            <li>10+ ATS-safe templates across industries</li>
            <li>AI-powered ATS score, missing keywords, action-verb suggestions</li>
            <li>Cover letter generator</li>
            <li>Job application tracker (kanban-style)</li>
            <li>Resume preview and print (free, watermarked)</li>
          </ul>
          <p className="small" style={{ marginTop: 8 }}>
            <strong>One-time charge ₹49</strong> for each clean PDF or Word export. No subscription, no upsells.
          </p>
        </article>
      </section>

      <section className="card" style={{ marginTop: 18, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Ready to get started?</h2>
        <p className="small" style={{ marginBottom: 16 }}>
          Upload an existing resume to import in 30 seconds, or start from scratch.
        </p>
        <div style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link className="btn" href="/resume/start">Start your resume</Link>
          <Link className="btn secondary" href="/templates">Browse templates</Link>
        </div>
      </section>

      {/* Internal links to the SEO landing pages — helps crawlers discover
          them and passes link equity from the highest-authority page. */}
      <section className="card" style={{ marginTop: 18 }} aria-labelledby="guides-heading">
        <h2 id="guides-heading">Popular guides</h2>
        <ul>
          <li><Link href="/ats-resume-templates">ATS resume templates</Link> — free, ATS-safe layouts tested across major systems.</li>
          <li><Link href="/ats-resume-checker">ATS resume checker</Link> — score your resume and see what an ATS extracts.</li>
          <li><Link href="/resume-builder-india">Resume builder for India</Link> — ₹ pricing, UPI, India-aware live openings.</li>
          <li><Link href="/compare">Pocket Resume vs Rezi, Teal &amp; Jobscan</Link> — how we compare.</li>
        </ul>
      </section>

      {/* Visible FAQ backing the FAQPage JSON-LD above (Google requires the
          content be on-page) and adding crawlable, keyword-rich copy. */}
      <section className="card" style={{ marginTop: 18 }} aria-labelledby="faq-heading">
        <h2 id="faq-heading">Frequently asked questions</h2>
        {FAQ.map((item) => (
          <div key={item.q} style={{ marginTop: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{item.q}</h3>
            <p className="small" style={{ marginTop: 4 }}>{item.a}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
