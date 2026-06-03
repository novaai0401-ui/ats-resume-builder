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

const PROVIDER_BUILDERS: Record<ByokProviderName, (apiKey: string) => AiProvider> = {
  groq: (k) => new GroqProvider(k),
  openai: (k) => new OpenAiProvider(k),
  anthropic: (k) => new AnthropicProvider(k),
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
): AiProvider | null {
  const provider = String(providerHeader || '').trim().toLowerCase();
  const key = String(keyHeader || '').trim();
  if (!provider || !key) return null;
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_BUILDERS, provider)) return null;
  try {
    return PROVIDER_BUILDERS[provider as ByokProviderName](key);
  } catch {
    return null;
  }
}

export function isByokProviderName(value: string): value is ByokProviderName {
  return Object.prototype.hasOwnProperty.call(PROVIDER_BUILDERS, value);
}
