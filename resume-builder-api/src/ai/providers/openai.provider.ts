import type { AiProvider, AiCompletionOptions } from './ai-provider.interface';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * OpenAI provider — used when a free-tier user has configured a BYOK
 * OpenAI key. We never store the key; the caller passes it in per
 * request. gpt-4o-mini is the default because it's the cheapest
 * conversational model and the Sahaayak / Mentor use cases are
 * short-form (2-4 sentences).
 */
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) throw new Error('OpenAI API key is required');
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  async complete(systemPrompt: string, userPrompt: string, opts?: AiCompletionOptions): Promise<string> {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: opts?.temperature ?? 0.3,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI API ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('OpenAI returned no content');
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}
