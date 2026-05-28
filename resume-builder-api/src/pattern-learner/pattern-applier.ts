/**
 * Salvage pass: apply promoted LearnedPatterns to a parsed resume that has
 * verification gaps, filling ONLY empty fields. Never overwrites a value the
 * primary extractor already produced — that's the core safety property.
 *
 * Currently supports a conservative set of "single-token" kinds where merging
 * is safe by construction:
 *   - contact.phone
 *   - contact.location
 *   - education.degree (appended only when the education list is empty)
 *
 * Other kinds (experience.dateRange, section.heading, ...) require structural
 * reasoning we don't do in v1.5 — they remain in the registry for future use.
 */
import { compilePattern } from './pattern-validator';

export interface ApplicablePattern {
  kind: string;
  pattern: string;
  flags: string;
}

export interface SalvageTarget {
  contact?: { phone?: string; location?: string; email?: string; fullName?: string };
  education?: Array<{ degree?: string; institution?: string; startDate?: string; endDate?: string }>;
}

export interface SalvageReport {
  applied: Array<{ kind: string; field: string; value: string }>;
  skipped: Array<{ kind: string; reason: string }>;
}

const MAX_TEXT = 8000;
const EXEC_TIMEOUT_MS = 50;

function safeMatch(re: RegExp, text: string): string | null {
  const input = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  const start = Date.now();
  try {
    const m = re.exec(input);
    if (Date.now() - start > EXEC_TIMEOUT_MS) return null;
    if (!m) return null;
    // Prefer first capture group if present, else full match.
    const value = (m[1] ?? m[0] ?? '').trim();
    return value || null;
  } catch {
    return null;
  }
}

export function applyLearnedPatterns(
  rawText: string,
  parsed: SalvageTarget,
  patterns: ApplicablePattern[],
): SalvageReport {
  const report: SalvageReport = { applied: [], skipped: [] };
  if (!patterns?.length || !rawText) return report;

  for (const p of patterns) {
    let re: RegExp;
    try {
      re = compilePattern({ kind: p.kind, pattern: p.pattern, flags: p.flags, patternType: 'regex' });
    } catch (error) {
      report.skipped.push({ kind: p.kind, reason: `compile failed: ${error instanceof Error ? error.message : 'unknown'}` });
      continue;
    }

    switch (p.kind) {
      case 'contact.phone': {
        if (parsed.contact?.phone) { report.skipped.push({ kind: p.kind, reason: 'already set' }); break; }
        const v = safeMatch(re, rawText);
        if (!v) { report.skipped.push({ kind: p.kind, reason: 'no match' }); break; }
        parsed.contact = { ...(parsed.contact || {}), phone: v };
        report.applied.push({ kind: p.kind, field: 'contact.phone', value: v });
        break;
      }
      case 'contact.location': {
        if (parsed.contact?.location) { report.skipped.push({ kind: p.kind, reason: 'already set' }); break; }
        const v = safeMatch(re, rawText);
        if (!v) { report.skipped.push({ kind: p.kind, reason: 'no match' }); break; }
        parsed.contact = { ...(parsed.contact || {}), location: v };
        report.applied.push({ kind: p.kind, field: 'contact.location', value: v });
        break;
      }
      case 'education.degree': {
        if ((parsed.education || []).length > 0) {
          report.skipped.push({ kind: p.kind, reason: 'education already populated' });
          break;
        }
        const v = safeMatch(re, rawText);
        if (!v) { report.skipped.push({ kind: p.kind, reason: 'no match' }); break; }
        parsed.education = [{ degree: v }];
        report.applied.push({ kind: p.kind, field: 'education[0].degree', value: v });
        break;
      }
      default:
        report.skipped.push({ kind: p.kind, reason: 'kind not applied in v1.5' });
    }
  }

  return report;
}
