import { PATTERN_KINDS } from './known-pattern-kinds';

export interface ProposerInput {
  kind: string;
  redactedText: string;
  verificationIssues: Array<{ kind: string; detail: string }>;
  extractedShape: unknown;
}

export const PROPOSER_SYSTEM_PROMPT = `You are a parsing-rules engineer for a resume ATS pipeline.
Your job: given one resume whose structured extraction failed, propose ONE
JavaScript regular expression that — if added to the parser's rule set for
the requested "kind" — would fix the specific failure WITHOUT matching
unrelated text.

Hard rules:
- Output STRICT JSON only, no prose, matching the schema below.
- Pattern must be a valid JS RegExp source string (no leading/trailing slashes).
- Use non-greedy quantifiers where possible. Never use nested quantifiers
  like (a+)+ or (a*)* — they cause catastrophic backtracking.
- Pattern length <= 300 chars.
- "flags" must be a subset of "gimsuy". Default to "i".
- If you cannot propose a safe, useful regex, return {"abstain": true}.

JSON schema:
{
  "kind": one of ${JSON.stringify(PATTERN_KINDS)},
  "pattern": "<regex source>",
  "flags": "i",
  "patternType": "regex",
  "rationale": "<one sentence>",
  "examples": ["<short string from input that should match>", ...]
}`;

export function buildProposerUserPrompt(input: ProposerInput): string {
  const issuesSummary = input.verificationIssues
    .slice(0, 8)
    .map((i) => `- ${i.kind}: ${i.detail}`)
    .join('\n');
  return [
    `Target extraction kind: ${input.kind}`,
    '',
    'Verification issues for this resume:',
    issuesSummary || '(none reported)',
    '',
    'Parser produced this shape:',
    JSON.stringify(input.extractedShape).slice(0, 1200),
    '',
    'Redacted resume text (truncated):',
    input.redactedText.slice(0, 4000),
    '',
    'Propose ONE regex that would fix the issue. JSON only.',
  ].join('\n');
}
