export type PlanName = 'FREE' | 'STUDENT' | 'PRO';
export type Currency = 'USD' | 'INR';

export type PlanConfig = {
  aiTokensLimit: number;
  pdfExportsLimit: number;
  atsScansLimit: number;
  resumesLimit: number;
};

export type PlanPricing = PlanConfig & {
  priceUsd: number;
  priceInr: number;
  priceInrWithGst: number;
  gstRate: number;
  gstAmount: number;
  displayPriceInr: string;
  displayPriceUsd: string;
};

const GST_RATE = 0.18; // 18% GST for software services in India

export function getPlanConfig(plan: PlanName): PlanConfig {
  switch (plan) {
    case 'STUDENT':
      return { aiTokensLimit: 40000, pdfExportsLimit: 25, atsScansLimit: 50, resumesLimit: 10 };
    case 'PRO':
      // ₹499/mo plan. AI token allowance sized to stay profitable on Groq:
      // accounting counts INPUT tokens only (chars/4), so real Groq usage
      // (incl. output) is roughly 2x. Groq Llama-3.3-70B blends to ~₹135 per
      // 1M ACCOUNTED tokens. 750k accounted ≈ ~₹100 API cost at the cap
      // (~20% of ₹499) and ~1,000 AI actions/month — generous for one
      // job-seeker, comfortably profitable. Tune via this number if pricing
      // or model changes. (See R-084 calc in REQUIREMENTS decisions log.)
      return { aiTokensLimit: 750000, pdfExportsLimit: 200, atsScansLimit: 300, resumesLimit: 100 };
    case 'FREE':
    default:
      return { aiTokensLimit: 8000, pdfExportsLimit: 5, atsScansLimit: 2, resumesLimit: 2 };
  }
}

export function getPlanPricing(plan: PlanName): PlanPricing {
  const config = getPlanConfig(plan);
  switch (plan) {
    case 'STUDENT': {
      const baseInr = 199;
      const gstAmount = Math.round(baseInr * GST_RATE);
      return {
        ...config,
        priceUsd: 4.99,
        priceInr: baseInr,
        priceInrWithGst: baseInr + gstAmount,
        gstRate: GST_RATE,
        gstAmount,
        displayPriceInr: `₹${baseInr}`,
        displayPriceUsd: '$4.99',
      };
    }
    case 'PRO': {
      const baseInr = 499;
      const gstAmount = Math.round(baseInr * GST_RATE);
      return {
        ...config,
        priceUsd: 9.99,
        priceInr: baseInr,
        priceInrWithGst: baseInr + gstAmount,
        gstRate: GST_RATE,
        gstAmount,
        displayPriceInr: `₹${baseInr}`,
        displayPriceUsd: '$9.99',
      };
    }
    case 'FREE':
    default:
      return {
        ...config,
        priceUsd: 0,
        priceInr: 0,
        priceInrWithGst: 0,
        gstRate: 0,
        gstAmount: 0,
        displayPriceInr: '₹0',
        displayPriceUsd: '$0',
      };
  }
}

/**
 * Detect if the user is likely from India based on locale, timezone, or phone.
 */
export function isIndianUser(params: {
  locale?: string;
  timezone?: string;
  phone?: string;
  countryCode?: string;
}): boolean {
  if (params.countryCode === 'IN') return true;
  if (params.phone?.startsWith('+91')) return true;
  if (params.locale?.toLowerCase().includes('in')) return true;
  if (params.timezone?.includes('Kolkata') || params.timezone?.includes('Calcutta')) return true;
  return false;
}
