/**
 * R-110 — first-touch acquisition attribution.
 *
 * Every MCP link already appends `?utm_source=…` so the founder could
 * tell which assistant platform sent a user. Nothing read it. A URL tag
 * with no reader is not attribution — it is a parameter that rides along
 * to the editor and disappears at the first navigation.
 *
 * First touch, not last: someone who arrives from ChatGPT, reads for a
 * day and returns via a bookmark was still acquired by ChatGPT. So the
 * first source seen wins and later visits do not overwrite it.
 *
 * Deliberately narrow on privacy grounds: the source string, the landing
 * path and a timestamp. No resume content, no free-text query strings, no
 * identifiers. Mirrors the R-037 referral plumbing — pure functions over
 * injectable storage so tests need no jsdom.
 */

const KEY = 'rb_acquisition_first_touch';
const MAX_LENGTH = 40;
/** Conservative: letters, digits and the separators real tags use. */
const SOURCE_SHAPE = /^[a-z0-9._-]+$/i;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type FirstTouch = {
  source: string;
  medium: string;
  campaign: string;
  landingPath: string;
  at: string;
};

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* private mode — attribution is optional, never break the page for it */
  }
  return null;
}

/** Sanitise one UTM value. Returns '' for anything unexpected. */
export function sanitizeUtmValue(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value || value.length > MAX_LENGTH) return '';
  if (!SOURCE_SHAPE.test(value)) return '';
  return value.toLowerCase();
}

/**
 * Record the first source this browser arrived from. Returns the stored
 * first touch (existing or newly written), or null when there is nothing
 * to record and nothing stored.
 */
export function captureFirstTouch(
  params: URLSearchParams,
  landingPath: string,
  storage?: StorageLike,
  now: Date = new Date(),
): FirstTouch | null {
  const store = resolveStorage(storage);
  if (!store) return null;

  const existing = readFirstTouch(store);
  if (existing) return existing; // first touch wins, always

  const source = sanitizeUtmValue(params.get('utm_source'));
  if (!source) return null;

  const touch: FirstTouch = {
    source,
    medium: sanitizeUtmValue(params.get('utm_medium')),
    campaign: sanitizeUtmValue(params.get('utm_campaign')),
    // Path only — a query string can carry anything a user typed.
    landingPath: String(landingPath || '/').split('?')[0].slice(0, 120),
    at: now.toISOString(),
  };
  try {
    store.setItem(KEY, JSON.stringify(touch));
  } catch {
    return null;
  }
  return touch;
}

export function readFirstTouch(storage?: StorageLike): FirstTouch | null {
  const store = resolveStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirstTouch>;
    if (!parsed || typeof parsed.source !== 'string' || !parsed.source) return null;
    return {
      source: parsed.source,
      medium: typeof parsed.medium === 'string' ? parsed.medium : '',
      campaign: typeof parsed.campaign === 'string' ? parsed.campaign : '',
      landingPath: typeof parsed.landingPath === 'string' ? parsed.landingPath : '/',
      at: typeof parsed.at === 'string' ? parsed.at : '',
    };
  } catch {
    return null; // corrupt entry is the same as no entry
  }
}

/**
 * Properties to attach to a conversion event (signup, first export,
 * application tracked). Empty object when the visit was not attributed,
 * so callers can spread it unconditionally.
 */
export function acquisitionProperties(storage?: StorageLike): Record<string, string> {
  const touch = readFirstTouch(storage);
  if (!touch) return {};
  return {
    acquisitionSource: touch.source,
    ...(touch.medium ? { acquisitionMedium: touch.medium } : {}),
    ...(touch.campaign ? { acquisitionCampaign: touch.campaign } : {}),
    acquisitionLandingPath: touch.landingPath,
    acquisitionAt: touch.at,
  };
}

export function clearFirstTouch(storage?: StorageLike): void {
  const store = resolveStorage(storage);
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
