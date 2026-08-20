import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/src/lib/support';

export const metadata: Metadata = {
  title: 'Terms of Service — CallbackCV',
  description: 'The terms that govern your use of CallbackCV: accounts, payments, refunds, acceptable use, and liability.',
  alternates: { canonical: '/terms' },
};

/**
 * Plain-language terms. Written to be readable rather than exhaustive; the
 * payment/refund section mirrors what the billing code actually does (per-
 * download charge, monthly Plus, support-resend for paid-but-lost downloads),
 * because terms that contradict the product are worse than none.
 */
export default function TermsPage() {
  return (
    <main className="container" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      <h1>Terms of Service</h1>
      <p className="small" style={{ color: 'var(--muted)' }}>Last updated: 20 August 2026</p>

      <h2>1. The service</h2>
      <p>
        CallbackCV (a Tekivex product) provides resume building, ATS analysis, job tracking and
        related career tools at callbackcv.tekivex.com. By creating an account you agree to these
        terms.
      </p>

      <h2>2. Your account and content</h2>
      <p>
        Your resume and profile data belong to you. You grant us only the processing needed to run
        the service (rendering, exporting, analysis you request). You are responsible for the
        accuracy of what you put in your resume and for keeping your login secure. You can delete
        your account and data at any time from Settings.
      </p>

      <h2>3. Payments and refunds</h2>
      <ul>
        <li>Building and previewing resumes is free. Clean PDF/Word exports are charged per
          download, or included with CallbackCV Plus (billed monthly, cancel anytime — access runs
          to the end of the paid period).</li>
        <li>If you paid for a download and did not receive the file (closed tab, network failure),
          contact support with your payment reference — we re-issue the download without charging
          again rather than refunding by default.</li>
        <li>Payments are processed by Razorpay (India) and Stripe (elsewhere). We never see or
          store your card details.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>
        Don&apos;t misuse the service: no scraping, no reselling access, no uploading content that is
        unlawful or that you have no right to use, and no attempting to bypass payment or rate
        limits. Public share links you create are your responsibility — revoke them from Settings
        when you no longer want the page public.
      </p>

      <h2>5. AI features</h2>
      <p>
        AI suggestions are drafts, not guarantees — review them before sending a resume to anyone.
        When you bring your own AI key, your key is used solely to serve your requests and your
        usage is governed by that provider&apos;s terms as well.
      </p>

      <h2>6. Liability</h2>
      <p>
        The service is provided “as is”. We do not guarantee interviews, offers, or specific
        callback rates. To the extent permitted by law, our liability is limited to the amount you
        paid us in the three months before the claim.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these terms; material changes will be announced in-app. Continued use after a
        change means you accept it. Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{' '}
        or see the <Link href="/privacy">Privacy Policy</Link> for data specifics.
      </p>
    </main>
  );
}
