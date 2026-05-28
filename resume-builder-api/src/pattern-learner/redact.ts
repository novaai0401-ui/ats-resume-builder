/**
 * Strip personally-identifying tokens from raw resume text before storing it
 * as a learning sample. Replaces emails, phones, and long digit runs with
 * stable placeholders so regex shapes remain visible to the LLM proposer.
 */
export function redactPII(text: string): string {
  return String(text || '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<EMAIL>')
    .replace(/\+?\d[\d\s().\-]{8,}\d/g, '<PHONE>')
    .replace(/\b\d{6,}\b/g, '<NUM>')
    .replace(/https?:\/\/\S+/gi, '<URL>')
    .slice(0, 8000);
}
