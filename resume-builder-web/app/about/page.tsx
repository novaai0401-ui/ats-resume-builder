import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About CallbackCV',
  description:
    'CallbackCV is an ATS-optimised resume builder that measures real callback rates per resume version — built by Tekivex for job seekers in India and beyond.',
  alternates: { canonical: '/about' },
};

/**
 * Trust page. Kept factual — this page is read by payment-gateway reviewers
 * and by Google's quality raters as much as by users, and overclaiming here
 * costs more than it earns.
 */
export default function AboutPage() {
  return (
    <main className="container" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      <h1>About CallbackCV</h1>
      <p>
        CallbackCV is a resume builder and job-search tool built by <strong>Tekivex</strong>. It
        exists because most resume tools stop at a predicted “ATS score”, while the number that
        actually matters is whether your resume gets replies. CallbackCV tracks responses per
        resume version, so you can see which version works instead of guessing.
      </p>
      <h2>What it does</h2>
      <ul>
        <li>ATS-safe resume templates, tested against Workday, Greenhouse, iCIMS, Taleo and BambooHR.</li>
        <li>An ATS simulator that shows the literal text a parser extracts from your file.</li>
        <li>Per-version outcome tracking: response, interview and offer rates.</li>
        <li>A job tracker with live openings matched to your profile.</li>
        <li>AI features (critique, bullet rewriting, JD match, cover letters) — free with your own
          AI key, or included in CallbackCV Plus.</li>
      </ul>
      <h2>Who it is for</h2>
      <p>
        Job seekers who want proof their resume is working — with a particular focus on the Indian
        market: INR pricing, Razorpay support, and templates tuned for the ATS systems Indian
        employers actually run.
      </p>
      <h2>Privacy, briefly</h2>
      <p>
        Your resume is stored in your account, encrypted in transit and at rest. It is never sold
        and never used to train AI without your explicit opt-in. Details in the{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <p>
        Questions? <Link href="/contact">Contact us</Link>.
      </p>
    </main>
  );
}
