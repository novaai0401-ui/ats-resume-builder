import Link from 'next/link';
import type { Metadata } from 'next';
import {
  TrustCard,
  TrustChecklist,
  TrustHero,
  TrustPageShell,
} from '@/src/components/TrustPage';

export const metadata: Metadata = {
  title: 'Pricing — CallbackCV',
  description:
    'CallbackCV pricing, no surprises: build and edit free forever, ₹49 per clean download, ' +
    'or CallbackCV Plus at ₹499/month for unlimited AI and free downloads. UPI, cards, netbanking via Razorpay.',
  alternates: { canonical: '/pricing' },
};

// R-089 — public pricing page. The critique (and the wider market research)
// found "free to build, pay to download" is the most-resented dark pattern in
// this category WHEN the price is hidden until export. Our defence is total
// upfront transparency: every number a user will ever be asked for, on one
// public page, before they invest an hour building. Keep this page in sync
// with billing copy (C-003).
//
// Premium redesign is PRESENTATION ONLY — every claim, price and feature line
// below is preserved verbatim from the original page for exactly that reason.
const TIERS = [
  {
    name: 'Free',
    price: '₹0',
    cadence: 'forever',
    highlight: false,
    features: [
      'Unlimited resume creation and editing',
      'All ATS-safe templates',
      'ATS score + recruiter-view simulator',
      '10 AI actions per day on the resume editor (our AI)',
      'Job application tracker + outcome tracking',
      'Watermarked preview and print',
    ],
    cta: { label: 'Start free', href: '/resume/start' },
  },
  {
    name: 'Pay per download',
    price: '₹49',
    cadence: 'per download',
    highlight: false,
    features: [
      'Everything in Free',
      'Clean PDF or Word export (no watermark)',
      'Pay only when you actually need the file',
      'UPI, cards, netbanking via Razorpay',
      'No subscription, no auto-renewal',
    ],
    cta: { label: 'Build first, pay at download', href: '/resume/start' },
  },
  {
    name: 'CallbackCV Plus',
    price: '₹499',
    cadence: 'per month · cancel anytime',
    highlight: true,
    features: [
      'One plan, the same for everyone',
      'Unlimited AI on every feature (critique, tailor, mentor, interview prep…)',
      'Free, unlimited downloads — no ₹49 charges',
      'Priority support',
    ],
    cta: { label: 'Get Plus', href: '/billing' },
  },
];

export default function PricingPage() {
  return (
    <TrustPageShell>
      <TrustHero eyebrow="Pricing" title="Simple pricing," accent="shown before you build">
        Building and editing is free forever. You only ever pay for two things: a clean download
        (₹49) or the everything-AI plan (₹499/month). That&rsquo;s the whole list.
      </TrustHero>

      <div className="price-grid" aria-label="Plans">
        {TIERS.map((tier) => (
          <article key={tier.name} className={`price-card${tier.highlight ? ' price-card--featured' : ''}`}>
            {tier.highlight ? <span className="price-card__ribbon">Most popular</span> : null}
            <h2 className="price-card__name">{tier.name}</h2>
            <p className="price-card__price">
              {tier.price}
              <span className="price-card__cadence"> {tier.cadence}</span>
            </p>
            <ul className="price-card__features">
              {tier.features.map((f) => (
                <li key={f}>
                  <span className="price-card__tick" aria-hidden="true">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link className={tier.highlight ? 'btn price-card__cta' : 'btn secondary price-card__cta'} href={tier.cta.href}>
              {tier.cta.label}
            </Link>
          </article>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <TrustCard icon="₹" title="The fine print, in plain words" wide>
          <TrustChecklist
            items={[
              { ok: true, text: <><strong>No hidden charges.</strong> You will never hit a surprise paywall at export — this page is the entire price list.</> },
              { ok: true, text: <><strong>Bring your own AI key (free).</strong> Plug in your own Groq/OpenAI/Anthropic key in Settings and the AI features run on it at no charge from us.</> },
              { ok: true, text: <><strong>Cancel anytime.</strong> Plus is month-to-month via Razorpay; cancelling keeps your account and resumes on the Free tier.</> },
              { ok: true, text: <><strong>Referrals.</strong> Each friend who signs up earns you a free download.</> },
            ]}
          />
        </TrustCard>
      </div>
    </TrustPageShell>
  );
}
