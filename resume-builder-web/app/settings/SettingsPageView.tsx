'use client';

import Link from 'next/link';

/**
 * User settings.
 *
 * The bring-your-own-LLM-key form lived here previously. We removed it
 * because the model is now: WE pay for one shared GROQ key; users pay
 * us a subscription. Asking users to manage API keys was confusing and
 * had no benefit for them. See docs/subscription-mechanics.md.
 *
 * This page now points to the surfaces that actually do something:
 * billing (plan + benefits), the dashboard, and the export flow.
 */
export default function SettingsPageView() {
  return (
    <main className="container">
      <section className="card">
        <h1 style={{ marginTop: 0 }}>Settings</h1>
        <p className="small" style={{ marginTop: 0, color: '#5a6778' }}>
          Pocket Resume keeps preferences minimal — most of what would live in a settings page
          is just plan management.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Plan &amp; billing</h2>
        <p className="small" style={{ color: '#5a6778' }}>
          Your current plan, monthly limits, and billing history live on the billing page.
        </p>
        <Link className="btn" href="/billing">Manage plan</Link>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Privacy</h2>
        <p className="small" style={{ color: '#5a6778' }}>
          Your resume stays on this device by default. Cloud sync is opt-in and configured
          inside the editor. We never sell or train AI models on your resume content.
        </p>
        <Link className="btn secondary" href="/dashboard">Back to dashboard</Link>
      </section>
    </main>
  );
}
