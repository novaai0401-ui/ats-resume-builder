import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/src/lib/support';
import {
  TrustCard,
  TrustGrid,
  TrustHero,
  TrustPageShell,
} from '@/src/components/TrustPage';

export const metadata: Metadata = {
  title: 'Terms of Service — CallbackCV',
  description: 'The terms that govern your use of CallbackCV: accounts, payments, refunds, acceptable use, and liability.',
  alternates: { canonical: '/terms' },
};

/**
 * Plain-language terms, premium treatment. The payment/refund card mirrors what
 * the billing code actually does (per-download charge, monthly Plus,
 * support-resend for paid-but-lost downloads) — terms that contradict the
 * product are worse than none.
 */
export default function TermsPage() {
  return (
    <TrustPageShell>
      <TrustHero eyebrow="Terms of Service" title="Plain-language" accent="terms">
        Last updated 20 August 2026. By creating a CallbackCV account you agree to these terms —
        written to be readable, not to hide anything.
      </TrustHero>

      <TrustGrid>
        <TrustCard icon="§" title="1 · The service">
          <p>
            CallbackCV (a Tekivex product) provides resume building, ATS analysis, job tracking and
            related career tools at callbackcv.tekivex.com.
          </p>
        </TrustCard>

        <TrustCard icon="☺" title="2 · Your account and content">
          <p>
            Your resume and profile data belong to you. You grant us only the processing needed to
            run the service — rendering, exporting, analysis you request. You are responsible for
            what your resume claims and for keeping your login secure. You can delete your account
            and data at any time from Settings.
          </p>
        </TrustCard>

        <TrustCard icon="₹" title="3 · Payments and refunds" wide>
          <ul>
            <li>Building and previewing resumes is <strong>free</strong>. Clean PDF/Word exports are
              charged per download, or included with <strong>CallbackCV Plus</strong> (billed
              monthly, cancel anytime — access runs to the end of the paid period).</li>
            <li>Paid for a download and didn&apos;t get the file (closed tab, network failure)?
              Contact support with your payment reference — we <strong>re-issue the download without
              charging again</strong> rather than refunding by default.</li>
            <li>Payments are processed by Razorpay (India) and Stripe (elsewhere). We never see or
              store your card details.</li>
          </ul>
        </TrustCard>

        <TrustCard icon="⚖" title="4 · Acceptable use">
          <p>
            No scraping, no reselling access, no uploading content that is unlawful or that you have
            no right to use, and no attempting to bypass payment or rate limits. Public share links
            you create are your responsibility — revoke them from Settings when you no longer want
            the page public.
          </p>
        </TrustCard>

        <TrustCard icon="✦" title="5 · AI features">
          <p>
            AI suggestions are drafts, not guarantees — review them before sending a resume to
            anyone. When you bring your own AI key, it is used solely to serve your requests, and
            your usage is governed by that provider&apos;s terms as well.
          </p>
        </TrustCard>

        <TrustCard icon="🛡" title="6 · Liability">
          <p>
            The service is provided “as is”. We do not guarantee interviews, offers, or specific
            callback rates. To the extent permitted by law, our liability is limited to the amount
            you paid us in the three months before the claim.
          </p>
        </TrustCard>

        <TrustCard icon="↻" title="7 · Changes">
          <p>
            We may update these terms; material changes are announced in-app. Continued use after a
            change means you accept it. Questions:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — data specifics live in the{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </TrustCard>
      </TrustGrid>
    </TrustPageShell>
  );
}
