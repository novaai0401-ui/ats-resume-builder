'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAccessToken } from '@/src/lib/api';

/**
 * Pricing page — post-pivot there are NO subscription tiers.
 *
 *   • Creating, editing and ATS-checking resumes is free.
 *   • Each PDF / Word download is a one-time ₹49 (~$0.99).
 *   • AI features run on the user's own AI key (BYOK) — added in Settings.
 *     Without a key, the built-in rule-based engine still works.
 */
export default function BillingPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) {
      if (typeof window !== 'undefined') sessionStorage.setItem('rb_return_to', '/billing');
      router.push('/auth/login');
    }
  }, [router]);

  return (
    <main className="grid">
      <section className="card col-12">
        <h2 style={{ marginTop: 0 }}>Simple, honest pricing</h2>
        <p className="small" style={{ maxWidth: 640 }}>
          No subscriptions. No monthly fees. You only pay when you download a finished resume.
        </p>
      </section>

      <section className="card col-6">
        <h3 style={{ marginTop: 0, color: '#1a3a5c' }}>Build for free</h3>
        <ul className="small" style={{ paddingLeft: 16, lineHeight: 2, margin: 0 }}>
          <li>Resume editing &amp; all ATS-safe templates</li>
          <li>ATS scoring &amp; section guidance</li>
          <li>JD match &amp; Recruiter-AI screen (rule-based)</li>
          <li>Public share link with a watermarked PDF</li>
        </ul>
      </section>

      <section className="card col-6" style={{ borderColor: '#2f5f8f', borderWidth: 2 }}>
        <h3 style={{ marginTop: 0, color: '#1a3a5c' }}>Pay only to download</h3>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a3a5c', margin: '6px 0' }}>
          ₹49 <span className="small" style={{ fontWeight: 400 }}>per download (~$0.99)</span>
        </p>
        <ul className="small" style={{ paddingLeft: 16, lineHeight: 2, margin: 0 }}>
          <li>Clean, watermark-free PDF &amp; Word export</li>
          <li>One-time charge — no plan, no auto-renewal</li>
          <li>Download as many resumes as you like, pay per export</li>
        </ul>
      </section>

      <section className="card col-12">
        <h3 style={{ marginTop: 0, color: '#1a3a5c' }}>AI features — bring your own key</h3>
        <p className="small" style={{ maxWidth: 640 }}>
          AI rewrites, critique, Recruiter-AI and Skill-Demand analysis run on <strong>your own
          AI key</strong> (Groq, OpenAI or Anthropic). Your key is stored only on your device and is
          never sent to us except to make the single call you requested. Without a key, the built-in
          rule-based engine still gives you a useful result.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <Link className="btn" href="/settings">Add your AI key</Link>
          <button className="btn ghost" onClick={() => router.push('/dashboard')}>Back to Dashboard</button>
        </div>
      </section>
    </main>
  );
}
