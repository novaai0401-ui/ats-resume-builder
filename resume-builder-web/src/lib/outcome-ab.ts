import type { OutcomeVersionStats } from './api';

/**
 * A/B insight over resume versions (premium analytics headline):
 * "Version X gets 2.4× more replies than Version Y."
 *
 * Honesty rules (this is the trust layer — C-003):
 *  - Only versions with a SIGNIFICANT sample (server marks >= 5 applications)
 *    may participate. A bucket-of-one never makes a confident claim.
 *  - Needs at least two significant versions. R-109: a comparison version
 *    with ZERO callbacks no longer returns null — that suppressed the most
 *    decisive comparison the product can make ("3 callbacks vs 0"). The
 *    multiplier is null in that case and the UI states the counts instead
 *    of a ratio, which is the honest way to say it.
 *  - The multiplier is rounded to one decimal; a ratio under 1.15× is
 *    reported as "about the same" rather than a fake edge.
 */

export type AbInsight = {
  best: OutcomeVersionStats;
  baseline: OutcomeVersionStats;
  /**
   * callbackRate(best) / callbackRate(baseline), 1 decimal (R-109).
   * Null when the baseline got zero callbacks — the ratio is undefined,
   * not infinite, and the UI must show counts rather than invent one.
   */
  multiplier: number | null;
  /** True when the difference is too small to celebrate (< 1.15×). */
  aboutTheSame: boolean;
};

export function computeAbInsight(versions: OutcomeVersionStats[]): AbInsight | null {
  const significant = (versions || []).filter((v) => v && v.significant && v.applied > 0);
  if (significant.length < 2) return null;

  // R-109 — rank on POSITIVE callbacks. Sorting by responseRate counts
  // rejections as wins, so the card could name an all-rejected version
  // the one to reuse.
  const sorted = [...significant].sort((a, b) => b.positiveCallbackRate - a.positiveCallbackRate);
  const best = sorted[0];
  // Baseline = the strongest OTHER version with a non-zero rate; comparing
  // against an all-zero version would print a meaningless "Infinity×".
  // Prefer a baseline that actually got callbacks; fall back to the next
  // best version so a zero-callback comparison is still shown, stated as
  // counts rather than as a ratio.
  const baseline = sorted.slice(1).find((v) => v.positiveCallbackRate > 0) || sorted[1] || null;
  if (!baseline || best.positiveCallbackRate <= 0) return null;

  const raw = baseline.positiveCallbackRate > 0
    ? best.positiveCallbackRate / baseline.positiveCallbackRate
    : null;
  return {
    best,
    baseline,
    multiplier: raw === null ? null : Math.round(raw * 10) / 10,
    aboutTheSame: raw !== null && raw < 1.15,
  };
}

/** Bar rows for the per-version callback-rate comparison (magnitude job). */
export type AbBarRow = {
  versionId: string;
  label: string;
  applied: number;
  /** R-109 — 0..1 positive callbacks, rejections excluded. */
  callbackRate: number;
  /** 0..1 any reply, rejections included. Shown as context, never ranked on. */
  responseRate: number;
  /** 0..100 relative width against the best rate. */
  widthPct: number;
  significant: boolean;
};

export function buildAbBars(versions: OutcomeVersionStats[], maxRows = 6): AbBarRow[] {
  const rows = (versions || [])
    .filter((v) => v && v.applied > 0)
    .sort((a, b) => b.positiveCallbackRate - a.positiveCallbackRate)
    .slice(0, maxRows);
  const top = rows.length ? Math.max(...rows.map((r) => r.positiveCallbackRate)) : 0;
  return rows.map((v) => ({
    versionId: v.versionId,
    label: v.label || 'Untitled version',
    applied: v.applied,
    callbackRate: v.positiveCallbackRate,
    responseRate: v.responseRate,
    widthPct: top > 0 ? Math.max(4, Math.round((v.positiveCallbackRate / top) * 100)) : 4,
    significant: v.significant,
  }));
}
