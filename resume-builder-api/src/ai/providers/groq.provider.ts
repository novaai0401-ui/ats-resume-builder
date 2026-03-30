import type { AiProvider, AiCompletionOptions } from './ai-provider.interface';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * GROQ free-tier provider using the OpenAI-compatible chat completions API.
 */
export class GroqProvider implements AiProvider {
  readonly name = 'groq';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) throw new Error('GROQ_API_KEY is required for GroqProvider');
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  async complete(systemPrompt: string, userPrompt: string, opts?: AiCompletionOptions): Promise<string> {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Groq API ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Groq returned no content');
      }
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}
