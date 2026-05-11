import type { ParsedResume } from 'resume-schemas';
import type { ParsedResumeText } from './resume-parser.js';
export type MappedResumeResult = ParsedResume & {
    signals: {
        roleCount: number;
        distinctCompanyCount: number;
        rolesWithDateCount: number;
        roleCompanyPatternCount: number;
        estimatedTotalMonths: number;
    };
};
export declare function mapParsedResume(parsed: ParsedResumeText): MappedResumeResult;
/**
 * Decide whether a non-bullet `next` line is a continuation of the
 * previous bullet `prev` (PDF wrap-around) rather than a new bullet.
 *
 * Heuristics, in order of decisiveness:
 *   1. If prev ends with a sentence terminator (.!?;), it's complete —
 *      treat next as a new bullet.
 *   2. If next starts with a capital letter and is reasonably long
 *      (>= 30 chars), it's likely a real new bullet someone forgot to
 *      bullet-prefix. Don't merge.
 *   3. If prev ends with a connector ("and", "or", "but", "of",
 *      "with", "to", "for", "in", "on") OR a comma, it's almost
 *      certainly a wrap. Merge.
 *   4. If next starts with a lowercase word OR a clear continuation
 *      ("relationships.", "and team productivity"), merge.
 *   5. Otherwise, keep as a separate bullet (false negative is safer
 *      than wrong-merge).
 */
export declare function shouldMergeWrappedLine(prev: string, next: string): boolean;
//# sourceMappingURL=field-mapper.d.ts.map