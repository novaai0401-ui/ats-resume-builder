import type { OutcomeVersionStats } from './api';

/**
 * A/B insight over resume versions (premium analytics headline):
 * "Version X gets 2.4× more replies than Version Y."
 *
 * Honesty rules (this is the trust layer — C-003):
 *  - Only versions with a SIGNIFICANT sample (server marks >= 5 applications)
 *    may participate. A bucket-of-one never makes a confident claim.
 *  - Needs at least two significant versions AND a comparison version with a
 *    non-zero response rate — otherwise return null and the UI shows the
 *    "keep logging" guidance instead of a fabricated multiplier.
 *  - The multiplier is rounded to one decimal; a ratio under 1.15× is
 *    reported as "about the same" rather than a fake edge.
 */

export type AbInsight = {
  best: OutcomeVersionStats;
  baseline: OutcomeVersionStats;
  /** responseRate(best) / responseRate(baseline), 1 decimal. */
  multiplier: number;
  /** True when the difference is too small to celebrate (< 1.15×). */
  aboutTheSame: boolean;
};

export function computeAbInsight(versions: OutcomeVersionStats[]): AbInsight | null {
  const significant = (versions || []).filter((v) => v && v.significant && v.applied > 0);
  if (significant.length < 2) return null;

  const sorted = [...significant].sort((a, b) => b.responseRate - a.responseRate);
  const best = sorted[0];
  // Baseline = the strongest OTHER version with a non-zero rate; comparing
  // against an all-zero version would print a meaningless "Infinity×".
  const baseline = sorted.slice(1).find((v) => v.responseRate > 0) || null;
  if (!baseline || best.responseRate <= 0) return null;

  const raw = best.responseRate / baseline.responseRate;
  const multiplier = Math.round(raw * 10) / 10;
  return {
    best,
    baseline,
    multiplier,
    aboutTheSame: raw < 1.15,
  };
}

/** Bar rows for the per-version response-rate comparison (magnitude job). */
export type AbBarRow = {
  versionId: string;
  label: string;
  applied: number;
  /** 0..1 */
  responseRate: number;
  /** 0..100 relative width against the best rate. */
  widthPct: number;
  significant: boolean;
};

export function buildAbBars(versions: OutcomeVersionStats[], maxRows = 6): AbBarRow[] {
  const rows = (versions || [])
    .filter((v) => v && v.applied > 0)
    .sort((a, b) => b.responseRate - a.responseRate)
    .slice(0, maxRows);
  const top = rows.length ? Math.max(...rows.map((r) => r.responseRate)) : 0;
  return rows.map((v) => ({
    versionId: v.versionId,
    label: v.label || 'Untitled version',
    applied: v.applied,
    responseRate: v.responseRate,
    widthPct: top > 0 ? Math.max(4, Math.round((v.responseRate / top) * 100)) : 4,
    significant: v.significant,
  }));
}
