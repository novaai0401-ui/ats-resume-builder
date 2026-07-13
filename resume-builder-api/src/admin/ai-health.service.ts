import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider } from '../ai/providers/ai-provider.interface';
import { serverGroqProvider } from '../ai/server-provider';

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export type AiKeyStatus = {
  provider: string;
  model: string;
  /** True when the env is set up enough to build a server provider. */
  configured: boolean;
  /** Whether GROQ_API_KEY is present (never the key itself). */
  keyPresent: boolean;
  reason: string;
};

export type AiKeyVerify = {
  ok: boolean;
  error: string | null;
  model: string;
  latencyMs: number | null;
};

/**
 * R-085 — server AI-key diagnostics. Mirrors the mail diagnostics
 * (admin/mail/status): tells an admin whether the operator-configured
 * Groq key (`GROQ_API_KEY`) is present AND actually accepted by Groq via
 * a live, minimal completion — so "our AI silently fell back to
 * rule-based" (the C-004 smell) can be diagnosed without guessing at
 * Render env vars. Never returns or logs the key.
 */
@Injectable()
export class AiHealthService {
  constructor(private readonly config: ConfigService) {}

  /** Config snapshot — no secrets. */
  getStatus(): AiKeyStatus {
    const provider = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    const keyPresent = Boolean(this.config.get<string>('GROQ_API_KEY', ''));
    const model = this.config.get<string>('GROQ_MODEL', '') || DEFAULT_GROQ_MODEL;
    const configured = provider === 'groq' && keyPresent;

    let reason = '';
    if (provider !== 'groq') {
      reason = `AI_PROVIDER is "${provider}", not "groq" — this check only covers the Groq server key.`;
    } else if (!keyPresent) {
      reason = 'GROQ_API_KEY is not set. Add it to the environment (Render → Environment) to power our AI for paid users.';
    }
    return { provider, model, configured, keyPresent, reason };
  }

  /**
   * Live handshake: run a tiny completion through the real server provider.
   * Costs a negligible number of tokens; admin-only. `providerOverride` is
   * for tests only.
   */
  async verify(providerOverride?: AiProvider | null): Promise<AiKeyVerify> {
    const model = this.config.get<string>('GROQ_MODEL', '') || DEFAULT_GROQ_MODEL;
    const provider = providerOverride !== undefined ? providerOverride : serverGroqProvider(this.config);
    if (!provider) {
      return {
        ok: false,
        error: 'No server AI provider configured (GROQ_API_KEY missing or AI_PROVIDER not "groq").',
        model,
        latencyMs: null,
      };
    }

    const start = Date.now();
    try {
      // GroqProvider requests response_format: json_object, so the prompt
      // must ask for JSON or Groq rejects it.
      const out = await provider.complete(
        'You are a health check. Reply with strict JSON only.',
        'Return exactly {"status":"ok"}.',
        { maxTokens: 20, temperature: 0, timeoutMs: 15_000 },
      );
      const ok = typeof out === 'string' && out.trim().length > 0;
      return {
        ok,
        error: ok ? null : 'Provider returned an empty response.',
        model,
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      return { ok: false, error: sanitize(raw), model, latencyMs: Date.now() - start };
    }
  }
}

/** Defense-in-depth: never let a key-like token leak into an error body. */
function sanitize(message: string): string {
  return message.replace(/gsk_[A-Za-z0-9]+/g, 'gsk_***').replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 300);
}

/** Human-readable next step, matching the mail-status hint style. */
export function buildAiHint(status: AiKeyStatus, verify: AiKeyVerify): string {
  if (!status.configured) {
    return status.reason || 'Server AI is not configured.';
  }
  if (!verify.ok) {
    const e = verify.error || '';
    if (/401|invalid_api_key|unauthorized/i.test(e)) {
      return 'The Groq key is set but Groq rejected it (401). Check GROQ_API_KEY is a current, non-revoked key from console.groq.com/keys.';
    }
    if (/404|model_not_found|does not exist/i.test(e)) {
      return `The key is valid but the model "${status.model}" is not available to it. Set GROQ_MODEL to a model your account can use.`;
    }
    if (/429|rate.?limit|quota/i.test(e)) {
      return 'The key works but hit a Groq rate/quota limit (429). On the free tier this is expected under load — a paid Groq account is needed for many concurrent paid users.';
    }
    if (/timeout|aborted|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(e)) {
      return 'Could not reach Groq (network/timeout). Retry; if it persists, check outbound egress from the server.';
    }
    return 'Groq is configured but the live handshake failed — see error.';
  }
  return `Server Groq key is working (model ${status.model}, ${verify.latencyMs}ms). Paid users get our AI; free users use BYOK / rule-based.`;
}
