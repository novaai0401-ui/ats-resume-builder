'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TkxButton, TkxCard, TkxCardBody, TkxAlert } from 'tekivex-ui';
import { api, getAccessToken } from '@/src/lib/api';

type PlanPricing = {
  priceUsd: number;
  priceInr: number;
  priceInrWithGst: number;
  gstRate: number;
  gstAmount: number;
  displayPriceInr: string;
  displayPriceUsd: string;
};

type PlanStatus = {
  plan: string;
  limits: Record<string, number>;
  usage: Record<string, number>;
  stripeConfigured: boolean;
  currency?: 'USD' | 'INR';
  pricing?: {
    free: PlanPricing;
    student: PlanPricing;
    pro: PlanPricing;
  };
  region?: 'IN' | 'GLOBAL';
};

export default function BillingPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    const hasToken = Boolean(getAccessToken());
    setAuthed(hasToken);
    if (!hasToken) {
      sessionStorage.setItem('rb_return_to', '/billing');
      router.push('/auth/login');
      return;
    }
    // Fetch current plan status
    api.getBillingStatus()
      .then(setPlanStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function handleUpgrade(plan: 'STUDENT' | 'PRO') {
    setMessage('');
    setSuccess('');
    setUpgrading(true);
    try {
      if (planStatus?.stripeConfigured) {
        // Use Stripe checkout
        const { url } = await api.checkout(plan);
        window.location.href = url;
      } else {
        // Direct upgrade (no Stripe needed)
        const result = await api.directUpgrade(plan);
        setSuccess(result.message || `Upgraded to ${plan}!`);
        setPlanStatus((prev) => prev ? { ...prev, plan, limits: result.limits } : prev);
        // Update stored plan
        localStorage.setItem('rb_plan', plan);
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Upgrade failed. Please try again.');
    } finally {
      setUpgrading(false);
    }
  }

  async function handleDowngrade() {
    setMessage('');
    setSuccess('');
    try {
      const result = await api.directDowngrade();
      setSuccess(result.message || 'Downgraded to Free.');
      setPlanStatus((prev) => prev ? { ...prev, plan: 'FREE', limits: result.limits } : prev);
      localStorage.setItem('rb_plan', 'FREE');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Downgrade failed.');
    }
  }

  async function openPortal() {
    setMessage('');
    try {
      const { url } = await api.portal();
      window.location.href = url;
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not open subscription portal.');
    }
  }

  if (loading || !authed) {
    return (
      <main className="grid">
        <TkxCard as="section" className="col-12" padding="md"><TkxCardBody><p style={{ fontSize: '0.9rem' }}>Loading...</p></TkxCardBody></TkxCard>
      </main>
    );
  }

  const currentPlan = planStatus?.plan || 'FREE';
  const isStudent = currentPlan === 'STUDENT';
  const isPro = currentPlan === 'PRO';
  const isPaid = isStudent || isPro;
  const isIndia = planStatus?.region === 'IN' || planStatus?.currency === 'INR';
  const pricing = planStatus?.pricing;

  const formatPrice = (plan: 'free' | 'student' | 'pro') => {
    if (!pricing) {
      const fallback: Record<string, string> = { free: '$0', student: '$4.99', pro: '$9.99' };
      return fallback[plan];
    }
    const p = pricing[plan];
    return isIndia ? p.displayPriceInr : p.displayPriceUsd;
  };

  const formatGst = (plan: 'student' | 'pro') => {
    if (!pricing || !isIndia) return null;
    const p = pricing[plan];
    if (!p.gstAmount) return null;
    return `+ ₹${p.gstAmount} GST (${Math.round(p.gstRate * 100)}%)`;
  };

  return (
    <main className="grid">
      <TkxCard as="section" className="col-12" padding="lg">
        <TkxCardBody>
          <h2>Your Plan</h2>
          <p style={{ fontSize: '0.9rem', maxWidth: 600, marginBottom: 8 }}>
            Core ATS scoring and resume editing are free forever. Upgrade for premium AI features.
          </p>
          {currentPlan !== 'FREE' && (
            <p style={{ fontSize: '0.9rem', color: '#1e5b35', fontWeight: 600, marginBottom: 12 }}>
              Current plan: <strong>{currentPlan}</strong>
            </p>
          )}

          <div className="grid" style={{ marginTop: 12, gap: 16 }}>
            {/* Free */}
            <TkxCard className="col-4" padding="md" style={{ borderColor: currentPlan === 'FREE' ? '#1e5b35' : '#d0dbe7', borderWidth: currentPlan === 'FREE' ? 2 : 1 }}>
              <TkxCardBody>
                <h3 style={{ color: '#1a3a5c' }}>Free</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a3a5c', margin: '8px 0' }}>{formatPrice('free')}</p>
                <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: 16, lineHeight: 2 }}>
                  <li>ATS scoring (up to 90)</li>
                  <li>Resume editing & templates</li>
                  <li>Standard JD parsing</li>
                  <li>2 ATS scans / month</li>
                  <li>5 PDF exports / month</li>
                </ul>
                {currentPlan === 'FREE' && <p style={{ fontSize: '0.9rem', marginTop: 12, color: '#1e5b35', fontWeight: 600 }}>Your current plan</p>}
                {isPaid && <TkxButton variant="ghost" size="sm" onClick={handleDowngrade} style={{ marginTop: 12 }}>Downgrade to Free</TkxButton>}
              </TkxCardBody>
            </TkxCard>

            {/* Student */}
            <TkxCard className="col-4" padding="md" style={{ borderColor: isStudent ? '#1e5b35' : '#5b9bd5', borderWidth: 2 }}>
              <TkxCardBody>
                <h3 style={{ color: '#1a3a5c' }}>Student</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a3a5c', margin: '8px 0' }}>{formatPrice('student')}<span style={{ fontWeight: 400, fontSize: '0.9rem' }}>/mo</span></p>
                {formatGst('student') && <p style={{ fontSize: '0.75rem', color: '#666', margin: '-4px 0 4px' }}>{formatGst('student')}</p>}
                <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: 16, lineHeight: 2 }}>
                  <li><strong>ATS optimization to 95+</strong></li>
                  <li>AI-powered resume critique</li>
                  <li>Technology gap analysis</li>
                  <li>50 ATS scans / month</li>
                  <li>25 PDF exports / month</li>
                  <li>10 saved resumes</li>
                </ul>
                {isStudent ? (
                  <p style={{ fontSize: '0.9rem', marginTop: 12, color: '#1e5b35', fontWeight: 600 }}>Your current plan</p>
                ) : (
                  <TkxButton isFullWidth isLoading={upgrading} loadingText="Upgrading..." onClick={() => handleUpgrade('STUDENT')} style={{ marginTop: 12 }}>
                    {isPro ? 'Switch to Student' : 'Upgrade to Student'}
                  </TkxButton>
                )}
              </TkxCardBody>
            </TkxCard>

            {/* Pro */}
            <TkxCard className="col-4" padding="md" style={{ borderColor: isPro ? '#1e5b35' : '#2f5f8f', borderWidth: 2 }}>
              <TkxCardBody>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#2f5f8f', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginBottom: 4 }}>BEST VALUE</span>
                <h3 style={{ color: '#1a3a5c' }}>Pro</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a3a5c', margin: '8px 0' }}>{formatPrice('pro')}<span style={{ fontWeight: 400, fontSize: '0.9rem' }}>/mo</span></p>
                {formatGst('pro') && <p style={{ fontSize: '0.75rem', color: '#666', margin: '-4px 0 4px' }}>{formatGst('pro')}</p>}
                <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: 16, lineHeight: 2 }}>
                  <li><strong>ATS optimization to 100</strong></li>
                  <li>Premium AI career guidance</li>
                  <li>Premium course recommendations</li>
                  <li>Advanced job suggestions</li>
                  <li>300 ATS scans / month</li>
                  <li>200 PDF exports / month</li>
                  <li>100 saved resumes</li>
                </ul>
                {isPro ? (
                  <p style={{ fontSize: '0.9rem', marginTop: 12, color: '#1e5b35', fontWeight: 600 }}>Your current plan</p>
                ) : (
                  <TkxButton isFullWidth isLoading={upgrading} loadingText="Upgrading..." onClick={() => handleUpgrade('PRO')} style={{ marginTop: 12 }}>
                    Upgrade to Pro
                  </TkxButton>
                )}
              </TkxCardBody>
            </TkxCard>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {planStatus?.stripeConfigured && isPaid && (
              <TkxButton variant="outline" onClick={openPortal}>Manage Subscription</TkxButton>
            )}
            <TkxButton variant="ghost" onClick={() => router.push('/dashboard')}>Back to Dashboard</TkxButton>
          </div>

          {success && <TkxAlert variant="success" style={{ marginTop: 12 }}>{success}</TkxAlert>}
          {message && <TkxAlert variant="warning" style={{ marginTop: 12 }}>{message}</TkxAlert>}
        </TkxCardBody>
      </TkxCard>
    </main>
  );
}
