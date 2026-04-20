import Link from 'next/link';

export default function Page() {
  return (
    <main>
      <section className="hero">
        <h1>Build ATS-ready resumes. Plan your next career move.</h1>
        <p className="small">
          Clean, scannable templates. Skill matching. Quantum career guidance for
          students, professionals, doctors, teachers, sales, and support pros.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="btn" href="/auth/register">Get started</Link>
          <Link className="btn secondary" href="/resume/start">Start resume</Link>
          <Link className="btn ghost" href="/career">Try the Career Navigator</Link>
          <Link className="btn ghost" href="/pricing">See pricing</Link>
        </div>
      </section>

      <section className="grid">
        <div className="card col-6">
          <h3>Resume Editor</h3>
          <p className="small">
            ATS-safe templates with structured sections and plain-text friendly formatting.
          </p>
        </div>
        <div className="card col-6">
          <h3>AI Suggestions</h3>
          <p className="small">
            Targeted improvements for impact, clarity, and keyword alignment against a JD.
          </p>
        </div>
        <div className="card col-6">
          <h3>Quantum Career Navigator</h3>
          <p className="small">
            Probability-ranked &ldquo;what to learn next&rdquo; across IT, Healthcare,
            Education, BPO, Sales, Finance, Creative and more.
          </p>
          <Link className="btn secondary" href="/career" style={{ marginTop: 8 }}>
            Open navigator
          </Link>
        </div>
        <div className="card col-6">
          <h3>Industry-aware guidance</h3>
          <p className="small">
            Tailored skill clusters for doctors, teachers, chefs, engineers, lawyers and more —
            the app isn&apos;t just for developers.
          </p>
        </div>
        <div className="card col-12">
          <h3>Job Description Matching</h3>
          <p className="small">
            Upload a JD to calculate match %, skill gaps, and tailored guidance.
          </p>
        </div>
      </section>
    </main>
  );
}
