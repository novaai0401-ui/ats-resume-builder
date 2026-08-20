import type { Metadata } from 'next';
import Link from 'next/link';
import {
  TrustCard,
  TrustCta,
  TrustGrid,
  TrustHero,
  TrustPageShell,
} from '@/src/components/TrustPage';

export const metadata: Metadata = {
  title: 'About CallbackCV',
  description:
    'CallbackCV is an ATS-optimised resume builder that measures real callback rates per resume version — built by Tekivex for job seekers in India and beyond.',
  alternates: { canonical: '/about' },
};

/**
 * Trust page, premium treatment. Content stays factual — this page is read by
 * payment-gateway reviewers and quality raters as much as by users, and
 * overclaiming here costs more than it earns.
 */
export default function AboutPage() {
  return (
    <TrustPageShell>
      <TrustHero eyebrow="About us" title="The resume builder that" accent="measures callbacks">
        Most resume tools stop at a predicted “ATS score”. The number that actually matters is
        whether your resume gets replies — so CallbackCV tracks responses per resume version, and
        you see which version works instead of guessing.
      </TrustHero>

      <TrustGrid>
        <TrustCard icon="⚙" title="What it does">
          <ul>
            <li><strong>33 resume templates</strong> — ATS-safe layouts tested against Workday, Greenhouse, iCIMS, Taleo and BambooHR, plus designer templates for sharing with people.</li>
            <li>An <strong>ATS simulator</strong> showing the literal text a parser extracts from your file.</li>
            <li><strong>Per-version outcome tracking</strong>: response, interview and offer rates.</li>
            <li>A <strong>job tracker</strong> with live openings matched to your profile.</li>
          </ul>
        </TrustCard>

        <TrustCard icon="✦" title="AI, on your terms">
          <p>
            Critique, bullet rewriting, JD match, cover letters and an AI copilot that reads your
            resume and tells you what to fix next. Free with your own AI key, or included in
            CallbackCV Plus — and every AI claim is grounded in your actual resume, never invented.
          </p>
        </TrustCard>

        <TrustCard icon="🇮🇳" title="Who it is for">
          <p>
            Job seekers who want proof their resume is working — with a particular focus on the
            Indian market: INR pricing, Razorpay support, and templates tuned for the ATS systems
            Indian employers actually run.
          </p>
        </TrustCard>

        <TrustCard icon="🔒" title="Privacy, briefly">
          <p>
            Your resume is stored in your account, encrypted in transit and at rest. It is never
            sold and never used to train AI without your explicit opt-in. Details in the{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </TrustCard>

        <TrustCta>
          <p><strong>Built by Tekivex.</strong></p>
          <p>
            Questions? <Link href="/contact">Contact us</Link> — or just{' '}
            <Link href="/auth/register">start a resume free</Link>.
          </p>
        </TrustCta>
      </TrustGrid>
    </TrustPageShell>
  );
}
