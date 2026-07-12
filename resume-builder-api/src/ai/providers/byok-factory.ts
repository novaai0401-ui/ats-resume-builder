import type { AiProvider } from './ai-provider.interface';
import { GroqProvider } from './groq.provider';
import { OpenAiProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';

/**
 * BYOK provider names exposed to the client. The user picks one in
 * Settings and pastes the matching API key; the client sends both
 * via per-request headers (X-User-AI-Provider, X-User-AI-Key). The
 * server then builds the provider here.
 *
 * Strict allowlist: anything not in this set is rejected. Prevents
 * a forged header from steering the proxy to an arbitrary URL.
 */
export type ByokProviderName = 'groq' | 'openai' | 'anthropic';

// Groq runs a fixed, free-tier model so it needs a key only. OpenAI and
// Anthropic bill per model and users often have access to different ones,
// so we accept an optional model name (X-User-AI-Model). Empty/omitted →
// each provider's sensible default.
const PROVIDER_BUILDERS: Record<ByokProviderName, (apiKey: string, model?: string) => AiProvider> = {
  groq: (k) => new GroqProvider(k),
  openai: (k, m) => new OpenAiProvider(k, m),
  anthropic: (k, m) => new AnthropicProvider(k, m),
};

/**
 * Build an AiProvider from the headers a free-tier BYOK user sends.
 * Returns null if either header is missing or the provider is not in
 * the allowlist — callers fall back to the operator-configured shared
 * provider (or the offline companion for Sahaayak).
 *
 * IMPORTANT — privacy contract:
 *   - The key is used in-memory for exactly one upstream call.
 *   - It is NEVER written to disk, the database, or any logger.
 *   - Caller code must not echo header values into error messages.
 */
export function buildByokProvider(
  providerHeader: string | null | undefined,
  keyHeader: string | null | undefined,
  modelHeader?: string | null | undefined,
): AiProvider | null {
  const provider = String(providerHeader || '').trim().toLowerCase();
  const key = String(keyHeader || '').trim();
  // Guard against header-injection / absurd values; a real model id is short.
  const model = String(modelHeader || '').trim().slice(0, 100) || undefined;
  if (!provider || !key) return null;
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_BUILDERS, provider)) return null;
  try {
    return PROVIDER_BUILDERS[provider as ByokProviderName](key, model);
  } catch {
    return null;
  }
}

export function isByokProviderName(value: string): value is ByokProviderName {
  return Object.prototype.hasOwnProperty.call(PROVIDER_BUILDERS, value);
}
