export type ParsedResumeText = {
    lines: string[];
    sections: Record<string, string[]>;
};
/**
 * Strip diagonal-watermark fragments (e.g. a "CONFIDENTIAL" stamp) that
 * pdf-parse extracts as repeated short ALL-CAPS lines and interleaves into
 * the resume body. Symptom: "CONFIDENTIAL"/"IDENTIAL"/"ENTIAL" fragments
 * landing in the Languages section and as stray Experience bullets.
 *
 * A line is treated as watermark noise when it is a single alphabetic
 * token (no spaces/digits/punctuation), 2–20 chars, predominantly
 * uppercase, AND it appears 3+ times across the document — a page-repeated
 * stamp, not real content. Section headings and a small allow-list are
 * never removed.
 */
export declare function stripWatermarkFragments(lines: string[]): string[];
export declare function parseResumeText(rawText: string): ParsedResumeText;
export declare function normalizeText(text: string): string;
//# sourceMappingURL=resume-parser.d.ts.map