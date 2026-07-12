/**
 * Bring-Your-Own-Key (BYOK) storage for free-tier AI features.
 *
 * Free users without a paid plan can plug in an AI key from any
 * supported provider (Groq is free; OpenAI and Anthropic require
 * paid accounts) to enable the conversational Sahaayak / Mentor
 * features. Once they upgrade to a paid plan, every request routes
 * through our shared key and this surface disappears entirely.
 *
 * STORAGE: the key lives ONLY in browser localStorage. It is sent
 * once per AI call as an `X-User-AI-Key` request header to our API
 * (which uses it for the upstream completion and never persists or
 * logs it). The key is never written to the server's database.
 *
 * Pure module — no React, no Next imports — so it loads quickly,
 * tests cleanly in node, and can be used from a service worker if
 * we ever need offline-first AI fallbacks.
 */

export const BYOK_PROVIDERS = ['groq', 'openai', 'anthropic'] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export interface ByokKeyRecord {
  provider: ByokProvider;
  apiKey: string;
  /**
   * Optional model name. Groq runs a fixed free model so this is ignored
   * for it; OpenAI/Anthropic bill per model, so those users can pin one
   * (e.g. 'gpt-4o-mini'). Empty → the server's per-provider default.
   */
  model?: string;
  /** ISO timestamp of when the user added this key. */
  addedAt: string;
}

/** Providers that need a model name alongside the key (Groq is key-only). */
export const PROVIDERS_NEEDING_MODEL: ReadonlySet<ByokProvider> = new Set(['openai', 'anthropic']);

/** Suggested default model per provider — shown as the input placeholder. */
export const DEFAULT_MODELS: Record<ByokProvider, string> = {
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

const STORAGE_KEY = 'rb_user_ai_key';

/**
 * Surface-level shape checks per provider. Real validation happens
 * upstream (the API rejects bad keys); this exists so we can warn
 * the user before they ever click Save.
 */
const KEY_FORMATS: Record<ByokProvider, { prefix?: string; minLen: number; example: string }> = {
  groq:      { prefix: 'gsk_',  minLen: 40,  example: 'gsk_…' },
  openai:    { prefix: 'sk-',   minLen: 40,  example: 'sk-…' },
  anthropic: { prefix: 'sk-ant', minLen: 40, example: 'sk-ant-…' },
};

/** Trim and basic-validate the shape of a user-supplied API key. */
export function validateKeyShape(provider: ByokProvider, raw: string): {
  ok: boolean;
  reason: string;
} {
  const key = String(raw || '').trim();
  const fmt = KEY_FORMATS[provider];
  if (!fmt) return { ok: false, reason: `Unknown provider "${provider}"` };
  if (!key) return { ok: false, reason: 'Paste your API key first.' };
  if (key.length < fmt.minLen) {
    return { ok: false, reason: `Key looks too short — ${provider} keys are usually ${fmt.minLen}+ characters.` };
  }
  if (fmt.prefix && !key.startsWith(fmt.prefix)) {
    return { ok: false, reason: `Doesn't look like a ${provider} key — should start with "${fmt.prefix}".` };
  }
  // Refuse anything containing whitespace or quotes — common
  // copy-paste mistake where the user grabs surrounding text.
  if (/\s/.test(key) || /['"]/.test(key)) {
    return { ok: false, reason: 'Key contains whitespace or quotes — paste just the key, no surrounding text.' };
  }
  return { ok: true, reason: '' };
}

export function loadByokKey(): ByokKeyRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ByokKeyRecord>;
    if (
      !parsed
      || typeof parsed.apiKey !== 'string'
      || typeof parsed.provider !== 'string'
      || !BYOK_PROVIDERS.includes(parsed.provider as ByokProvider)
    ) {
      return null;
    }
    return {
      provider: parsed.provider as ByokProvider,
      apiKey: parsed.apiKey,
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : undefined,
      addedAt: parsed.addedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveByokKey(provider: ByokProvider, apiKey: string, model?: string): ByokKeyRecord {
  const check = validateKeyShape(provider, apiKey);
  if (!check.ok) throw new Error(check.reason);
  const trimmedModel = String(model || '').trim();
  // Groq is key-only; drop any model to avoid sending a stray header for it.
  const modelToStore = provider !== 'groq' && trimmedModel ? trimmedModel : undefined;
  const record: ByokKeyRecord = {
    provider,
    apiKey: String(apiKey).trim(),
    model: modelToStore,
    addedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  }
  return record;
}

export function clearByokKey(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / disabled storage — best effort.
  }
}

/** Plan keys we treat as "paid" — BYOK card hides for these. */
const PAID_PLANS = new Set(['STUDENT', 'PRO']);

export function isPaidPlan(plan: string | null | undefined): boolean {
  return PAID_PLANS.has(String(plan || '').toUpperCase());
}

/**
 * Returns the AI key header to attach to a request, or null if the
 * user has no BYOK key configured. Callers send the header only on
 * AI-feature endpoints and only when present.
 */
export function getByokHeader(): Record<string, string> | null {
  const rec = loadByokKey();
  if (!rec) return null;
  const headers: Record<string, string> = {
    'X-User-AI-Key': rec.apiKey,
    'X-User-AI-Provider': rec.provider,
  };
  // Only OpenAI/Anthropic carry a model; Groq is key-only.
  if (rec.model && PROVIDERS_NEEDING_MODEL.has(rec.provider)) {
    headers['X-User-AI-Model'] = rec.model;
  }
  return headers;
}

/** Masked preview for the UI — never shows the whole key. */
export function maskedKey(rec: ByokKeyRecord | null): string {
  if (!rec) return '';
  const key = rec.apiKey;
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
