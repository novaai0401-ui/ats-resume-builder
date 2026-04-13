"use strict";
/**
 * Feature flags and configuration for resume extraction pipeline.
 * Toggle enhanced extraction features without modifying core logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtractionConfig = getExtractionConfig;
exports.setExtractionConfig = setExtractionConfig;
exports.resetExtractionConfig = resetExtractionConfig;
const DEFAULT_CONFIG = {
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
let activeConfig = { ...DEFAULT_CONFIG };
/** Get the current extraction configuration */
function getExtractionConfig() {
    return activeConfig;
}
/** Override specific configuration values */
function setExtractionConfig(overrides) {
    activeConfig = { ...activeConfig, ...overrides };
}
/** Reset configuration to defaults */
function resetExtractionConfig() {
    activeConfig = { ...DEFAULT_CONFIG };
}
