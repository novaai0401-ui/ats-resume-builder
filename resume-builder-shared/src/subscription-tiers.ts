/**
 * Subscription tier definitions.
 *
 * The API and web client import these so the billing page, gating checks,
 * and Stripe/Razorpay product sync stay in one place. Keep this file a
 * plain, serializable catalog — no side effects.
 *
 * `limits` mirrors the User model on the API (aiTokensLimit, atsScansLimit,
 * resumesLimit, pdfExportsLimit). `features` is a free-form list the web
 * client uses to render the pricing grid.
 */

export type SubscriptionTierId = 'FREE' | 'PRO' | 'ELITE';

export type SubscriptionTier = {
  id: SubscriptionTierId;
  name: string;
  tagline: string;
  /** Monthly price in USD cents. 0 for the free tier. */
  priceUsdCents: number;
  /** Monthly price in INR paise for Razorpay. */
  priceInrPaise: number;
  highlight?: boolean;
  limits: {
    aiTokens: number;
    atsScans: number;
    resumes: number;
    pdfExports: number;
    quantumQueries: number;
  };
  features: string[];
};

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'FREE',
    name: 'Starter',
    tagline: 'Everything you need to land your first interview.',
    priceUsdCents: 0,
    priceInrPaise: 0,
    limits: {
      aiTokens: 20_000,
      atsScans: 10,
      resumes: 1,
      pdfExports: 5,
      quantumQueries: 3,
    },
    features: [
      '1 resume with ATS-safe templates',
      '10 ATS scans / month',
      '5 PDF exports / month',
      'Basic AI suggestions',
      '3 Quantum Career queries / month',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    tagline: 'For active job seekers tuning multiple applications.',
    priceUsdCents: 999,
    priceInrPaise: 79900,
    highlight: true,
    limits: {
      aiTokens: 200_000,
      atsScans: 100,
      resumes: 10,
      pdfExports: 50,
      quantumQueries: 50,
    },
    features: [
      '10 resumes with all templates',
      '100 ATS scans / month',
      '50 PDF exports / month',
      'Advanced AI critique',
      '50 Quantum Career queries / month',
      'Industry-specific guidance (IT, Healthcare, Sales, etc.)',
      'Interview question generator',
      'Priority email support',
    ],
  },
  {
    id: 'ELITE',
    name: 'Elite',
    tagline: 'For career coaches, recruiters and power users.',
    priceUsdCents: 2499,
    priceInrPaise: 199900,
    limits: {
      aiTokens: 1_000_000,
      atsScans: 1_000,
      resumes: 100,
      pdfExports: 500,
      quantumQueries: 500,
    },
    features: [
      'Unlimited-feel resumes (100 slots)',
      '1,000 ATS scans / month',
      '500 PDF exports / month',
      'Everything in Pro',
      '500 Quantum Career queries / month',
      'Quantum pivot analysis across industries',
      'Team seats (up to 3)',
      '1-on-1 career review session / quarter',
      'Dedicated support',
    ],
  },
];

export function getTier(id: SubscriptionTierId): SubscriptionTier | undefined {
  return SUBSCRIPTION_TIERS.find((t) => t.id === id);
}

export function tierAllowsQuantumQueries(id: SubscriptionTierId): number {
  return getTier(id)?.limits.quantumQueries ?? 0;
}
