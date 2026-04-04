/**
 * Feature flags and configuration for resume extraction pipeline.
 * Toggle enhanced extraction features without modifying core logic.
 */

export interface ExtractionConfig {
  /** Enable layout detection (single-column, multi-column, hybrid) */
  layoutDetection: boolean;
  /** Enable enhanced multi-layer deduplication */
  enhancedDedup: boolean;
  /** Enable fuzzy matching in deduplication (Levenshtein-based) */
  fuzzyDedup: boolean;
  /** Fuzzy match similarity threshold (0-1, higher = stricter) */
  fuzzySimilarityThreshold: number;
  /** Enable subset deduplication (remove highlights contained in longer ones) */
  subsetDedup: boolean;
  /** Enable cross-section deduplication (skills vs experience highlights, etc.) */
  crossSectionDedup: boolean;
  /** Enable enhanced section detection with expanded keyword variants */
  enhancedSectionDetection: boolean;
  /** Maximum number of experience entries before trimming low-confidence ones */
  maxExperienceEntries: number;
  /** Maximum number of skills */
  maxSkills: number;
  /** Summary character limit */
  summaryCharLimit: number;
}

const DEFAULT_CONFIG: ExtractionConfig = {
  layoutDetection: true,
  enhancedDedup: true,
  fuzzyDedup: true,
  fuzzySimilarityThreshold: 0.85,
  subsetDedup: true,
  crossSectionDedup: true,
  enhancedSectionDetection: true,
  maxExperienceEntries: 20,
  maxSkills: 50,
  summaryCharLimit: 600,
};

let activeConfig: ExtractionConfig = { ...DEFAULT_CONFIG };

/** Get the current extraction configuration */
export function getExtractionConfig(): Readonly<ExtractionConfig> {
  return activeConfig;
}

/** Override specific configuration values */
export function setExtractionConfig(overrides: Partial<ExtractionConfig>): void {
  activeConfig = { ...activeConfig, ...overrides };
}

/** Reset configuration to defaults */
export function resetExtractionConfig(): void {
  activeConfig = { ...DEFAULT_CONFIG };
}
