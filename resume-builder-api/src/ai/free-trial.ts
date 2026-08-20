import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * R-098 — "one free run per AI feature" trial.
 *
 * Product rule (founder call): a FREE user may run EVERY AI feature exactly
 * ONCE on our key. That first run is the real thing — same model, same
 * output as a paying user gets — so the value is felt, not described. The
 * second attempt at the SAME feature is refused with a popup that lists
 * which other features are still unused. When all of them are spent, the
 * only remaining path is the plan (or the user's own AI key).
 *
 * Exemptions (never counted, never blocked):
 *   • BYOK — the user is spending their own key.
 *   • Active plan (₹499/mo) — already paid.
 *
 * C-004: no silent bypass. Every refusal is a typed ForbiddenException whose
 * body carries a machine-readable `code` plus the full feature ledger, so the
 * web/mobile clients can render the "you've used this one" modal without
 * string-matching a sentence.
 *
 * The ledger lives in its own table (`AiFeatureTrial`, unique on
 * userId+feature) rather than the day-bucket `AiCritiqueLog` used by R-086:
 * this cap is LIFETIME and per-feature, so it needs a different key.
 */

/** Stable identifiers for every AI feature that participates in the trial. */
export type AiFeatureKey =
  // NOTE: 'bullet-rewrite' is a valid key but deliberately absent from
  // AI_TRIAL_FEATURES below — rewriting bullets is how a resume gets built,
  // so it is never metered per-feature (R-103). It appears here only so the
  // resume-bound call sites can name themselves.
  | 'bullet-rewrite'
  | 'ats-critique'
  | 'jd-match'
  | 'tech-gap'
  | 'tailor'
  | 'linkedin-optimize'
  | 'cover-letter'
  | 'interview-prep'
  | 'mock-interview'
  | 'mentor-chat'
  | 'profile-copilot'
  | 'recruiter-sim'
  | 'skill-demand';

export type AiFeatureDescriptor = {
  key: AiFeatureKey;
  /** Human label — reused verbatim by the client modal, so it must match the UI. */
  label: string;
  /** One line describing what the free run gives you. */
  blurb: string;
  /** Where the user goes to spend this free run. */
  href: string;
};

/**
 * The catalogue the popup renders. Ordered by how useful the free run is to
 * a job-seeker mid-application: the JD skill-gap flow first, because that's
 * the task people arrive with ("here's the job, what am I missing?").
 */
export const AI_TRIAL_FEATURES: AiFeatureDescriptor[] = [
  {
    key: 'jd-match',
    label: 'Job-description skill gap',
    blurb: 'Paste a JD — see the skills you already cover and the ones you are missing.',
    href: '/jd-match',
  },
  {
    key: 'tailor',
    label: 'Tailor resume to a job',
    blurb: 'Rewrite your resume against one specific job description.',
    href: '/jd-match',
  },
  {
    key: 'ats-critique',
    label: 'AI resume critique',
    blurb: 'A line-by-line ATS critique of your resume.',
    href: '/resume/ats',
  },
  {
    key: 'tech-gap',
    label: 'Tech gap analysis',
    blurb: 'The skills your target role expects that your resume does not show.',
    href: '/career',
  },
  {
    key: 'cover-letter',
    label: 'Cover letter generator',
    blurb: 'A cover letter drafted from your resume and the job description.',
    href: '/cover-letter',
  },
  {
    key: 'linkedin-optimize',
    label: 'LinkedIn profile optimizer',
    blurb: 'A section-by-section scorecard and rewrites for your LinkedIn profile.',
    href: '/linkedin',
  },
  {
    key: 'interview-prep',
    label: 'Interview prep',
    blurb: 'Likely questions for this role, grounded in your resume.',
    href: '/interview-prep',
  },
  {
    key: 'mock-interview',
    label: 'Mock interview',
    blurb: 'The AI plays the interviewer for your target role.',
    href: '/interview-prep',
  },
  {
    key: 'recruiter-sim',
    label: 'Recruiter simulator',
    blurb: 'See your resume the way a recruiter screens it in six seconds.',
    href: '/recruiter-sim',
  },
  {
    key: 'mentor-chat',
    label: 'Career mentor chat',
    blurb: 'Ask a career question with your resume as context.',
    href: '/mentor',
  },
  {
    key: 'skill-demand',
    label: 'Skill demand analysis',
    blurb: 'Which of your skills are actually in demand right now.',
    href: '/skill-demand',
  },
];

const FEATURE_BY_KEY = new Map<AiFeatureKey, AiFeatureDescriptor>(
  AI_TRIAL_FEATURES.map((feature) => [feature.key, feature]),
);

export const FREE_TRIAL_FEATURE_USED_CODE = 'FREE_TRIAL_FEATURE_USED';
export const FREE_TRIAL_EXHAUSTED_CODE = 'FREE_TRIAL_EXHAUSTED';

export type FreeTrialFeatureStatus = AiFeatureDescriptor & {
  used: boolean;
  usedAt: string | null;
};

export type FreeTrialStatus = {
  /** false for BYOK/plan users — the client hides the trial UI entirely. */
  trialApplies: boolean;
  features: FreeTrialFeatureStatus[];
  usedCount: number;
  totalCount: number;
  remainingCount: number;
  /** true once every feature's single free run is spent. */
  exhausted: boolean;
};

function descriptorFor(feature: AiFeatureKey): AiFeatureDescriptor {
  return (
    FEATURE_BY_KEY.get(feature) || {
      key: feature,
      label: feature,
      blurb: '',
      href: '/pricing',
    }
  );
}

async function usedKeys(prisma: PrismaService, userId: string): Promise<Map<AiFeatureKey, Date>> {
  const rows = await prisma.aiFeatureTrial.findMany({
    where: { userId },
    select: { feature: true, usedAt: true },
  });
  const map = new Map<AiFeatureKey, Date>();
  for (const row of rows) map.set(row.feature as AiFeatureKey, row.usedAt);
  return map;
}

/**
 * The whole ledger for one user. `trialApplies` is false when the user is on
 * a plan (or the caller knows they are BYOK) — those users are never counted,
 * so showing them a trial ledger would be a lie (C-003).
 */
export async function getFreeTrialStatus(
  prisma: PrismaService,
  userId: string,
  options: { trialApplies?: boolean } = {},
): Promise<FreeTrialStatus> {
  const used = await usedKeys(prisma, userId);
  const features = AI_TRIAL_FEATURES.map((feature) => ({
    ...feature,
    used: used.has(feature.key),
    usedAt: used.get(feature.key)?.toISOString() ?? null,
  }));
  const usedCount = features.filter((f) => f.used).length;
  return {
    trialApplies: options.trialApplies ?? true,
    features,
    usedCount,
    totalCount: features.length,
    remainingCount: features.length - usedCount,
    exhausted: usedCount >= features.length,
  };
}

/** Has this user still got their one free run of `feature`? */
export async function isFreeTrialAvailable(
  prisma: PrismaService,
  userId: string,
  feature: AiFeatureKey,
): Promise<boolean> {
  const row = await prisma.aiFeatureTrial.findFirst({
    where: { userId, feature },
    select: { id: true },
  });
  return !row;
}

/**
 * Build the 403 body for a spent free run. Exported so tests (and the mobile
 * client) can assert on the exact contract rather than a message string.
 */
export function buildFreeTrialBlockedPayload(
  feature: AiFeatureKey,
  status: FreeTrialStatus,
): Record<string, unknown> {
  const descriptor = descriptorFor(feature);
  const message = status.exhausted
    ? `You've used your one free run of every AI feature, including ${descriptor.label}. ` +
      'Get the ₹499/mo plan for unlimited AI — or add your own AI key in Settings (free) and keep going on your key.'
    : `You've already used your one free ${descriptor.label} run. ` +
      `Each AI feature is free once — you still have ${status.remainingCount} unused. ` +
      'For more runs of this one, get the ₹499/mo plan or add your own AI key in Settings (free).';
  return {
    statusCode: 403,
    code: status.exhausted ? FREE_TRIAL_EXHAUSTED_CODE : FREE_TRIAL_FEATURE_USED_CODE,
    message,
    error: 'Forbidden',
    feature: descriptor.key,
    featureLabel: descriptor.label,
    upgradeHref: '/pricing',
    byokHref: '/settings',
    ...status,
  };
}

/**
 * Throw if this user has already spent their single free run of `feature`.
 * Call ONLY on the free path — never for BYOK or plan users.
 */
export async function enforceFreeTrialOrThrow(
  prisma: PrismaService,
  userId: string,
  feature: AiFeatureKey,
): Promise<void> {
  if (await isFreeTrialAvailable(prisma, userId, feature)) return;
  const status = await getFreeTrialStatus(prisma, userId);
  throw new ForbiddenException(buildFreeTrialBlockedPayload(feature, status));
}

/**
 * Burn the free run for `feature`. Best-effort by design: a lost write means
 * one uncounted free run, which is strictly better than failing a response
 * the user already paid attention for. Idempotent — the unique index means a
 * concurrent double-write collapses to one row.
 */
export async function recordFreeTrialUse(
  prisma: PrismaService,
  userId: string,
  feature: AiFeatureKey,
): Promise<void> {
  try {
    await prisma.aiFeatureTrial.upsert({
      where: { userId_feature: { userId, feature } },
      create: { userId, feature },
      update: {},
    });
  } catch {
    // Non-critical — see doc comment.
  }
}

// ── R-103 · Full AI on ONE resume ─────────────────────────────────────────
//
// The per-feature trial above metes out ONE RUN of each standalone AI tool.
// That is the wrong shape for the resume itself: rewriting bullets is how a
// resume gets built, so a single free run meant a user burned their AI on
// bullet #1 and could never finish. Founder call:
//
//   A free user gets EVERY AI feature, UNLIMITED, on ONE resume.
//   The same buttons on a second resume ask for the plan.
//
// The first resume-bound AI call claims that resume; from then on the claim
// is the entitlement. Nothing else changes for BYOK (own key) or plan users,
// who are never claimed and never blocked.

export const FREE_AI_RESUME_LOCKED_CODE = 'FREE_AI_RESUME_LOCKED';

export type FreeAiResumeClaim = {
  resumeId: string;
  claimedAt: string;
};

/** The resume this user's free AI is bound to, or null if unclaimed. */
export async function getFreeAiResume(
  prisma: PrismaService,
  userId: string,
): Promise<FreeAiResumeClaim | null> {
  const row = await prisma.aiFreeResume.findUnique({
    where: { userId },
    select: { resumeId: true, claimedAt: true },
  });
  return row ? { resumeId: row.resumeId, claimedAt: row.claimedAt.toISOString() } : null;
}

/**
 * Allow AI on `resumeId` for a FREE user, claiming it if this is their first
 * resume-bound AI call. Throws the structured 403 when the user's free AI is
 * already bound to a DIFFERENT resume.
 *
 * Only call on the free path — never for BYOK or plan users.
 */
export async function enforceFreeAiResume(
  prisma: PrismaService,
  userId: string,
  resumeId: string,
  options: { resumeTitle?: string | null } = {},
): Promise<void> {
  const claimed = await getFreeAiResume(prisma, userId);
  if (claimed) {
    if (claimed.resumeId === resumeId) return;
    throw new ForbiddenException(await buildResumeLockedPayload(prisma, userId, claimed));
  }

  try {
    await prisma.aiFreeResume.create({ data: { userId, resumeId } });
  } catch {
    // Unique(userId) collision: two AI calls raced on the user's first
    // resume. Re-read and apply the same rule against whichever won, so a
    // race can never hand out a second free resume.
    const settled = await getFreeAiResume(prisma, userId);
    if (!settled || settled.resumeId === resumeId) return;
    throw new ForbiddenException(await buildResumeLockedPayload(prisma, userId, settled));
  }
  void options;
}

/**
 * The 403 body for "AI is already bound to another resume". Carries the
 * claimed resume's id and title so the popup can name it — being vague
 * ("some other resume") would leave the user unable to act on it.
 */
async function buildResumeLockedPayload(
  prisma: PrismaService,
  userId: string,
  claim: FreeAiResumeClaim,
): Promise<Record<string, unknown>> {
  let claimedResumeTitle: string | null = null;
  try {
    const resume = await prisma.resume.findFirst({
      where: { id: claim.resumeId, userId },
      select: { title: true },
    });
    claimedResumeTitle = resume?.title ?? null;
  } catch {
    // Title is a nicety; never fail the refusal over it.
  }
  const named = claimedResumeTitle ? `“${claimedResumeTitle}”` : 'your first resume';
  return {
    statusCode: 403,
    code: FREE_AI_RESUME_LOCKED_CODE,
    error: 'Forbidden',
    message:
      `Your free AI is unlocked on ${named} — every AI feature stays unlimited there. ` +
      'To use AI on another resume, get the ₹499/mo plan (AI on every resume), ' +
      'or add your own AI key in Settings (free, unlimited on your key).',
    claimedResumeId: claim.resumeId,
    claimedResumeTitle,
    claimedAt: claim.claimedAt,
    upgradeHref: '/pricing',
    byokHref: '/settings',
  };
}
