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

export default function Page() {
  return (
    <main>
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
          🔒 Your resume stays on this device. We never copy it to our server unless you turn on Cloud sync.
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
            Most resume builders store every keystroke on their server. We don't. By default
            your resume lives on your phone or laptop — not our database. We literally cannot
            read what you write. Cloud sync is opt-in if you want cross-device access.
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
    </main>
  );
}
