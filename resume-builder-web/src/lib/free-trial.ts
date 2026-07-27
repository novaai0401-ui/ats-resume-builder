/**
 * R-098 — client half of the "one free run per AI feature" trial.
 *
 * The server owns the ledger; this module only:
 *   • recognises the two structured 403s the API throws
 *     (FREE_TRIAL_FEATURE_USED / FREE_TRIAL_EXHAUSTED), and
 *   • hands the caller the feature list carried in that response so the
 *     popup can show exactly what's left without a second round trip.
 *
 * Nothing here decides entitlement. A client-side guess about how many
 * free runs remain would be a C-003 lie the moment two tabs disagree.
 */
import { isApiRequestError } from './api';

export const FREE_TRIAL_FEATURE_USED_CODE = 'FREE_TRIAL_FEATURE_USED';
export const FREE_TRIAL_EXHAUSTED_CODE = 'FREE_TRIAL_EXHAUSTED';

export type FreeTrialFeature = {
  key: string;
  label: string;
  blurb: string;
  href: string;
  used: boolean;
  usedAt: string | null;
};

export type FreeTrialStatus = {
  trialApplies: boolean;
  features: FreeTrialFeature[];
  usedCount: number;
  totalCount: number;
  remainingCount: number;
  exhausted: boolean;
};

/** What the popup needs: why it opened, plus the ledger to render. */
export type FreeTrialBlock = FreeTrialStatus & {
  code: typeof FREE_TRIAL_FEATURE_USED_CODE | typeof FREE_TRIAL_EXHAUSTED_CODE;
  message: string;
  /** The feature the user just tried to run a second time. */
  feature: string;
  featureLabel: string;
};

/** Browser event the app-wide modal host listens for. */
export const FREE_TRIAL_BLOCK_EVENT = 'callbackcv:free-trial-block';

function asFeatureList(value: unknown): FreeTrialFeature[] {
  if (!Array.isArray(value)) return [];
  const out: FreeTrialFeature[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const key = typeof obj.key === 'string' ? obj.key : '';
    if (!key) continue;
    out.push({
      key,
      label: typeof obj.label === 'string' ? obj.label : key,
      blurb: typeof obj.blurb === 'string' ? obj.blurb : '',
      href: typeof obj.href === 'string' ? obj.href : '/pricing',
      used: obj.used === true,
      usedAt: typeof obj.usedAt === 'string' ? obj.usedAt : null,
    });
  }
  return out;
}

/**
 * Turn a thrown API error into a `FreeTrialBlock`, or null when the error is
 * something else entirely (network, validation, a different 403). Callers use
 * the null case to fall through to their normal error rendering.
 */
export function parseFreeTrialError(error: unknown): FreeTrialBlock | null {
  if (!isApiRequestError(error)) return null;
  if (error.code !== FREE_TRIAL_FEATURE_USED_CODE && error.code !== FREE_TRIAL_EXHAUSTED_CODE) {
    return null;
  }
  const raw = (error.raw && typeof error.raw === 'object' ? error.raw : {}) as Record<string, unknown>;
  const features = asFeatureList(raw.features);
  const usedCount = typeof raw.usedCount === 'number' ? raw.usedCount : features.filter((f) => f.used).length;
  const totalCount = typeof raw.totalCount === 'number' ? raw.totalCount : features.length;
  return {
    code: error.code as FreeTrialBlock['code'],
    message: error.message,
    feature: typeof raw.feature === 'string' ? raw.feature : '',
    featureLabel: typeof raw.featureLabel === 'string' ? raw.featureLabel : 'this AI feature',
    trialApplies: raw.trialApplies !== false,
    features,
    usedCount,
    totalCount,
    remainingCount:
      typeof raw.remainingCount === 'number' ? raw.remainingCount : Math.max(0, totalCount - usedCount),
    exhausted: raw.exhausted === true || error.code === FREE_TRIAL_EXHAUSTED_CODE,
  };
}

/**
 * The one line every AI page needs in its catch block:
 *
 *   catch (err) { if (!handleFreeTrialError(err)) setError(message); }
 *
 * Returns true when the error was a free-trial refusal — in that case the
 * app-wide `FreeTrialLimitModalHost` has been told to open, so the page
 * should NOT also render an inline error saying the same thing twice.
 */
export function handleFreeTrialError(error: unknown): boolean {
  const block = parseFreeTrialError(error);
  if (!block) return false;
  if (typeof window === 'undefined') return true;
  window.dispatchEvent(new CustomEvent<FreeTrialBlock>(FREE_TRIAL_BLOCK_EVENT, { detail: block }));
  return true;
}
