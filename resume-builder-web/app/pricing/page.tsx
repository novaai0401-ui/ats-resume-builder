'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TkxAlert,
  TkxButton,
  TkxCard,
  TkxCardBody,
  TkxCardHeader,
  TkxSkeleton,
} from 'tekivex-ui';
import { api } from '@/src/lib/api';
import { getAccessToken } from '@/src/lib/api';

type Tier = Awaited<ReturnType<typeof api.getSubscriptionTiers>>['tiers'][number];

export default function PricingPage() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSubscriptionTiers();
        setTiers(res.tiers);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load pricing.');
      }
    })();
  }, []);

  return (
    <main>
      <section className="hero">
        <h1>Pricing</h1>
        <p className="small">
          Choose a plan that fits how actively you&apos;re applying. Every plan ships with
          ATS-safe templates and the Quantum Career Navigator.
        </p>
      </section>

      {error ? <TkxAlert variant="danger">{error}</TkxAlert> : null}

      {!tiers && !error ? (
        <div className="grid">
          <TkxSkeleton height={320} className="col-4" />
          <TkxSkeleton height={320} className="col-4" />
          <TkxSkeleton height={320} className="col-4" />
        </div>
      ) : null}

      {tiers ? (
        <div className="grid pricing-grid">
          {tiers.map((tier) => (
            <TkxCard
              key={tier.id}
              className={`col-4 pricing-card${tier.highlight ? ' pricing-card--highlight' : ''}`}
              padding="md"
            >
              <TkxCardHeader>
                <h3 style={{ margin: 0 }}>{tier.name}</h3>
                <p className="small" style={{ margin: 0 }}>{tier.tagline}</p>
              </TkxCardHeader>
              <TkxCardBody>
                <p className="pricing-price">
                  {tier.priceUsdCents === 0 ? (
                    <>Free</>
                  ) : (
                    <>
                      <strong>${(tier.priceUsdCents / 100).toFixed(2)}</strong>
                      <span className="small"> / month</span>
                    </>
                  )}
                </p>
                <ul className="pricing-features">
                  {tier.features.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 16 }}>
                  <UpgradeButton tierId={tier.id} highlight={tier.highlight} />
                </div>
              </TkxCardBody>
            </TkxCard>
          ))}
        </div>
      ) : null}

      <p className="small" style={{ marginTop: 24, textAlign: 'center' }}>
        Billing is handled by Stripe (USD) or Razorpay (INR). You can cancel from the{' '}
        <Link href="/billing">billing portal</Link> at any time.
      </p>
    </main>
  );
}

function UpgradeButton({ tierId, highlight }: { tierId: Tier['id']; highlight?: boolean }) {
  if (tierId === 'FREE') {
    return (
      <Link href="/auth/register" className="btn secondary" style={{ width: '100%', textAlign: 'center' }}>
        Start free
      </Link>
    );
  }
  const authed = typeof window !== 'undefined' && Boolean(getAccessToken());
  const href = authed ? `/billing?plan=${tierId}` : `/auth/register?next=/billing?plan=${tierId}`;
  return (
    <Link href={href} style={{ display: 'block' }}>
      <TkxButton
        type="button"
        variant={highlight ? 'solid' : 'outline'}
        colorScheme="primary"
        isFullWidth
      >
        {authed ? `Upgrade to ${tierId}` : `Sign up for ${tierId}`}
      </TkxButton>
    </Link>
  );
}
