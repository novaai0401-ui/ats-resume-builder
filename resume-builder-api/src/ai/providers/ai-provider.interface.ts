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
  /**
   * Whether to request a structured JSON object from the model.
   * Defaults to `true` — most callers parse JSON and their prompts say so.
   * Conversational endpoints (Mentor, mock interview) MUST pass `false`:
   * Groq rejects `response_format: json_object` (HTTP 400) unless the word
   * "json" appears in the prompt, so a plain-text chat prompt would fail
   * every call. See GroqProvider.complete.
   */
  json?: boolean;
}
