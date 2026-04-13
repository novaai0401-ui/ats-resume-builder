/**
 * Multi-layer Deduplication Engine
 *
 * Provides 5 layers of deduplication for resume content:
 * 1. Exact match - case-insensitive exact string match
 * 2. Fuzzy match - Levenshtein distance-based similarity
 * 3. Subset match - shorter string contained in longer one
 * 4. Semantic normalization - normalize synonyms/abbreviations before comparing
 * 5. Cross-section - remove duplicated content across different resume sections
 */
import type { ExperienceItem } from 'resume-schemas';
/**
 * Remove exact duplicate strings (case-insensitive).
 * Preserves first occurrence order.
 */
export declare function deduplicateExact(items: string[]): string[];
/**
 * Compute similarity ratio between two strings (0-1, 1 = identical).
 */
export declare function stringSimilarity(a: string, b: string): number;
/**
 * Remove fuzzy duplicates. When two items are similar above threshold,
 * keep the longer/more detailed one.
 */
export declare function deduplicateFuzzy(items: string[], threshold?: number): string[];
/**
 * Remove items that are substrings of other items in the list.
 * E.g., "JavaScript" is a subset of "JavaScript, TypeScript, React"
 * but we only apply this for highlight-style lines, not single skills.
 */
export declare function deduplicateSubset(items: string[], minLength?: number): string[];
/**
 * Remove semantically duplicate skills (e.g., "Node.js" and "NodeJS").
 * Preserves the first (more detailed) variant.
 */
export declare function deduplicateSkillsSemantic(skills: string[]): string[];
/**
 * Remove items from secondary section that already appear in primary section.
 * E.g., remove skills that are already mentioned in experience highlights.
 *
 * This is intentionally conservative — only exact/near-exact matches are removed.
 */
export declare function deduplicateCrossSection(primary: string[], secondary: string[], threshold?: number): string[];
/**
 * Advanced experience deduplication.
 * Only merges entries that are true duplicates — same company, same role title
 * (exact or near-exact match), and same/overlapping dates. Does NOT merge
 * different positions at the same company (e.g., promotions like
 * "Senior Engineer" and "Principal Engineer").
 */
export declare function deduplicateExperience(entries: ExperienceItem[]): ExperienceItem[];
export interface DeduplicationInput {
    skills: string[];
    experience: ExperienceItem[];
    highlights?: string[];
}
export interface DeduplicationResult {
    skills: string[];
    experience: ExperienceItem[];
}
/**
 * Run the full deduplication pipeline on extracted resume data.
 */
export declare function runDeduplicationPipeline(input: DeduplicationInput): DeduplicationResult;
//# sourceMappingURL=deduplication-engine.d.ts.map