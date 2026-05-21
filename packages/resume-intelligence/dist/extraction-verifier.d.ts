/**
 * Extraction verifier — compares the structured fields produced by the
 * resume mapper against the raw text the user uploaded, and flags missing
 * or low-quality results so the caller can choose to re-extract.
 *
 * The verifier is intentionally **read-only** and never mutates the parsed
 * resume.  It returns a {@link VerificationReport} that callers can:
 *
 *   1. Use to detect when the structured output is materially incomplete
 *      compared with the source text (e.g. raw text has 5 date ranges but
 *      only 2 experience entries carry dates).
 *   2. Use to **compare two candidate extractions** (e.g. main mapper vs.
 *      enhancer fallback) and keep whichever scores higher — so we never
 *      trade a working pass for a worse one.
 *
 * Design notes:
 * - We compute a `confidence` in [0, 1].  Each issue subtracts a small
 *   weight; severe issues (no experience at all when the text clearly
 *   describes a career) subtract more.
 * - The thresholds are tuned conservatively so that the verifier only
 *   recommends a re-extract when the gap is obvious — minor whitespace,
 *   ligature, or wrap-line discrepancies should not trigger re-runs.
 */
import type { Contact, EducationItem, ExperienceItem } from 'resume-schemas';
export type VerificationIssueKind = 'missing-name' | 'missing-email' | 'missing-phone' | 'missing-location' | 'orphan-date-range' | 'phantom-experience' | 'experience-without-role' | 'experience-without-company' | 'no-experience-extracted' | 'no-education-extracted';
export interface VerificationIssue {
    kind: VerificationIssueKind;
    detail: string;
}
export interface VerifiableResume {
    contact?: Contact;
    experience: ExperienceItem[];
    education: EducationItem[];
    skills: string[];
}
export interface VerificationReport {
    ok: boolean;
    issues: VerificationIssue[];
    /**
     * 0..1 confidence score.  Higher = extracted content matches the raw
     * text well.  Use this to compare alternative extractions.
     */
    confidence: number;
    /**
     * True when confidence falls below the re-extract threshold and the
     * caller should attempt a fallback extractor.  The caller still needs
     * to keep whichever pass scores higher — never blindly replace the
     * primary extraction.
     */
    shouldReExtract: boolean;
}
/**
 * Score how well the structured resume matches the raw text it was
 * extracted from.  Higher = better fidelity.  See file header for design.
 */
export declare function verifyExtraction(rawText: string, extracted: VerifiableResume): VerificationReport;
/**
 * Pick the better of two candidate extractions based on their verification
 * reports.  When confidence is tied (or both have major gaps), prefer the
 * candidate with more experience entries — most failure modes manifest as
 * "we dropped entries", so more-is-better is the safe tiebreaker.
 */
export declare function pickBetterExtraction<T extends VerifiableResume>(primary: T, alternative: T, primaryReport: VerificationReport, alternativeReport: VerificationReport): {
    winner: T;
    report: VerificationReport;
    usedAlternative: boolean;
};
//# sourceMappingURL=extraction-verifier.d.ts.map