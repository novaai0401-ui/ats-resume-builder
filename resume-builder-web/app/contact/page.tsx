import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/src/lib/support';

export const metadata: Metadata = {
  title: 'Contact CallbackCV',
  description: 'How to reach CallbackCV support — email, response times, and what to include.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <main className="container" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      <h1>Contact us</h1>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — we usually respond within
        one business day.
      </p>
      <h2>To help us help you faster</h2>
      <ul>
        <li>Use the email address your account is registered with.</li>
        <li>For payment issues, include the payment reference from your gateway receipt — we can
          re-send a paid download without charging you again.</li>
        <li>For a bug, a screenshot plus the page you were on is usually enough.</li>
      </ul>
      <h2>Before you write</h2>
      <p>
        Billing questions are often answered on <Link href="/pricing">Pricing</Link>, and data
        questions in the <Link href="/privacy">Privacy Policy</Link>. Recruiters trying to reach a
        candidate whose resume you received via a public link: use the contact form on that page —
        it relays your message without exposing the candidate&apos;s details.
      </p>
    </main>
  );
}
