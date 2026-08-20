'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TkxCard, TkxButton, TkxBadge, TkxAlert } from 'tekivex-ui';
import { api, getAccessToken, getCurrentUserEmail } from '@/src/lib/api';
import { SUPPORT_EMAIL, supportMailto } from '@/src/lib/support';
import { PaidResumeRecoveryForm } from '@/src/components/PaidResumeRecoveryForm';

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
  const [razorpayConfigured, setRazorpayConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!getAccessToken()) {
      if (typeof window !== 'undefined') sessionStorage.setItem('rb_return_to', '/billing');
      router.push('/auth/login');
      return;
    }
    api.getBillingStatus()
      .then((s) => { setPlan(s.plan); setRazorpayConfigured(Boolean(s.razorpayConfigured)); })
      .catch(() => undefined);
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
          name: 'CallbackCV',
          description: 'CallbackCV Plus — ₹499/mo',
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
              setNotice('You’re on CallbackCV Plus. AI is unlocked everywhere and the per-download AI fee is waived.');
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

  async function handleCancel() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api.directDowngrade();
      setPlan(res.plan);
      setNotice('Your plan was cancelled. You’re back on Free — downloads are ₹49 and AI uses your key or the ₹20 per-download option.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not cancel the plan.');
    } finally {
      setBusy(false);
    }
  }

  const featureLi = (text: React.ReactNode) => (
    <li style={{ display: 'flex', gap: 9, alignItems: 'flex-start', lineHeight: 1.5 }}>
      <span aria-hidden style={{ color: 'var(--success)', fontWeight: 800, marginTop: 1 }}>✓</span>
      <span style={{ color: 'var(--ink)' }}>{text}</span>
    </li>
  );

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 4px 40px' }}>
      <header style={{ textAlign: 'center', maxWidth: 660, margin: '8px auto 24px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 32, letterSpacing: '-0.02em' }}>Simple, honest pricing</h1>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 16, lineHeight: 1.6 }}>
          Build and ATS-check resumes for free. Pay <strong>₹49</strong> only when you download a
          finished resume. Use AI free with your own key — or get one plan,{' '}
          <strong>₹499/mo</strong>, for our AI everywhere.
        </p>
      </header>

      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, margin: '-8px 0 18px' }}>
        Payment problem, wrong file downloaded, or paid but no download? Email{' '}
        <a href={supportMailto('Billing / download issue')} style={{ color: 'var(--primary)' }}>{SUPPORT_EMAIL}</a>{' '}
        — we resolve or refund.
      </p>

      <div style={{ maxWidth: 460, margin: '0 auto 22px' }}>
        <PaidResumeRecoveryForm />
      </div>

      {notice ? <div style={{ marginBottom: 16 }}><TkxAlert variant="success">{notice}</TkxAlert></div> : null}
      {error ? <div style={{ marginBottom: 16 }}><TkxAlert variant="danger">{error}</TkxAlert></div> : null}

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'stretch' }}>
        {/* Free */}
        <TkxCard variant="outlined" padding="lg">
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>Build for free</h3>
          <p style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 14px', letterSpacing: '-0.02em' }}>₹0</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10, fontSize: 14 }}>
            {featureLi('Resume editing & all ATS-safe templates')}
            {featureLi('ATS scoring & section guidance')}
            {featureLi('JD match & Recruiter-AI screen (rule-based)')}
            {featureLi('Public share link with a watermarked PDF')}
          </ul>
        </TkxCard>

        {/* Pay per download */}
        <TkxCard variant="elevated" padding="lg">
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>Pay only to download</h3>
          <p style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 14px', letterSpacing: '-0.02em' }}>
            ₹49 <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>/ download (~$0.99)</span>
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10, fontSize: 14 }}>
            {featureLi('Clean, watermark-free PDF & Word export')}
            {featureLi('One-time charge — no plan, no auto-renewal')}
            {featureLi('If our AI improved that resume (no key / plan), a small flat AI fee is added to that one download.')}
          </ul>
        </TkxCard>

        {/* Plus */}
        <TkxCard
          variant="elevated"
          padding="lg"
          style={{
            position: 'relative',
            borderColor: 'var(--primary)',
            boxShadow: 'var(--shadow-lg)',
            // Token gradient: the hardcoded #f3f2ff->#fff stayed light in dark
            // mode while every heading and price followed the theme — the card
            // rendered near-blank (founder screenshot).
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--primary) 8%, var(--card)) 0%, var(--card) 60%)',
          }}
        >
          <div style={{ position: 'absolute', top: 14, right: 14 }}>
            <TkxBadge variant="primary">Most popular</TkxBadge>
          </div>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>CallbackCV Plus</h3>
          <p style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 14px', letterSpacing: '-0.02em' }}>
            ₹499 <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>/ month</span>
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 10, fontSize: 14 }}>
            {featureLi(<>Our AI across <strong>every</strong> feature — Mentor, Interview Prep, Recruiter-AI, Skill-Demand, Cover Letter</>)}
            {featureLi('No per-download AI fee — only the ₹49 download')}
            {featureLi('Cancel anytime')}
          </ul>
          {planActive ? (
            <>
              <TkxBadge variant="success" style={{ marginBottom: 10 }}>You’re on Plus ✓</TkxBadge>
              <TkxButton variant="outline" colorScheme="secondary" isFullWidth onClick={handleCancel} isLoading={busy}>
                Cancel plan (switch to Free)
              </TkxButton>
            </>
          ) : razorpayConfigured === false ? (
            <p style={{ margin: 0, color: 'var(--warning)', fontSize: 13, lineHeight: 1.5 }}>
              Online payments aren’t available yet. Meanwhile, add your own AI key in Settings (free)
              to use every AI feature.
            </p>
          ) : (
            <TkxButton variant="solid" colorScheme="primary" glow isFullWidth onClick={handleSubscribe} isLoading={busy} disabled={razorpayConfigured === null}>
              Get Plus — ₹499/mo
            </TkxButton>
          )}
        </TkxCard>
      </div>

      <div style={{ marginTop: 20 }}>
        {!planActive ? (
          <TkxCard variant="glass" padding="lg">
            <h3 style={{ marginTop: 0 }}>Prefer to use your own AI key? It’s free.</h3>
            <p style={{ color: 'var(--muted)', maxWidth: 680, lineHeight: 1.6 }}>
              Add your own AI key (Groq, OpenAI or Anthropic) in Settings and every AI feature runs on
              your key at no charge from us. Your key is stored only on your device and is sent only to
              make the single call you requested. You still pay just ₹49 per resume download.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <Link href="/settings"><TkxButton variant="outline" colorScheme="primary">Add your AI key</TkxButton></Link>
              <TkxButton variant="ghost" colorScheme="secondary" onClick={() => router.push('/dashboard')}>Back to Dashboard</TkxButton>
            </div>
          </TkxCard>
        ) : (
          <TkxCard variant="glass" padding="lg">
            <p style={{ margin: 0, color: 'var(--ink)', lineHeight: 1.6 }}>
              You’re on CallbackCV Plus — our AI is unlocked across every feature, with no
              per-download AI fee, and downloads are free on your plan.
            </p>
            <div style={{ marginTop: 12 }}>
              <TkxButton variant="ghost" colorScheme="secondary" onClick={() => router.push('/dashboard')}>Back to Dashboard</TkxButton>
            </div>
          </TkxCard>
        )}
      </div>
    </main>
  );
}
