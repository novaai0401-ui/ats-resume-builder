/**
 * Resume Layout Detector
 *
 * Analyzes extracted text to determine layout type:
 * - single-column: Standard linear flow (most ATS resumes)
 * - two-column: Side-by-side content (skills sidebar + main content)
 * - multi-column: Three or more columns
 * - hybrid: Mixed layout (e.g., header spans full width, body is two-column)
 *
 * Detection is text-based (no coordinate data needed). When PDF coordinate
 * data is available, accuracy improves via the optional positionHints.
 */
export type LayoutType = 'single-column' | 'two-column' | 'multi-column' | 'hybrid';
export interface LayoutAnalysis {
    type: LayoutType;
    confidence: number;
    /** Detected column count (best estimate) */
    columns: number;
    /** Lines that appear to contain merged/interleaved column content */
    interleaveIndicators: number;
    /** Whether text appears to have been extracted column-by-column vs row-by-row */
    columnWiseExtraction: boolean;
}
export interface PositionHint {
    text: string;
    x: number;
    y: number;
    width?: number;
}
/**
 * Detect resume layout type from extracted text.
 * @param text - Raw or normalized text extracted from the resume
 * @param positionHints - Optional position data from PDF extraction
 */
export declare function detectLayout(text: string, positionHints?: PositionHint[]): LayoutAnalysis;
/**
 * Re-order interleaved column text into logical reading order.
 * When PDF extractors merge columns left-to-right per line, section content
 * from different columns gets interleaved. This function detects and
 * separates the columns, then concatenates them sequentially.
 */
export declare function deinterleaveColumns(text: string, layout: LayoutAnalysis): string;
//# sourceMappingURL=layout-detector.d.ts.map