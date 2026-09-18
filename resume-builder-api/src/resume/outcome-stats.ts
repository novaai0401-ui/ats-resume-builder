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
  /** R-109 — when the user actually applied, so a rate has a window. */
  appliedAt?: Date | string | null;
  /** R-109 — self-reported | email-inferred | verified. Null = self-reported. */
  outcomeSource?: string | null;
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
  /** Any reply at all, INCLUDING a rejection. */
  responses: number;
  /** Explicit rejections. Broken out because a reply is not a result. */
  rejections: number;
  /**
   * R-109 — replies that went the user's way: phone_screen | interview |
   * offer. This is the number that should decide which resume to reuse.
   * `responses` counts rejections as replies, which is defensible for an
   * "did anyone answer" metric and useless for "which resume works".
   */
  positiveCallbacks: number;
  interviews: number;       // phone_screen | interview | offer
  offers: number;
  responseRate: number;     // 0..1, rejections included
  positiveCallbackRate: number; // 0..1, rejections excluded
  interviewRate: number;    // 0..1
  offerRate: number;        // 0..1
  /** Observation window for these applications, so a rate has a period. */
  firstAppliedAt: string | null;
  lastAppliedAt: string | null;
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
  /** Any reply, rejections included. */
  responses: number;
  rejections: number;
  /** Replies that were not rejections — the hero metric. */
  positiveCallbacks: number;
  interviews: number;
  offers: number;
  callbackRate: number;     // positiveCallbacks / applied, 0..1 — the hero metric
  replyRate: number;        // responses / applied, rejections included
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
  /**
   * R-109 — how the outcomes behind these numbers were established.
   * Shown so a reader can weigh them: almost everything here is the user
   * telling us what happened, which is useful and is not proof.
   */
  provenance: {
    selfReported: number;
    emailInferred: number;
    verified: number;
  };
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

  // R-109 — count provenance across the same rows the rates are built
  // from. Null predates the column and is self-reported by definition.
  const provenance = { selfReported: 0, emailInferred: 0, verified: 0 };
  for (const app of applications) {
    if (app.status === 'wishlist') continue;
    if (app.outcomeSource === 'verified') provenance.verified += 1;
    else if (app.outcomeSource === 'email-inferred') provenance.emailInferred += 1;
    else provenance.selfReported += 1;
  }

  versionStats.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const significant = versionStats.filter((v) => v.significant);
  // R-109 — rank on POSITIVE callbacks, not on any-reply.
  //
  // This used to sort by responseRate, which counts rejections as
  // replies: a version with five rejections outranked one with an
  // interview and four still pending, and the product then told the user
  // to reuse the version that was getting them rejected. Ties break on
  // offers, then interviews, then any-reply — a real result outranks a
  // conversation.
  const top = significant.length > 0
    ? [...significant].sort(
        (a, b) =>
          b.positiveCallbackRate - a.positiveCallbackRate ||
          b.offerRate - a.offerRate ||
          b.interviewRate - a.interviewRate ||
          b.responseRate - a.responseRate,
      )[0]
    : null;
  const baseline = significant.length >= 2
    ? [...significant].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0]
    : null;

  let multiplier: number | null = null;
  let deltaPoints: number | null = null;
  let headline = 'Not enough data yet — log applications against each version to compare.';
  if (top && baseline && top.versionId !== baseline.versionId) {
    // Compared on positive callbacks, and stated with the denominators —
    // "2.4× more replies" off 5 applications reads like proof and is not.
    deltaPoints = (top.positiveCallbackRate - baseline.positiveCallbackRate) * 100;
    if (baseline.positiveCallbackRate > 0) {
      multiplier = top.positiveCallbackRate / baseline.positiveCallbackRate;
    }
    const baselineLabel = baseline.label || 'baseline';
    const topLabel = top.label || 'top version';
    const counts = `${top.positiveCallbacks}/${top.applied} vs ${baseline.positiveCallbacks}/${baseline.applied}`;
    // Judge on percentage points, not on the multiplier. A baseline of
    // zero callbacks makes the ratio undefined, and the previous shape
    // (`multiplier && multiplier >= 1.1`) fell through to "within noise"
    // for 3/5 vs 0/5 — the single most decisive comparison the product
    // can show, reported as no difference.
    const MEANINGFUL_PP = 10;
    if (deltaPoints >= MEANINGFUL_PP) {
      const ratio = multiplier ? `${multiplier.toFixed(1)}× more callbacks` : 'callbacks where the other got none';
      headline = `${topLabel} got ${ratio} than ${baselineLabel} (${counts}). Small samples move around — treat this as a hint, not proof.`;
    } else if (deltaPoints <= -MEANINGFUL_PP) {
      headline = `${topLabel} is getting fewer callbacks than ${baselineLabel} (${counts}).`;
    } else {
      headline = `${topLabel} and ${baselineLabel} are within noise of each other (${counts}).`;
    }
  } else if (top && !baseline) {
    headline = `${top.label || 'Top version'}: ${top.positiveCallbacks} callback${top.positiveCallbacks === 1 ? '' : 's'} from ${top.applied} applications. Need a second version with ≥${MIN_SAMPLE_SIZE} applications to compare.`;
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
    provenance,
  };
}

function buildOverallStats(applications: JobApplicationRow[]): OverallStats {
  let applied = 0;
  let responses = 0;
  let rejections = 0;
  let interviews = 0;
  let offers = 0;
  for (const a of applications) {
    if (a.status === 'wishlist') continue;
    applied += 1;
    if (RESPONSE_STATUSES.has(a.status)) responses += 1;
    if (a.status === 'rejected') rejections += 1;
    if (INTERVIEW_STATUSES.has(a.status)) interviews += 1;
    if (OFFER_STATUSES.has(a.status)) offers += 1;
  }
  const positiveCallbacks = responses - rejections;
  return {
    applied,
    responses,
    rejections,
    positiveCallbacks,
    interviews,
    offers,
    // R-109 — `callbackRate` is the hero number on the dashboard, under
    // the words "Your callback rate". It used to be responses/applied,
    // which counts rejections: a user with five rejections was shown a
    // 100% callback rate. A rejection is a reply, not a callback.
    callbackRate: applied ? positiveCallbacks / applied : 0,
    replyRate: applied ? responses / applied : 0,
    interviewRate: applied ? interviews / applied : 0,
    offerRate: applied ? offers / applied : 0,
    significant: applied >= MIN_SAMPLE_SIZE,
  };
}

function buildVersionStats(v: VersionMeta, apps: JobApplicationRow[]): VersionStats {
  const applied = apps.length;
  let responses = 0;
  let rejections = 0;
  let interviews = 0;
  let offers = 0;
  let first: number | null = null;
  let last: number | null = null;
  for (const a of apps) {
    if (RESPONSE_STATUSES.has(a.status)) responses += 1;
    if (a.status === 'rejected') rejections += 1;
    if (INTERVIEW_STATUSES.has(a.status)) interviews += 1;
    if (OFFER_STATUSES.has(a.status)) offers += 1;
    const when = a.appliedAt ? +new Date(a.appliedAt) : null;
    if (when && Number.isFinite(when)) {
      if (first === null || when < first) first = when;
      if (last === null || when > last) last = when;
    }
  }
  // Positive callbacks are replies minus rejections. INTERVIEW_STATUSES
  // already excludes 'rejected', so they coincide today; computing it by
  // subtraction keeps them equal if a new positive status is added.
  const positiveCallbacks = responses - rejections;
  return {
    versionId: v.id,
    label: v.label || dateLabel(v.createdAt),
    createdAt: new Date(v.createdAt).toISOString(),
    applied,
    responses,
    rejections,
    positiveCallbacks,
    interviews,
    offers,
    responseRate: applied ? responses / applied : 0,
    positiveCallbackRate: applied ? positiveCallbacks / applied : 0,
    interviewRate: applied ? interviews / applied : 0,
    offerRate: applied ? offers / applied : 0,
    firstAppliedAt: first ? new Date(first).toISOString() : null,
    lastAppliedAt: last ? new Date(last).toISOString() : null,
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
