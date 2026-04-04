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
  confidence: number; // 0-1
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
export function detectLayout(text: string, positionHints?: PositionHint[]): LayoutAnalysis {
  if (positionHints && positionHints.length > 10) {
    return detectLayoutFromPositions(positionHints);
  }
  return detectLayoutFromText(text);
}

/**
 * Text-based layout detection using heuristics:
 * - Tab/multiple-space separators suggest columns
 * - Short lines mixed with long lines suggest sidebar
 * - Section headings appearing mid-line suggest column merging
 * - Irregular line length patterns suggest multi-column extraction
 */
function detectLayoutFromText(text: string): LayoutAnalysis {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { type: 'single-column', confidence: 1, columns: 1, interleaveIndicators: 0, columnWiseExtraction: false };
  }

  let tabSeparatedLines = 0;
  let multiSpaceSeparatedLines = 0;
  let interleaveIndicators = 0;
  let shortLines = 0; // < 30 chars
  let longLines = 0;  // > 60 chars
  const lineLengths: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const len = trimmed.length;
    lineLengths.push(len);

    if (/\t/.test(trimmed)) tabSeparatedLines++;
    if (/\s{4,}/.test(trimmed) && len > 20) multiSpaceSeparatedLines++;

    if (len < 30) shortLines++;
    else if (len > 60) longLines++;

    // Section heading appearing after content on same line (merged columns)
    if (/\s{3,}(skills|education|experience|summary|projects|certifications|languages|hobbies)\s*:?\s*$/i.test(trimmed)) {
      interleaveIndicators++;
    }

    // Two distinct content blocks separated by large whitespace
    if (/\S+\s{5,}\S+/.test(trimmed) && len > 40) {
      interleaveIndicators++;
    }
  }

  const totalLines = lines.length;
  const tabRatio = tabSeparatedLines / totalLines;
  const multiSpaceRatio = multiSpaceSeparatedLines / totalLines;
  const shortRatio = shortLines / totalLines;
  const interleaveRatio = interleaveIndicators / totalLines;

  // Calculate line length variance
  const avgLen = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length;
  const variance = lineLengths.reduce((sum, len) => sum + (len - avgLen) ** 2, 0) / lineLengths.length;
  const stddev = Math.sqrt(variance);
  const cv = avgLen > 0 ? stddev / avgLen : 0; // coefficient of variation

  // Detect section headings appearing in unusual patterns
  const sectionHeadingRe = /^(skills|education|experience|summary|projects|certifications|languages|hobbies|profile|objective)\s*:?\s*$/i;
  let consecutiveShortSections = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (sectionHeadingRe.test(lines[i].trim()) && sectionHeadingRe.test(lines[i + 1].trim())) {
      consecutiveShortSections++;
    }
  }

  // Decision logic
  if (interleaveRatio > 0.15 || (tabRatio > 0.3 && interleaveIndicators > 2)) {
    return {
      type: 'two-column',
      confidence: Math.min(0.9, 0.5 + interleaveRatio + tabRatio),
      columns: 2,
      interleaveIndicators,
      columnWiseExtraction: consecutiveShortSections > 1,
    };
  }

  if (multiSpaceRatio > 0.2 && interleaveIndicators > 0) {
    return {
      type: 'two-column',
      confidence: Math.min(0.85, 0.4 + multiSpaceRatio),
      columns: 2,
      interleaveIndicators,
      columnWiseExtraction: false,
    };
  }

  // High variance in line lengths with many short lines could be sidebar layout
  if (cv > 0.7 && shortRatio > 0.4 && longLines > 5) {
    const isHybrid = shortRatio < 0.6; // Mix of short and long
    return {
      type: isHybrid ? 'hybrid' : 'two-column',
      confidence: Math.min(0.75, 0.3 + cv * 0.3),
      columns: 2,
      interleaveIndicators,
      columnWiseExtraction: consecutiveShortSections > 1,
    };
  }

  // Column-wise extraction: section headings from different columns appear consecutively
  if (consecutiveShortSections >= 2) {
    return {
      type: 'two-column',
      confidence: 0.7,
      columns: 2,
      interleaveIndicators,
      columnWiseExtraction: true,
    };
  }

  return {
    type: 'single-column',
    confidence: Math.min(1, 0.7 + (1 - cv) * 0.3),
    columns: 1,
    interleaveIndicators: 0,
    columnWiseExtraction: false,
  };
}

/**
 * Position-based layout detection using x-coordinate clustering.
 * Groups text blocks by their x-position to identify columns.
 */
function detectLayoutFromPositions(hints: PositionHint[]): LayoutAnalysis {
  // Cluster x-positions using histogram binning
  const xPositions = hints.map((h) => h.x).sort((a, b) => a - b);
  const minX = xPositions[0];
  const maxX = xPositions[xPositions.length - 1];
  const range = maxX - minX;

  if (range < 50) {
    // All text at roughly the same x — single column
    return { type: 'single-column', confidence: 0.95, columns: 1, interleaveIndicators: 0, columnWiseExtraction: false };
  }

  // Bin x-positions into clusters (gap > 15% of page width = new column)
  const gapThreshold = range * 0.15;
  const clusters: number[][] = [[xPositions[0]]];

  for (let i = 1; i < xPositions.length; i++) {
    const lastCluster = clusters[clusters.length - 1];
    const lastX = lastCluster[lastCluster.length - 1];
    if (xPositions[i] - lastX > gapThreshold) {
      clusters.push([xPositions[i]]);
    } else {
      lastCluster.push(xPositions[i]);
    }
  }

  // Filter out clusters with very few items (noise)
  const significantClusters = clusters.filter((c) => c.length >= Math.max(3, hints.length * 0.05));
  const columnCount = significantClusters.length;

  if (columnCount <= 1) {
    return { type: 'single-column', confidence: 0.9, columns: 1, interleaveIndicators: 0, columnWiseExtraction: false };
  }

  // Check if some content spans full width (hybrid)
  const fullWidthItems = hints.filter((h) => {
    const w = h.width || 0;
    return w > range * 0.7;
  });
  const isHybrid = fullWidthItems.length > hints.length * 0.1;

  if (columnCount === 2) {
    return {
      type: isHybrid ? 'hybrid' : 'two-column',
      confidence: 0.9,
      columns: 2,
      interleaveIndicators: 0,
      columnWiseExtraction: false,
    };
  }

  return {
    type: isHybrid ? 'hybrid' : 'multi-column',
    confidence: 0.85,
    columns: columnCount,
    interleaveIndicators: 0,
    columnWiseExtraction: false,
  };
}

/**
 * Re-order interleaved column text into logical reading order.
 * When PDF extractors merge columns left-to-right per line, section content
 * from different columns gets interleaved. This function detects and
 * separates the columns, then concatenates them sequentially.
 */
export function deinterleaveColumns(text: string, layout: LayoutAnalysis): string {
  if (layout.type === 'single-column' || !layout.columnWiseExtraction) {
    return text;
  }

  const lines = text.split('\n');
  const reordered: string[] = [];

  // For column-wise extracted text, section headings from different columns
  // appear consecutively. Group content by detecting large whitespace gaps.
  let currentChunk: string[] = [];
  const chunks: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Large whitespace gap in the middle suggests merged columns
    const parts = trimmed.split(/\s{5,}/);
    if (parts.length >= 2 && parts[0].length > 3 && parts[1].length > 3) {
      // Split into separate column entries
      if (currentChunk.length > 0) {
        chunks.push([...currentChunk]);
        currentChunk = [];
      }
      chunks.push([parts[0].trim()]);
      chunks.push([parts[1].trim()]);
    } else {
      currentChunk.push(trimmed);
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  for (const chunk of chunks) {
    reordered.push(...chunk);
  }

  return reordered.join('\n');
}
