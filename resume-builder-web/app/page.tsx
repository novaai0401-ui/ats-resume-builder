import Link from 'next/link';
import { TkxButton, TkxCard, TkxCardBody } from 'tekivex-ui';

export default function Page() {
  return (
    <main>
      <section className="hero">
        <h1>Build ATS-ready resumes in minutes.</h1>
        <p style={{ fontSize: '0.9rem' }}>
          Clean, scannable templates. Skill matching. Smart guidance for students and professionals.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/auth/register"><TkxButton as="span">Get started</TkxButton></Link>
          <Link href="/resume/start"><TkxButton variant="outline" as="span">Start resume</TkxButton></Link>
        </div>
      </section>

      <section className="grid">
        <TkxCard className="col-7" padding="md">
          <TkxCardBody>
            <h3>Resume Editor</h3>
            <p style={{ fontSize: '0.9rem' }}>
              Create ATS-safe resumes with structured sections and plain-text friendly formatting.
            </p>
          </TkxCardBody>
        </TkxCard>
        <TkxCard className="col-5" padding="md">
          <TkxCardBody>
            <h3>AI Suggestions</h3>
            <p style={{ fontSize: '0.9rem' }}>
              Get targeted improvements for impact, clarity, and keyword alignment.
            </p>
          </TkxCardBody>
        </TkxCard>
        <TkxCard className="col-12" padding="md">
          <TkxCardBody>
            <h3>Job Description Matching</h3>
            <p style={{ fontSize: '0.9rem' }}>
              Upload a JD to calculate match %, skill gaps, and tailored guidance.
            </p>
          </TkxCardBody>
        </TkxCard>
      </section>
    </main>
  );
}
