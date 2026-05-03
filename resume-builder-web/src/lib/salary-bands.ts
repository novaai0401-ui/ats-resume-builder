/**
 * Salary band hints for Pocket Resume's Pro tier.
 *
 * Approach: a small base table per (role × level) with INR/year p25 /
 * median / p75 figures, multiplied by a city factor. This is the
 * cheapest accurate-enough representation:
 *   • The table is hand-curated from public 2024–2025 reports
 *     (Glassdoor, AmbitionBox, Levels.fyi, Cutshort, instahyre).
 *   • Numbers are rounded to the nearest ₹10K so we don't pretend to
 *     have more precision than we do.
 *   • The `disclaimer` attached to every band says "indicative only" —
 *     legally important for a tool that influences salary negotiations.
 *
 * Future v2:
 *   • Pull live data from a paid source (Levels.fyi API, Compference).
 *   • Filter by company size / sector.
 *   • Bake in equity / bonus splits for senior roles.
 *
 * For v1, hand-rolled data is enough to ship a useful Pro feature this
 * week. If reality drifts (Indian market moves fast) we update the
 * constants and redeploy.
 */

export type SalaryLevel = 'Fresher' | 'Mid' | 'Senior';

export type SalaryBand = {
  role: string;
  level: SalaryLevel;
  city: string;
  /** 25th percentile annual gross compensation, INR. */
  p25: number;
  /** Median (50th percentile). */
  median: number;
  /** 75th percentile. */
  p75: number;
  currency: 'INR';
  disclaimer: string;
};

// Cities are weighted relative to a Bangalore baseline of 1.0. The
// numbers track the IT salary surveys but stay round so we're not
// implying false precision. Remote (India) sits between metros and
// tier-2 because remote-first companies typically anchor near a metro
// median while saving the user the cost-of-living premium.
export const CITY_MULTIPLIERS: Record<string, number> = {
  'Bangalore': 1.00,
  'Hyderabad': 0.95,
  'Mumbai': 0.98,
  'Pune': 0.90,
  'Delhi NCR': 0.93,
  'Chennai': 0.85,
  'Kolkata': 0.75,
  'Ahmedabad': 0.75,
  'Remote (India)': 0.92,
};

export const SALARY_CITIES = Object.keys(CITY_MULTIPLIERS);

// Base salaries are per role × level for a Bangalore baseline. Multiply
// by CITY_MULTIPLIERS[city] to localise. Numbers are 2024–2025 Indian
// market gross compensation for IT-sector roles, including base + on-
// target bonus, before equity. Round numbers chosen for readability.
const BASE_SALARIES: Record<string, Record<SalaryLevel, { p25: number; median: number; p75: number }>> = {
  'Frontend Engineer': {
    Fresher: { p25: 400000, median: 600000, p75: 800000 },
    Mid: { p25: 1200000, median: 1800000, p75: 2500000 },
    Senior: { p25: 2500000, median: 3500000, p75: 5000000 },
  },
  'Backend Engineer': {
    Fresher: { p25: 450000, median: 700000, p75: 900000 },
    Mid: { p25: 1300000, median: 2000000, p75: 2800000 },
    Senior: { p25: 2800000, median: 4000000, p75: 6000000 },
  },
  'Full-Stack Engineer': {
    Fresher: { p25: 450000, median: 650000, p75: 900000 },
    Mid: { p25: 1300000, median: 1900000, p75: 2700000 },
    Senior: { p25: 2700000, median: 3800000, p75: 5500000 },
  },
  'Data Analyst': {
    Fresher: { p25: 400000, median: 550000, p75: 750000 },
    Mid: { p25: 900000, median: 1300000, p75: 1800000 },
    Senior: { p25: 1800000, median: 2500000, p75: 3500000 },
  },
  'Data Engineer': {
    Fresher: { p25: 600000, median: 800000, p75: 1100000 },
    Mid: { p25: 1500000, median: 2200000, p75: 3000000 },
    Senior: { p25: 3000000, median: 4500000, p75: 6500000 },
  },
  'DevOps Engineer': {
    Fresher: { p25: 450000, median: 700000, p75: 900000 },
    Mid: { p25: 1300000, median: 2000000, p75: 2800000 },
    Senior: { p25: 2800000, median: 4000000, p75: 5800000 },
  },
  'AI / ML Engineer': {
    Fresher: { p25: 800000, median: 1200000, p75: 1600000 },
    Mid: { p25: 2000000, median: 3000000, p75: 4500000 },
    Senior: { p25: 4500000, median: 7000000, p75: 11000000 },
  },
  'Product Manager': {
    Fresher: { p25: 700000, median: 1000000, p75: 1400000 },
    Mid: { p25: 1800000, median: 2800000, p75: 4000000 },
    Senior: { p25: 3500000, median: 5500000, p75: 8500000 },
  },
};

export const SALARY_ROLES = Object.keys(BASE_SALARIES);

/**
 * Compute a salary band for a role+level+city, rounded to readable
 * numbers. Returns null when the role isn't covered — caller should
 * render a "we don't have data for this role yet" message.
 */
export function getSalaryBand(role: string, level: SalaryLevel, city: string): SalaryBand | null {
  const base = BASE_SALARIES[role]?.[level];
  if (!base) return null;
  // Default to Bangalore when city is unknown so we never hand back a
  // confidently wrong "₹0" — soft fallback feels better than an error.
  const multiplier = CITY_MULTIPLIERS[city] ?? 1.0;
  const round = (n: number) => Math.round((n * multiplier) / 10000) * 10000;
  return {
    role,
    level,
    city,
    p25: round(base.p25),
    median: round(base.median),
    p75: round(base.p75),
    currency: 'INR',
    disclaimer:
      'Indicative only. Sourced from public 2024–2025 surveys (Glassdoor, AmbitionBox, ' +
      'Levels.fyi). Use as a negotiation reference, not a guarantee — your offer depends ' +
      'on company stage, hiring panel, and your interview.',
  };
}

/** Format an INR amount as "₹4.5 L" / "₹1.2 Cr" for compact display. */
export function formatInr(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}
