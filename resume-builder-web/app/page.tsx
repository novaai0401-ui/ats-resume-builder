import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CallbackCV — Free ATS resume builder',
  description:
    'The resume builder that measures which resume actually gets callbacks. ' +
    'ATS-safe templates, honest AI, and real per-version response tracking. Free to start.',
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
    q: 'Is CallbackCV a free ATS resume builder?',
    a: 'Yes. The resume editor and ATS scorer are free forever. AI career features like the Recruiter-AI Simulator, mentor chat, and live job openings are free with your own AI key (BYOK), or get CallbackCV Plus at ₹499/mo for our AI everywhere. Downloads are ₹49 each.',
  },
  {
    q: 'How is CallbackCV different from other ATS resume builders?',
    a: 'Most tools stop at a predicted ATS score. CallbackCV measures your real callback rate per resume version (the Outcome Loop), simulates the AI hiring screen recruiters now run (Recruiter-AI Simulator), and shows the literal recruiter-view text an ATS extracts (ATS Simulator).',
  },
  {
    q: 'Does CallbackCV check if my resume is ATS-compatible?',
    a: 'Yes. It scores ATS-friendliness with explainable feedback and the ATS Simulator renders exactly what an applicant tracking system (Workday, Greenhouse, iCIMS) would parse from your file.',
  },
  {
    q: 'Does the AI make up numbers or achievements on my resume?',
    a: 'No — and this is a hard rule, not a preference. Most AI resume tools invent metrics ("cut costs by 35%") that were never in your history. CallbackCV’s AI is instructed to never invent numbers, achievements, employers, or skills; it only rephrases and reorganizes what is genuinely on your resume.',
  },
  {
    q: 'Is my resume data private?',
    a: 'Yes. Your resume is stored securely in your account (encrypted in transit and at rest), never sold, and never used to train AI unless you explicitly opt in. Delete any resume — or your whole account — anytime.',
  },
  {
    q: 'Does it work for the India job market?',
    a: 'Yes. CallbackCV is India-first with CallbackCV Plus at ₹499/mo (cancel anytime), India-aware live job openings, and Razorpay payments, while also supporting global users.',
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
        <h1>Know which resume actually gets callbacks.</h1>
        <p className="small">
          Every builder gives you a score. CallbackCV measures the truth: real response,
          interview, and offer rates for each version of your resume &mdash; so you send
          the one that works. Free ATS-safe builder &middot; honest AI &middot; PDF/Word export.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className="btn" href="/resume/start">Start your resume — free</Link>
          <Link className="btn secondary" href="/auth/register">Create account</Link>
        </div>
        <p className="small" style={{ marginTop: 14, opacity: 0.85 }}>
          🔒 HTTPS in transit, encrypted at rest. We never sell your data and never train AI on your resume unless you opt in.
        </p>
      </section>

      <section className="grid" aria-label="Why CallbackCV">
        <article className="card col-7">
          <h2>Built for the people most resume tools ignore</h2>
          <p className="small">
            Students applying to their first job. Workers re-entering after a break.
            Professionals who want a clean resume without an expensive subscription. CallbackCV
            is free forever to build and edit — pay just ₹49 per download, or get one
            simple ₹499/month plan (the same for everyone) for unlimited AI and free downloads.
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
            Your resume is stored in your CallbackCV account so it's there on every device you
            sign in from. We don't sell your data and we never train AI on your resume unless you
            opt in (Settings → Training data). Delete any resume — or your whole account — anytime.
          </p>
        </article>
        <article className="card col-6">
          <h2>One account, every device</h2>
          <p className="small">
            Build on your laptop in the morning, polish on your phone over chai, export the PDF
            or Word file when a recruiter asks. Same login on every device — install CallbackCV
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
            <strong>Pay ₹49 per download</strong> for each clean PDF or Word export — no plan needed.
            Or get <strong>CallbackCV Plus at ₹499/month</strong> (one plan for everyone, cancel anytime):
            unlimited AI everywhere plus free, unlimited downloads.
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
          <li><Link href="/pricing">Pricing</Link> — the complete price list (₹0 to build, ₹49/download, ₹499/mo Plus), shown before you start.</li>
          <li><Link href="/ats-resume-templates">ATS resume templates</Link> — free, ATS-safe layouts tested across major systems.</li>
          <li><Link href="/ats-resume-checker">ATS resume checker</Link> — score your resume and see what an ATS extracts.</li>
          <li><Link href="/resume-builder-india">Resume builder for India</Link> — ₹ pricing, UPI, India-aware live openings.</li>
          <li><Link href="/compare">CallbackCV vs Rezi, Teal &amp; Jobscan</Link> — how we compare.</li>
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
