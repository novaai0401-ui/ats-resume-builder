'use client';

import { useEffect, useState } from 'react';
import { api, getCurrentUserEmail } from '@/src/lib/api';
import { SUPPORT_EMAIL, supportMailto } from '@/src/lib/support';
import { useFocusTrap } from '@/src/lib/use-focus-trap';

type RazorpayInitResult = {
  provider: 'razorpay';
  orderId: string;
  amount: number;
  /** Flat AI fee (paise) included in `amount` when our AI improved this resume. */
  aiFee?: number;
  currency: string;
  keyId: string;
  resumeId: string;
};

type StripeInitResult = {
  provider: 'stripe';
  checkoutUrl: string;
  sessionId: string;
  amount: number;
  currency: string;
  resumeId: string;
};

type InitResult = RazorpayInitResult | StripeInitResult;

/**
 * Detect whether the user is in India so we know which gateway to use.
 * Browser timezone is the least-intrusive signal (no geolocation prompt)
 * and matches what server-side billing detection already does.
 */
function guessRegion(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (/Kolkata|Calcutta|Asia\/India/i.test(tz)) return 'IN';
  } catch {
    // ignore
  }
  return '';
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('No document.'));
      return;
    }
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

/**
 * Gate the PDF download behind a one-time per-file payment.
 * Opens Razorpay checkout for Indian users (₹49) or redirects to Stripe
 * Checkout for everyone else ($0.99). On success the parent receives a
 * short-lived download token and proceeds with the actual download.
 */
export default function DownloadChargeModal({
  resumeId,
  onSuccess,
  onCancel,
}: {
  resumeId: string;
  onSuccess: (downloadToken: string) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [init, setInit] = useState<InitResult | null>(null);
  const region = guessRegion();
  const trapRef = useFocusTrap<HTMLDivElement>({ onClose: onCancel });

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      setBusy(true);
      setError('');
      try {
        const result = await api.initDownloadCharge(resumeId, region || undefined);
        if (cancelled) return;
        // Subscribers (Student / Pro) get the server-issued download
        // token without going through Razorpay. The init endpoint
        // returns `{ included: true, downloadToken }` for them. Honor
        // it by triggering the success callback immediately so the
        // export proceeds, and skip rendering the payment modal.
        if (result && (result as unknown as { included?: boolean; downloadToken?: string }).included) {
          const token = (result as unknown as { downloadToken?: string }).downloadToken;
          if (token) { onSuccess(token); return; }
        }
        setInit(result);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start payment.');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [resumeId, region]);

  async function handlePay() {
    if (!init) return;
    setBusy(true);
    setError('');
    try {
      if (init.provider === 'razorpay') {
        await loadScript('https://checkout.razorpay.com/v1/checkout.js');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Razorpay = (window as any).Razorpay;
        if (!Razorpay) throw new Error('Razorpay SDK failed to load.');
        await new Promise<void>((resolve, reject) => {
          const rz = new Razorpay({
            key: init.keyId,
            amount: init.amount,
            currency: init.currency,
            // Brand shown in the Razorpay checkout popup — overrides the
            // dashboard billing label, so customers see "Pocket Resume"
            // regardless of the PAN-tied label on an individual account.
            name: 'Pocket Resume',
            description: 'Resume PDF download',
            order_id: init.orderId,
            prefill: { email: getCurrentUserEmail() || undefined },
            handler: async (response: {
              razorpay_order_id: string;
              razorpay_payment_id: string;
              razorpay_signature: string;
            }) => {
              try {
                const verify = await api.verifyDownloadChargeRazorpay({
                  resumeId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                });
                onSuccess(verify.downloadToken);
                resolve();
              } catch (verifyErr: unknown) {
                reject(verifyErr instanceof Error ? verifyErr : new Error('Verification failed.'));
              }
            },
            modal: {
              ondismiss: () => reject(new Error('Payment cancelled.')),
            },
          });
          rz.open();
        });
      } else {
        // Stripe Checkout: redirect and let the success_url bring us back.
        window.location.href = init.checkoutUrl;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setBusy(false);
    }
  }

  const amountLabel =
    init && init.provider === 'razorpay'
      ? `₹${(init.amount / 100).toFixed(2)}`
      : init
        ? `$${(init.amount / 100).toFixed(2)}`
        : '';

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dl-charge-title"
      className="session-warning-overlay"
      onClick={onCancel}
    >
      <div
        className="session-warning-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <h3 id="dl-charge-title" style={{ marginBottom: 8 }}>One-time download fee</h3>
        <p className="small" style={{ color: '#555' }}>
          To cover payment gateway and hosting costs we charge a small fee per download.
          A copy of your resume is also emailed to you automatically.
        </p>
        <p className="small">
          <strong>Amount: {amountLabel || '—'}</strong>
        </p>
        {init && init.provider === 'razorpay' && init.aiFee ? (
          <p className="small" style={{ color: '#8a5a00', marginTop: -4 }}>
            Includes a ₹{(init.aiFee / 100).toFixed(0)} AI fee for the AI help used on this resume.
            Waived with your own AI key or the ₹499/mo plan.
          </p>
        ) : null}
        {error && (
          <p className="small" style={{ color: 'var(--danger, #b91c1c)' }}>
            {error}{' '}
            <span style={{ color: 'var(--muted, #666)' }}>
              Money deducted but stuck? Email{' '}
              <a href={supportMailto('Download payment issue')} style={{ color: 'var(--primary, #4f46e5)' }}>{SUPPORT_EMAIL}</a>{' '}
              with your payment ID — we resolve or refund.
            </span>
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn" onClick={handlePay} disabled={busy || !init}>
            {busy ? 'Please wait…' : `Pay ${amountLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
