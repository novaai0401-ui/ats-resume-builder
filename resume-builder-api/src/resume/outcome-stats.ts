/**
 * Outcome Loop — pure stats math. Given the applications attributed to each
 * resume version, compute response/interview/offer rates and the lift of the
 * top version against a baseline.
 *
 * Design choices:
 *  - "applied" is the denominator. Wishlist entries don't count — they never
 *    saw a recruiter, so they tell us nothing about the resume.
 *  - We need a minimum sample size before claiming a result. With 2
 *    applications, "100% interview rate" is noise. Default MIN_SAMPLE = 5.
 *  - Baseline = the OLDEST version that meets the minimum sample size. The
 *    user is usually comparing newer rewrites against their original; that's
 *    the comparison that matters.
 *  - Lift is reported as a multiplier ("2.4×") AND a delta in percentage
 *    points, so the reader gets both relative and absolute scale.
 */

export interface JobApplicationRow {
  resumeVersionId?: string | null;
  status: string;
  createdAt: Date | string;
}

export interface VersionMeta {
  id: string;
  label?: string | null;
  createdAt: Date | string;
  /** Cached ATS score captured when the snapshot was taken, if any. */
  atsScore?: number | null;
}

export interface VersionStats {
  versionId: string;
  label: string;
  createdAt: string;
  applied: number;
  responses: number;        // any status that progressed past "applied"
  interviews: number;       // phone_screen | interview | offer
  offers: number;
  responseRate: number;     // 0..1
  interviewRate: number;    // 0..1
  offerRate: number;        // 0..1
  /** ATS score snapshot for this version, if captured. */
  atsScore: number | null;
  /** True when applied >= MIN_SAMPLE; below this, rates are noise. */
  significant: boolean;
}

/**
 * Account-wide hero numbers. This is the "callback rate" the whole product
 * is built around — computed across EVERY non-wishlist application for the
 * resume, attributed or not, so the headline number is never undercounted by
 * missing version tags.
 */
export interface OverallStats {
  applied: number;
  responses: number;
  interviews: number;
  offers: number;
  callbackRate: number;     // responses / applied, 0..1 — the hero metric
  interviewRate: number;
  offerRate: number;
  significant: boolean;
}

/**
 * One point on the score-history timeline: ATS score (if snapshotted) plotted
 * alongside the observed callback rate for that version. Lets the UI render
 * "did my score going up actually move my callback rate?" in a single chart.
 */
export interface ScoreHistoryPoint {
  versionId: string;
  label: string;
  createdAt: string;
  atsScore: number | null;
  callbackRate: number | null;  // null when not enough samples to be meaningful
  applied: number;
  significant: boolean;
}

export interface OutcomeReport {
  versions: VersionStats[];
  /** Account-wide hero numbers — the callback rate the brand leads with. */
  overall: OverallStats;
  /** Chronological ATS-score × callback-rate series for the trend chart. */
  scoreHistory: ScoreHistoryPoint[];
  /** Top version by response rate, among those with enough samples. */
  top: VersionStats | null;
  /** Oldest version with enough samples — what we compare against. */
  baseline: VersionStats | null;
  lift: {
    /** top.responseRate / baseline.responseRate ("2.4×"). null if not comparable. */
    multiplier: number | null;
    /** Percentage-point delta on response rate. */
    deltaPoints: number | null;
    headline: string;
  };
  /** Applications with no version attribution. Surfaced so user knows to backfill. */
  unattributed: number;
}

export const MIN_SAMPLE_SIZE = 5;

const RESPONSE_STATUSES = new Set(['phone_screen', 'interview', 'offer', 'rejected']);
const INTERVIEW_STATUSES = new Set(['phone_screen', 'interview', 'offer']);
const OFFER_STATUSES = new Set(['offer']);

export function computeOutcomeReport(
  versions: VersionMeta[],
  applications: JobApplicationRow[],
): OutcomeReport {
  const grouped = new Map<string, JobApplicationRow[]>();
  let unattributed = 0;
  for (const app of applications) {
    if (app.status === 'wishlist') continue;
    const vid = app.resumeVersionId;
    if (!vid) { unattributed += 1; continue; }
    if (!grouped.has(vid)) grouped.set(vid, []);
    grouped.get(vid)!.push(app);
  }

  const versionStats: VersionStats[] = versions.map((v) => {
    const apps = grouped.get(v.id) || [];
    return buildVersionStats(v, apps);
  });

  // Versions that exist on JobApplication rows but aren't in the versions list
  // (e.g. snapshot was deleted) — still count their samples under a synthetic
  // entry so the numbers reconcile.
  for (const [vid, apps] of grouped) {
    if (!versions.some((v) => v.id === vid)) {
      versionStats.push(buildVersionStats({ id: vid, label: '(deleted snapshot)', createdAt: new Date(0) }, apps));
    }
  }

  // Account-wide hero numbers: count EVERY non-wishlist application, whether
  // or not it carries a version tag. The callback rate is the headline metric
  // for the whole product, so it must reflect the user's real funnel — not
  // just the slice they remembered to attribute.
  const overall = buildOverallStats(applications);

  versionStats.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const significant = versionStats.filter((v) => v.significant);
  const top = significant.length > 0
    ? [...significant].sort((a, b) => b.responseRate - a.responseRate)[0]
    : null;
  const baseline = significant.length >= 2
    ? [...significant].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0]
    : null;

  let multiplier: number | null = null;
  let deltaPoints: number | null = null;
  let headline = 'Not enough data yet — log applications against each version to compare.';
  if (top && baseline && top.versionId !== baseline.versionId) {
    deltaPoints = (top.responseRate - baseline.responseRate) * 100;
    if (baseline.responseRate > 0) {
      multiplier = top.responseRate / baseline.responseRate;
    }
    const baselineLabel = baseline.label || 'baseline';
    const topLabel = top.label || 'top version';
    if (multiplier && multiplier >= 1.1) {
      headline = `${topLabel} got ${multiplier.toFixed(1)}× more replies than ${baselineLabel} (${deltaPoints.toFixed(0)}pp).`;
    } else if (multiplier && multiplier <= 0.9) {
      headline = `${topLabel} is underperforming ${baselineLabel} by ${(1 / multiplier).toFixed(1)}×.`;
    } else {
      headline = `${topLabel} and ${baselineLabel} perform within noise of each other.`;
    }
  } else if (top && !baseline) {
    headline = `${top.label || 'Top version'} responds at ${(top.responseRate * 100).toFixed(0)}%. Need a second version with ≥${MIN_SAMPLE_SIZE} applications to compare.`;
  }

  // Score history: chronological (oldest → newest) so the chart reads left to
  // right like a timeline. Only real (non-synthetic) versions carry an ATS
  // score, so deleted-snapshot rows fall out naturally — they have no atsScore
  // and no chronological anchor.
  const scoreHistory: ScoreHistoryPoint[] = [...versionStats]
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .map((v) => ({
      versionId: v.versionId,
      label: v.label,
      createdAt: v.createdAt,
      atsScore: v.atsScore,
      callbackRate: v.significant ? v.responseRate : null,
      applied: v.applied,
      significant: v.significant,
    }));

  return {
    versions: versionStats,
    overall,
    scoreHistory,
    top,
    baseline,
    lift: { multiplier, deltaPoints, headline },
    unattributed,
  };
}

function buildOverallStats(applications: JobApplicationRow[]): OverallStats {
  let applied = 0;
  let responses = 0;
  let interviews = 0;
  let offers = 0;
  for (const a of applications) {
    if (a.status === 'wishlist') continue;
    applied += 1;
    if (RESPONSE_STATUSES.has(a.status)) responses += 1;
    if (INTERVIEW_STATUSES.has(a.status)) interviews += 1;
    if (OFFER_STATUSES.has(a.status)) offers += 1;
  }
  return {
    applied,
    responses,
    interviews,
    offers,
    callbackRate: applied ? responses / applied : 0,
    interviewRate: applied ? interviews / applied : 0,
    offerRate: applied ? offers / applied : 0,
    significant: applied >= MIN_SAMPLE_SIZE,
  };
}

function buildVersionStats(v: VersionMeta, apps: JobApplicationRow[]): VersionStats {
  const applied = apps.length;
  let responses = 0;
  let interviews = 0;
  let offers = 0;
  for (const a of apps) {
    if (RESPONSE_STATUSES.has(a.status)) responses += 1;
    if (INTERVIEW_STATUSES.has(a.status)) interviews += 1;
    if (OFFER_STATUSES.has(a.status)) offers += 1;
  }
  return {
    versionId: v.id,
    label: v.label || dateLabel(v.createdAt),
    createdAt: new Date(v.createdAt).toISOString(),
    applied,
    responses,
    interviews,
    offers,
    responseRate: applied ? responses / applied : 0,
    interviewRate: applied ? interviews / applied : 0,
    offerRate: applied ? offers / applied : 0,
    atsScore: typeof v.atsScore === 'number' ? v.atsScore : null,
    significant: applied >= MIN_SAMPLE_SIZE,
  };
}

function dateLabel(d: Date | string): string {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return 'version';
  }
}
