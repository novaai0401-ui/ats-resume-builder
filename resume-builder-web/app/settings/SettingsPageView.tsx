'use client';

import Link from 'next/link';
import TrainingConsentCard from '@/src/components/TrainingConsentCard';
import ByokKeyCard from '@/src/components/ByokKeyCard';
import EncryptedBackupCard from '@/src/components/EncryptedBackupCard';
import ShareLinksCard from '@/src/components/ShareLinksCard';
import ReferralCard from '@/src/components/ReferralCard';
import ApiAccessCard from '@/src/components/ApiAccessCard';
import IntegrationsCard from '@/src/components/IntegrationsCard';
import LoginActivityCard from '@/src/components/LoginActivityCard';

/**
 * User settings.
 *
 * Bring-your-own-LLM-key was reintroduced in a different shape: it is
 * visible ONLY to free-plan users and lets them plug in their own
 * AI key (Groq is free) to enable Sahaayak / Mentor conversations.
 * Paid users (STUDENT / PRO) see "AI included with your plan" instead
 * — see ByokKeyCard for the plan branch.
 */
export default function SettingsPageView() {
  return (
    <main className="container">
      <section className="card">
        <h1 style={{ marginTop: 0 }}>Settings</h1>
        <p className="small" style={{ marginTop: 0, color: 'var(--muted)' }}>
          CallbackCV keeps preferences minimal — most of what would live in a settings page
          is just plan management.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Plan &amp; billing</h2>
        <p className="small" style={{ color: 'var(--muted)' }}>
          Your current plan, monthly limits, and billing history live on the billing page.
        </p>
        <Link className="btn" href="/billing">Manage plan</Link>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Privacy</h2>
        <p className="small" style={{ color: 'var(--muted)' }}>
          Your resume is parsed and stored on our servers (HTTPS in transit, encrypted at rest)
          so it follows you across devices. We don't sell your data and we never use your
          resume to train AI unless you opt in below.
        </p>
        <Link className="btn secondary" href="/dashboard">Back to dashboard</Link>
      </section>

      <LoginActivityCard />

      <div style={{ marginTop: 16 }}>
        <EncryptedBackupCard />
      </div>

      <div style={{ marginTop: 16 }}>
        <ByokKeyCard />
      </div>

      <ApiAccessCard />

      <IntegrationsCard />

      <div style={{ marginTop: 16 }}>
        <TrainingConsentCard />
      </div>

      <ShareLinksCard />

      <ReferralCard />
    </main>
  );
}
