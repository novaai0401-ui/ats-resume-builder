/**
 * Additive extraction enhancements for ATS resume parsing.
 *
 * These helpers extend the existing field-mapper without modifying its
 * working logic. They are designed to recover contact, link, date and
 * skills information from a wider variety of resume formats — including
 * LinkedIn exports, Naukri exports, European/Asian CV templates and
 * obfuscated contact strings — and to harden extracted strings against
 * accidental XSS / control-character injection.
 *
 * All exports are pure functions and safe to call repeatedly.
 */
export declare function extractEmail(text: string): string;
export declare function extractPhone(text: string): string;
export declare function normalizePhone(value: string): string;
export declare function isPlausiblePhone(value: string): boolean;
export declare function extractLinks(text: string): string[];
export declare function classifyLink(url: string): 'linkedin' | 'github' | 'portfolio' | 'social' | 'other';
export declare function normalizeDateFlexible(token: string): string;
export declare const ADDITIONAL_TECH_SKILLS: string[];
export declare function extractAdditionalTechSkills(text: string, knownSet?: Set<string>): string[];
export declare function hardenString(value: string): string;
export declare function isSafeUrl(url: string): boolean;
export declare function extractSpokenLanguages(lines: string[]): Array<{
    name: string;
    proficiency?: string;
}>;
//# sourceMappingURL=extraction-enhancements.d.ts.map