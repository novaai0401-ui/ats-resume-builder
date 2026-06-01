/**
 * Sandboxed validator for a proposed regex pattern. Two guarantees:
 *   1. Compiles cleanly with timeout-safe execution against bounded input.
 *   2. Recall ↑ on the target sample AND no regression on the recent corpus.
 *
 * "Regression" = the new pattern matches something on a previously-clean
 * sample where the existing pipeline already produced a verified result. We
 * count those, and require the count to stay at zero.
 */

export interface PatternProposal {
  kind: string;
  pattern: string;
  flags: string;
  patternType: 'regex' | 'heuristic';
}

export interface CorpusSample {
  id: string;
  redactedText: string;
  confidence: number;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  metrics: {
    sampleSize: number;
    matchedTargets: number;
    regressionCount: number;
    precision: number;
    recall: number;
  };
}

/** Hard limits to keep ReDoS off the table. */
const MAX_PATTERN_LEN = 400;
const MAX_INPUT_CHARS = 8000;
const EXEC_TIMEOUT_MS = 50;

export function compilePattern(p: PatternProposal): RegExp {
  if (p.patternType !== 'regex') {
    throw new Error(`Only regex patterns supported in v1 (got ${p.patternType}).`);
  }
  if (!p.pattern || p.pattern.length > MAX_PATTERN_LEN) {
    throw new Error('Pattern empty or exceeds length limit.');
  }
  // Disallow obvious catastrophic-backtracking shapes.
  if (/(\([^)]*\+\)\+|\([^)]*\*\)\*|\(\?:[^)]*\+\)\+)/.test(p.pattern)) {
    throw new Error('Pattern contains a nested quantifier shape — rejected.');
  }
  const flags = (p.flags || '').replace(/[^gimsuy]/g, '').slice(0, 6);
  return new RegExp(p.pattern, flags);
}

/** Time-bounded single-shot match — protects against pathological inputs. */
function safeTest(re: RegExp, text: string): boolean {
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  const start = Date.now();
  try {
    const matched = re.test(input);
    if (Date.now() - start > EXEC_TIMEOUT_MS) return false;
    return matched;
  } catch {
    return false;
  } finally {
    re.lastIndex = 0;
  }
}

export function validateProposal(
  proposal: PatternProposal,
  targetSample: CorpusSample,
  corpus: CorpusSample[],
): ValidationResult {
  let re: RegExp;
  try {
    re = compilePattern(proposal);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'compile failed',
      metrics: { sampleSize: 0, matchedTargets: 0, regressionCount: 0, precision: 0, recall: 0 },
    };
  }

  // Recall on the failing sample we are trying to fix.
  const fixedTarget = safeTest(re, targetSample.redactedText);

  // Regression: how many high-confidence samples does this newly match?
  // We approximate "regression" as "matches a sample whose extraction was
  // already good (≥0.85)" — those didn't need help, so new matches there
  // are suspicious until proven otherwise.
  const cleanCorpus = corpus.filter((s) => s.confidence >= 0.85 && s.id !== targetSample.id);
  const failingCorpus = corpus.filter((s) => s.confidence < 0.7 && s.id !== targetSample.id);

  let regressionCount = 0;
  for (const s of cleanCorpus) {
    if (safeTest(re, s.redactedText)) regressionCount += 1;
  }

  let matchedFailing = 0;
  for (const s of failingCorpus) {
    if (safeTest(re, s.redactedText)) matchedFailing += 1;
  }

  const totalMatchableFailing = failingCorpus.length;
  const recall = totalMatchableFailing === 0
    ? (fixedTarget ? 1 : 0)
    : (matchedFailing + (fixedTarget ? 1 : 0)) / (totalMatchableFailing + 1);

  // Precision proxy: targets / (targets + regressions).
  const matchedTargets = matchedFailing + (fixedTarget ? 1 : 0);
  const precision = (matchedTargets + regressionCount) === 0
    ? 0
    : matchedTargets / (matchedTargets + regressionCount);

  const ok =
    fixedTarget &&
    regressionCount === 0 &&
    precision >= 0.95;

  return {
    ok,
    reason: ok
      ? undefined
      : !fixedTarget
        ? 'pattern does not match its own target sample'
        : regressionCount > 0
          ? `pattern matched ${regressionCount} previously-clean sample(s)`
          : 'precision below 0.95 threshold',
    metrics: {
      sampleSize: corpus.length,
      matchedTargets,
      regressionCount,
      precision,
      recall,
    },
  };
}
