import type { AiProvider, AiCompletionOptions } from './ai-provider.interface';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Anthropic provider — used when a free-tier user has configured a
 * BYOK Anthropic key. We never store the key. Haiku 4.5 is the
 * default because it's the cheapest Claude model and the
 * conversational use cases (Sahaayak / Mentor) want low-latency
 * short-form replies, not maximum reasoning depth.
 *
 * Notable shape differences from the OpenAI-compatible providers:
 *  - x-api-key header (not Authorization Bearer)
 *  - anthropic-version header required
 *  - system prompt is a TOP-LEVEL field, not a system-role message
 *  - response shape is `content[].text` not `choices[].message.content`
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) throw new Error('Anthropic API key is required');
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  async complete(systemPrompt: string, userPrompt: string, opts?: AiCompletionOptions): Promise<string> {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: opts?.temperature ?? 0.3,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      // content is an array of blocks; we expect a text block.
      const block = Array.isArray(data?.content) ? data.content[0] : null;
      const text = block && typeof block.text === 'string' ? block.text : null;
      if (typeof text !== 'string') throw new Error('Anthropic returned no content');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}
