'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getAccessToken } from '@/src/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

type PlanStatus = {
  plan: string;
  limits: Record<string, number>;
  usage: Record<string, number>;
  stripeConfigured: boolean;
  razorpayConfigured: boolean;
  periodEnd: string | null;
};

type PaymentRecord = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  plan: string;
  provider: string;
  paymentMethod: string;
  date: string;
};

// ─── Razorpay Script Loader ─────────────────────────────────────────────────

let razorpayScriptLoaded = false;

function loadRazorpayScript(): Promise<void> {
  if (razorpayScriptLoaded || typeof window === 'undefined') return Promise.resolve();
  if ((window as any).Razorpay) {
    razorpayScriptLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      razorpayScriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.body.appendChild(script);
  });
}

// ─── Plan Definitions ───────────────────────────────────────────────────────

const PLANS = [
  {
    key: 'FREE',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    badge: null,
    features: [
      'ATS scoring (up to 90)',
      'Resume editing & templates',
      'Standard JD parsing',
      '2 ATS scans / month',
      '5 PDF exports / month',
    ],
  },
  {
    key: 'STUDENT',
    name: 'Student',
    monthlyPrice: 4.99,
    annualPrice: 49.99,
    badge: null,
    features: [
      { text: 'ATS optimization to 95+', bold: true },
      'AI-powered resume critique',
      'Technology gap analysis',
      '50 ATS scans / month',
      '25 PDF exports / month',
      '10 saved resumes',
    ],
  },
  {
    key: 'PRO',
    name: 'Pro',
    monthlyPrice: 9.99,
    annualPrice: 99.99,
    badge: 'BEST VALUE',
    features: [
      { text: 'ATS optimization to 100', bold: true },
      'Premium AI career guidance',
      'Premium course recommendations',
      'Advanced job suggestions',
      '300 ATS scans / month',
      '200 PDF exports / month',
      '100 saved resumes',
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const hasToken = Boolean(getAccessToken());
    setAuthed(hasToken);
    if (!hasToken) {
      sessionStorage.setItem('rb_return_to', '/billing');
      router.push('/auth/login');
      return;
    }
    api.getBillingStatus()
      .then((status) => setPlanStatus(status as PlanStatus))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  // Load payment history when toggled
  const loadPaymentHistory = useCallback(async () => {
    if (payments.length > 0) return;
    try {
      const history = await api.getPaymentHistory();
      setPayments(history);
    } catch {
      // Silent fail — history is non-critical
    }
  }, [payments.length]);

  // ─── Upgrade Handler ────────────────────────────────────────────────────

  async function handleUpgrade(plan: 'STUDENT' | 'PRO') {
    setMessage('');
    setSuccess('');
    setUpgrading(true);
    try {
      // Priority 1: Razorpay (if configured)
      if (planStatus?.razorpayConfigured) {
        await loadRazorpayScript();
        const order = await api.createRazorpayOrder(plan, billingInterval);
        openRazorpayCheckout(order, plan);
        return; // Don't setUpgrading(false) — Razorpay modal handles it
      }

      // Priority 2: Stripe (if configured)
      if (planStatus?.stripeConfigured) {
        const { url } = await api.checkout(plan);
        window.location.href = url;
        return;
      }

      // Fallback: Direct upgrade (dev/testing mode)
      const result = await api.directUpgrade(plan);
      setSuccess(result.message || `Upgraded to ${plan}!`);
      setPlanStatus((prev) => prev ? { ...prev, plan, limits: result.limits } : prev);
      localStorage.setItem('rb_plan', plan);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Upgrade failed. Please try again.');
    } finally {
      setUpgrading(false);
    }
  }

  // ─── Razorpay Checkout ──────────────────────────────────────────────────

  function openRazorpayCheckout(
    order: {
      orderId: string;
      amount: number;
      currency: string;
      keyId: string;
      userEmail: string;
      userName: string;
      interval: string;
    },
    plan: 'STUDENT' | 'PRO',
  ) {
    const RazorpayConstructor = (window as any).Razorpay;
    if (!RazorpayConstructor) {
      setMessage('Razorpay script not loaded. Please refresh and try again.');
      setUpgrading(false);
      return;
    }

    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'ATS Resume Builder',
      description: `${plan} Plan — ${order.interval === 'annual' ? 'Annual' : 'Monthly'}`,
      order_id: order.orderId,
      prefill: {
        email: order.userEmail,
        name: order.userName,
      },
      theme: {
        color: '#1a3a5c',
      },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        // Payment succeeded — verify on backend
        try {
          const result = await api.verifyRazorpayPayment({
            ...response,
            plan,
            interval: billingInterval,
          });
          setSuccess(result.message || `Successfully upgraded to ${plan}!`);
          setPlanStatus((prev) =>
            prev
              ? {
                  ...prev,
                  plan,
                  limits: result.limits,
                  periodEnd: result.periodEnd,
                }
              : prev,
          );
          localStorage.setItem('rb_plan', plan);
          // Refresh payment history
          setPayments([]);
        } catch (err: unknown) {
          setMessage(err instanceof Error ? err.message : 'Payment verification failed.');
        } finally {
          setUpgrading(false);
        }
      },
      modal: {
        ondismiss: () => {
          setUpgrading(false);
        },
      },
    };

    const rzp = new RazorpayConstructor(options);
    rzp.on('payment.failed', (response: any) => {
      setMessage(
        response?.error?.description || 'Payment failed. Please try again.',
      );
      setUpgrading(false);
    });
    rzp.open();
  }

  // ─── Downgrade Handler ──────────────────────────────────────────────────

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

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading || !authed) {
    return (
      <main className="grid">
        <section className="card col-12"><p className="small">Loading...</p></section>
      </main>
    );
  }

  const currentPlan = planStatus?.plan || 'FREE';
  const isStudent = currentPlan === 'STUDENT';
  const isPro = currentPlan === 'PRO';
  const isPaid = isStudent || isPro;

  const usage = planStatus?.usage || {};

  return (
    <main className="grid">
      <section className="card col-12">
        <h2>Your Plan</h2>
        <p className="small" style={{ maxWidth: 600, marginBottom: 8 }}>
          Core ATS scoring and resume editing are free forever. Upgrade for premium AI features.
        </p>
        {currentPlan !== 'FREE' && (
          <p className="small" style={{ color: '#1e5b35', fontWeight: 600, marginBottom: 4 }}>
            Current plan: <strong>{currentPlan}</strong>
            {planStatus?.periodEnd && (
              <span style={{ fontWeight: 400, color: '#4b5d74' }}>
                {' '}— Renews {new Date(planStatus.periodEnd).toLocaleDateString()}
              </span>
            )}
          </p>
        )}

        {/* Billing Interval Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 8 }}>
          <button
            className={`btn ${billingInterval === 'monthly' ? '' : 'ghost'}`}
            style={{ fontSize: '0.8rem', padding: '4px 14px' }}
            onClick={() => setBillingInterval('monthly')}
          >
            Monthly
          </button>
          <button
            className={`btn ${billingInterval === 'annual' ? '' : 'ghost'}`}
            style={{ fontSize: '0.8rem', padding: '4px 14px' }}
            onClick={() => setBillingInterval('annual')}
          >
            Annual — Save 17%
          </button>
        </div>

        {/* Plan Cards */}
        <div className="grid" style={{ gap: 16 }}>
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const price = billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
            const borderColor = isCurrent ? '#1e5b35' : plan.key === 'PRO' ? '#2f5f8f' : plan.key === 'STUDENT' ? '#5b9bd5' : '#d0dbe7';

            return (
              <div
                key={plan.key}
                className="card col-4"
                style={{ borderColor, borderWidth: isCurrent || plan.key !== 'FREE' ? 2 : 1 }}
              >
                {plan.badge && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#2f5f8f', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginBottom: 4 }}>
                    {plan.badge}
                  </span>
                )}
                <h3 style={{ color: '#1a3a5c' }}>{plan.name}</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a3a5c', margin: '8px 0' }}>
                  {price === 0 ? '$0' : `$${price.toFixed(2)}`}
                  {price > 0 && (
                    <span className="small" style={{ fontWeight: 400 }}>
                      /{billingInterval === 'annual' ? 'yr' : 'mo'}
                    </span>
                  )}
                </p>
                <ul className="small" style={{ margin: 0, paddingLeft: 16, lineHeight: 2 }}>
                  {plan.features.map((f, i) => {
                    const text = typeof f === 'string' ? f : f.text;
                    const bold = typeof f === 'object' && f.bold;
                    return <li key={i}>{bold ? <strong>{text}</strong> : text}</li>;
                  })}
                </ul>
                {isCurrent ? (
                  <p className="small" style={{ marginTop: 12, color: '#1e5b35', fontWeight: 600 }}>
                    Your current plan
                  </p>
                ) : plan.key === 'FREE' ? (
                  isPaid ? (
                    <button className="btn ghost" onClick={handleDowngrade} style={{ marginTop: 12, fontSize: '0.8rem' }}>
                      Downgrade to Free
                    </button>
                  ) : null
                ) : (
                  <button
                    className="btn"
                    onClick={() => handleUpgrade(plan.key as 'STUDENT' | 'PRO')}
                    disabled={upgrading}
                    style={{ marginTop: 12, width: '100%' }}
                  >
                    {upgrading
                      ? 'Processing...'
                      : isPro && plan.key === 'STUDENT'
                        ? 'Switch to Student'
                        : `Upgrade to ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {planStatus?.stripeConfigured && isPaid && (
            <button className="btn secondary" onClick={openPortal}>Manage Subscription</button>
          )}
          <button className="btn ghost" onClick={() => router.push('/dashboard')}>Back to Dashboard</button>
        </div>

        {/* Success / Error Messages */}
        {success && (
          <div style={{ marginTop: 12, background: '#e8f5ec', border: '1px solid #9fd0ad', borderRadius: 10, padding: 12 }}>
            <p className="small" style={{ color: '#1e5b35', margin: 0 }}>{success}</p>
          </div>
        )}
        {message && (
          <div className="message-banner" style={{ marginTop: 12 }}>
            <p className="small">{message}</p>
          </div>
        )}
      </section>

      {/* ─── Usage Dashboard ──────────────────────────────────────────────── */}
      {isPaid && (
        <section className="card col-12" style={{ marginTop: 16 }}>
          <h3 style={{ color: '#1a3a5c', marginBottom: 12 }}>AI Usage This Month</h3>
          <div className="grid" style={{ gap: 12 }}>
            <UsageBar label="AI Tokens" used={usage.aiTokensUsed || 0} limit={usage.aiTokensLimit || 1} />
            <UsageBar label="ATS Scans" used={usage.atsScansUsed || 0} limit={usage.atsScansLimit || 1} />
            <UsageBar label="PDF Exports" used={usage.pdfExportsUsed || 0} limit={usage.pdfExportsLimit || 1} />
          </div>
          {planStatus?.periodEnd && (
            <p className="small" style={{ marginTop: 10, color: '#4b5d74' }}>
              Resets: {new Date(planStatus.periodEnd).toLocaleDateString()}
            </p>
          )}
        </section>
      )}

      {/* ─── Payment History ──────────────────────────────────────────────── */}
      {isPaid && (
        <section className="card col-12" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: '#1a3a5c', margin: 0 }}>Billing History</h3>
            <button
              className="btn ghost"
              style={{ fontSize: '0.8rem' }}
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) loadPaymentHistory();
              }}
            >
              {showHistory ? 'Hide' : 'Show'}
            </button>
          </div>
          {showHistory && (
            <div style={{ marginTop: 12 }}>
              {payments.length === 0 ? (
                <p className="small" style={{ color: '#4b5d74' }}>No payment records found.</p>
              ) : (
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #d0dbe7', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px' }}>Date</th>
                      <th style={{ padding: '6px 8px' }}>Plan</th>
                      <th style={{ padding: '6px 8px' }}>Amount</th>
                      <th style={{ padding: '6px 8px' }}>Method</th>
                      <th style={{ padding: '6px 8px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '6px 8px' }}>{new Date(p.date).toLocaleDateString()}</td>
                        <td style={{ padding: '6px 8px' }}>{p.plan}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {p.currency === 'INR' ? '₹' : '$'}{p.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 8px' }}>{p.paymentMethod || '-'}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{
                            color: p.status === 'captured' ? '#1e5b35' : p.status === 'failed' ? '#c0392b' : '#6c757d',
                            fontWeight: 600,
                          }}>
                            {p.status === 'captured' ? 'Paid' : p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// ─── Usage Bar Component ─────────────────────────────────────────────────────

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 90 ? '#c0392b' : pct > 70 ? '#e67e22' : '#27ae60';
  const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  return (
    <div className="col-4" style={{ minWidth: 180 }}>
      <p className="small" style={{ margin: '0 0 4px', fontWeight: 600, color: '#1a3a5c' }}>{label}</p>
      <div style={{ height: 8, background: '#e8edf2', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <p className="small" style={{ margin: '2px 0 0', color: '#4b5d74' }}>
        {formatNum(used)} / {formatNum(limit)} ({Math.round(pct)}%)
      </p>
    </div>
  );
}
