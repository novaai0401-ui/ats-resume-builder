import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/src/lib/support';
import {
  TrustCard,
  TrustCta,
  TrustGrid,
  TrustHero,
  TrustPageShell,
} from '@/src/components/TrustPage';

export const metadata: Metadata = {
  title: 'Contact CallbackCV',
  description: 'How to reach CallbackCV support — email, response times, and what to include.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <TrustPageShell>
      <TrustHero eyebrow="Contact" title="Talk to a" accent="human">
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — we usually respond within
        one business day.
      </TrustHero>

      <TrustGrid>
        <TrustCard icon="⚡" title="To help us help you faster">
          <ul>
            <li>Use the email address your account is registered with.</li>
            <li>For <strong>payment issues</strong>, include the payment reference from your gateway
              receipt — we can re-send a paid download without charging you again.</li>
            <li>For a <strong>bug</strong>, a screenshot plus the page you were on is usually enough.</li>
          </ul>
        </TrustCard>

        <TrustCard icon="?" title="Before you write">
          <ul>
            <li>Billing questions are often answered on <Link href="/pricing">Pricing</Link>.</li>
            <li>Data questions live in the <Link href="/privacy">Privacy Policy</Link>.</li>
            <li><strong>Recruiters</strong> reaching a candidate via a public resume link: use the
              contact form on that page — it relays your message without exposing the
              candidate&apos;s details.</li>
          </ul>
        </TrustCard>

        <TrustCta>
          <p><strong>Accessibility barriers go to the front of the queue.</strong></p>
          <p>See the <Link href="/accessibility">accessibility statement</Link> for what to include.</p>
        </TrustCta>
      </TrustGrid>
    </TrustPageShell>
  );
}
