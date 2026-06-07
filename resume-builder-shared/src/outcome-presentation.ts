/**
 * Shared presentation logic for the Outcome Loop's callback rate and the
 * Recruiter-AI Simulator's verdict. Lives in the shared package so the web,
 * mobile, and browser-extension clients render the SAME labels, colors, and
 * thresholds — that's what "parity" means here, not three copies that drift.
 *
 * Pure + dependency-free so it unit-tests cleanly and runs in any client.
 */

export type RecruiterVerdict = 'advance' | 'maybe' | 'reject';

export interface VerdictPresentation {
  label: string;
  /** Hex color for the verdict chip / accent. */
  color: string;
  /** Translucent background for the chip. */
  background: string;
  /** One-line plain-language explanation. */
  blurb: string;
}

const VERDICT_PRESENTATION: Record<RecruiterVerdict, VerdictPresentation> = {
  advance: {
    label: 'Advance',
    color: '#147a3a',
    background: 'rgba(22,163,74,0.12)',
    blurb: 'The AI screen would forward you to a human.',
  },
  maybe: {
    label: 'Borderline',
    color: '#b07906',
    background: 'rgba(176,121,6,0.12)',
    blurb: 'On the fence — a recruiter would have to take a closer look.',
  },
  reject: {
    label: 'Reject',
    color: '#a8412c',
    background: 'rgba(168,65,44,0.12)',
    blurb: 'The AI screen would likely filter you out for this role.',
  },
};

/** Look up the display treatment for a verdict, defaulting safely to "maybe". */
export function presentVerdict(verdict: string): VerdictPresentation {
  return VERDICT_PRESENTATION[verdict as RecruiterVerdict] ?? VERDICT_PRESENTATION.maybe;
}

/** Minimum applications before a callback rate is treated as meaningful. */
export const CALLBACK_MIN_SAMPLE = 5;

/**
 * Format a callback rate for display. Returns "—" until there are enough
 * samples, matching the honesty rule used by the Outcome Loop everywhere.
 *
 * @param rate     0..1 fraction (responses / applications)
 * @param applied  total applications, used for the significance gate
 */
export function formatCallbackRate(rate: number, applied: number): string {
  if (!Number.isFinite(rate) || applied < CALLBACK_MIN_SAMPLE) return '—';
  const pct = Math.round(Math.max(0, Math.min(1, rate)) * 100);
  return `${pct}%`;
}

/** Color-code a callback rate for at-a-glance reading (red → amber → green). */
export function callbackRateColor(rate: number, applied: number): string {
  if (!Number.isFinite(rate) || applied < CALLBACK_MIN_SAMPLE) return '#7a8aa0';
  const pct = rate * 100;
  if (pct >= 20) return '#147a3a';
  if (pct >= 8) return '#b07906';
  return '#a8412c';
}
