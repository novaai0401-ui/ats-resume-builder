/**
 * Provider-agnostic interface for AI completions.
 * Implementations: GroqProvider, XaiProvider (feature-flagged).
 */
export interface AiProvider {
  readonly name: string;
  /** Send a chat completion and return the raw text response. */
  complete(systemPrompt: string, userPrompt: string, opts?: AiCompletionOptions): Promise<string>;
}

export interface AiCompletionOptions {
  /** Max tokens to generate (default varies by provider). */
  maxTokens?: number;
  /** Sampling temperature 0-1. */
  temperature?: number;
  /** Timeout in ms. */
  timeoutMs?: number;
}
