import Link from 'next/link';

export default function Page() {
  return (
    <main>
      <section className="hero">
        <h1>Build ATS-ready resumes in minutes.</h1>
        <p className="small">
          Clean, scannable templates. Skill matching. Smart guidance for students and professionals.
        </p>
        <div className="hero__actions">
          <Link className="btn" href="/auth/register">Get started</Link>
          <Link className="btn secondary" href="/resume/start">Start resume</Link>
        </div>
      </section>

      <section className="feature-grid">
        <div className="card feature-card">
          <div className="feature-card__icon">&#9998;</div>
          <h3>Resume Editor</h3>
          <p className="small">
            Create ATS-safe resumes with structured sections and plain-text friendly formatting.
          </p>
        </div>
        <div className="card feature-card">
          <div className="feature-card__icon">&#10024;</div>
          <h3>AI Suggestions</h3>
          <p className="small">
            Get targeted improvements for impact, clarity, and keyword alignment.
          </p>
        </div>
        <div className="card feature-card feature-card--wide">
          <div className="feature-card__icon">&#127919;</div>
          <h3>Job Description Matching</h3>
          <p className="small">
            Upload a JD to calculate match %, skill gaps, and tailored guidance.
          </p>
        </div>
      </section>
    </main>
  );
}
