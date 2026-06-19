'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getAccessToken, getCurrentUserEmail } from '@/src/lib/api';

/**
 * Pricing page — the post-pivot model (REQUIREMENTS R-071):
 *
 *   • Build, edit and ATS-check resumes for free.
 *   • Each clean PDF / Word download is a one-time ₹49 (~$0.99).
 *   • Resume-upgrade AI (critique, bullet rewrite, JD-match/tailor):
 *     free with your own AI key (BYOK). Without a key, OUR AI runs and a
 *     flat AI fee is added to that resume's next download.
 *   • All other AI (Mentor, Interview Prep, Recruiter-AI, Skill-Demand,
 *     Cover Letter): free with your own key, OR the single ₹499/mo plan
 *     unlocks OUR AI everywhere AND waives the per-download AI fee.
 *
 * The ₹499/mo plan is the ONLY subscription. Internally it maps to the
 * 'PRO' plan value.
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load payment script.'));
    document.body.appendChild(s);
  });
}

export default function BillingPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<string>('FREE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!getAccessToken()) {
      if (typeof window !== 'undefined') sessionStorage.setItem('rb_return_to', '/billing');
      router.push('/auth/login');
      return;
    }
    api.getBillingStatus().then((s) => setPlan(s.plan)).catch(() => undefined);
  }, [router]);

  const planActive = plan && plan !== 'FREE';

  async function handleSubscribe() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const order = await api.createRazorpayOrder('PRO', 'monthly');
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Razorpay = (window as any).Razorpay;
      if (!Razorpay) throw new Error('Razorpay SDK failed to load.');
      await new Promise<void>((resolve, reject) => {
        const rz = new Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'Pocket Resume',
          description: 'Pocket Resume Plus — ₹499/mo',
          order_id: order.orderId,
          prefill: { email: getCurrentUserEmail() || order.userEmail || undefined },
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const verify = await api.verifyRazorpayPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan: 'PRO',
                interval: 'monthly',
              });
              setPlan(verify.plan);
              setNotice('You’re on Pocket Resume Plus. AI is unlocked everywhere and the per-download AI fee is waived.');
              resolve();
            } catch (verifyErr: unknown) {
              reject(verifyErr instanceof Error ? verifyErr : new Error('Verification failed.'));
            }
          },
          modal: { ondismiss: () => reject(new Error('Payment cancelled.')) },
        });
        rz.open();
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h2 style={{ marginTop: 0 }}>Simple, honest pricing</h2>
        <p className="small" style={{ maxWidth: 680 }}>
          Build and ATS-check resumes for free. Pay ₹49 only when you download a finished resume.
          Use AI for free with your own key, or get one plan — <strong>₹499/mo</strong> — for our AI
          everywhere.
        </p>
        {notice ? <p className="hint" style={{ color: '#1e7a3a' }}>{notice}</p> : null}
        {error ? <p className="hint error">{error}</p> : null}
      </section>

      <section className="card col-4">
        <h3 style={{ marginTop: 0, color: '#1a3a5c' }}>Build for free</h3>
        <ul className="small" style={{ paddingLeft: 16, lineHeight: 2, margin: 0 }}>
          <li>Resume editing &amp; all ATS-safe templates</li>
          <li>ATS scoring &amp; section guidance</li>
          <li>JD match &amp; Recruiter-AI screen (rule-based)</li>
          <li>Public share link with a watermarked PDF</li>
        </ul>
      </section>

      <section className="card col-4" style={{ borderColor: '#2f5f8f', borderWidth: 2 }}>
        <h3 style={{ marginTop: 0, color: '#1a3a5c' }}>Pay only to download</h3>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a3a5c', margin: '6px 0' }}>
          ₹49 <span className="small" style={{ fontWeight: 400 }}>per download (~$0.99)</span>
        </p>
        <ul className="small" style={{ paddingLeft: 16, lineHeight: 2, margin: 0 }}>
          <li>Clean, watermark-free PDF &amp; Word export</li>
          <li>One-time charge — no plan, no auto-renewal</li>
          <li>
            If our AI improved that resume (and you have no key / plan), a small flat AI fee is added
            to that one download.
          </li>
        </ul>
      </section>

      <section className="card col-4" style={{ borderColor: '#1a3a5c', borderWidth: 2, background: 'linear-gradient(180deg, #eef5ff 0%, #ffffff 100%)' }}>
        <h3 style={{ marginTop: 0, color: '#1a3a5c' }}>Pocket Resume Plus</h3>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a3a5c', margin: '6px 0' }}>
          ₹499 <span className="small" style={{ fontWeight: 400 }}>/ month</span>
        </p>
        <ul className="small" style={{ paddingLeft: 16, lineHeight: 2, margin: 0 }}>
          <li>Our AI across <strong>every</strong> feature — Mentor, Interview Prep, Recruiter-AI, Skill-Demand, Cover Letter</li>
          <li>No per-download AI fee — only the ₹49 download</li>
          <li>Cancel anytime</li>
        </ul>
        {planActive ? (
          <p className="hint" style={{ color: '#1e7a3a', marginTop: 10 }}>You’re on Plus. ✓</p>
        ) : (
          <button className="btn" style={{ marginTop: 10 }} onClick={handleSubscribe} disabled={busy}>
            {busy ? 'Starting…' : 'Get Plus — ₹499/mo'}
          </button>
        )}
      </section>

      <section className="card col-12">
        <h3 style={{ marginTop: 0, color: '#1a3a5c' }}>Prefer to use your own AI key? It&rsquo;s free.</h3>
        <p className="small" style={{ maxWidth: 680 }}>
          Add your own AI key (Groq, OpenAI or Anthropic) in Settings and every AI feature runs on
          your key at no charge from us. Your key is stored only on your device and is sent only to
          make the single call you requested. You still pay just ₹49 per resume download.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <Link className="btn ghost" href="/settings">Add your AI key</Link>
          <button className="btn ghost" onClick={() => router.push('/dashboard')}>Back to Dashboard</button>
        </div>
      </section>
    </main>
  );
}
