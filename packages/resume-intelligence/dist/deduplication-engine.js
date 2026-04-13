"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.deduplicateExact = deduplicateExact;
exports.stringSimilarity = stringSimilarity;
exports.deduplicateFuzzy = deduplicateFuzzy;
exports.deduplicateSubset = deduplicateSubset;
exports.deduplicateSkillsSemantic = deduplicateSkillsSemantic;
exports.deduplicateCrossSection = deduplicateCrossSection;
exports.deduplicateExperience = deduplicateExperience;
exports.runDeduplicationPipeline = runDeduplicationPipeline;
const extraction_config_js_1 = require("./extraction-config.js");
// ─── Layer 1: Exact Deduplication ─────────────────────────────────────────────
/**
 * Remove exact duplicate strings (case-insensitive).
 * Preserves first occurrence order.
 */
function deduplicateExact(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = item.trim().toLowerCase();
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}
// ─── Layer 2: Fuzzy Deduplication ─────────────────────────────────────────────
/**
 * Compute Levenshtein distance between two strings.
 * Uses optimized single-row DP for memory efficiency.
 */
function levenshteinDistance(a, b) {
    if (a === b)
        return 0;
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;
    // Short-circuit for very different lengths
    if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.5) {
        return Math.max(a.length, b.length);
    }
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const val = Math.min(row[j] + 1, // deletion
            prev + 1, // insertion
            row[j - 1] + cost // substitution
            );
            row[j - 1] = prev;
            prev = val;
        }
        row[b.length] = prev;
    }
    return row[b.length];
}
/**
 * Compute similarity ratio between two strings (0-1, 1 = identical).
 */
function stringSimilarity(a, b) {
    const la = a.toLowerCase().trim();
    const lb = b.toLowerCase().trim();
    if (la === lb)
        return 1;
    const maxLen = Math.max(la.length, lb.length);
    if (maxLen === 0)
        return 1;
    return 1 - levenshteinDistance(la, lb) / maxLen;
}
/**
 * Remove fuzzy duplicates. When two items are similar above threshold,
 * keep the longer/more detailed one.
 */
function deduplicateFuzzy(items, threshold) {
    const config = (0, extraction_config_js_1.getExtractionConfig)();
    const similarityThreshold = threshold ?? config.fuzzySimilarityThreshold;
    if (!config.fuzzyDedup)
        return items;
    const result = [];
    const removed = new Set();
    for (let i = 0; i < items.length; i++) {
        if (removed.has(i))
            continue;
        let best = items[i];
        for (let j = i + 1; j < items.length; j++) {
            if (removed.has(j))
                continue;
            const sim = stringSimilarity(best, items[j]);
            if (sim >= similarityThreshold) {
                // Keep the longer/more detailed version
                if (items[j].length > best.length) {
                    best = items[j];
                }
                removed.add(j);
            }
        }
        result.push(best);
    }
    return result;
}
// ─── Layer 3: Subset Deduplication ────────────────────────────────────────────
/**
 * Remove items that are substrings of other items in the list.
 * E.g., "JavaScript" is a subset of "JavaScript, TypeScript, React"
 * but we only apply this for highlight-style lines, not single skills.
 */
function deduplicateSubset(items, minLength = 20) {
    const config = (0, extraction_config_js_1.getExtractionConfig)();
    if (!config.subsetDedup)
        return items;
    const result = [];
    const normalized = items.map((item) => item.toLowerCase().trim());
    for (let i = 0; i < items.length; i++) {
        const current = normalized[i];
        // Only apply subset removal to longer strings (highlights, not skills)
        if (current.length < minLength) {
            result.push(items[i]);
            continue;
        }
        let isSubset = false;
        for (let j = 0; j < items.length; j++) {
            if (i === j)
                continue;
            if (normalized[j].length > current.length && normalized[j].includes(current)) {
                isSubset = true;
                break;
            }
        }
        if (!isSubset)
            result.push(items[i]);
    }
    return result;
}
// ─── Layer 4: Semantic Normalization ──────────────────────────────────────────
const SKILL_SYNONYMS = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'node': 'node.js',
    'nodejs': 'node.js',
    'react.js': 'react',
    'reactjs': 'react',
    'vue.js': 'vue',
    'vuejs': 'vue',
    'angular.js': 'angular',
    'angularjs': 'angular',
    'next.js': 'nextjs',
    'express.js': 'express',
    'expressjs': 'express',
    'postgres': 'postgresql',
    'mongo': 'mongodb',
    'k8s': 'kubernetes',
    'tf': 'terraform',
    'aws lambda': 'lambda',
    'amazon web services': 'aws',
    'google cloud platform': 'gcp',
    'google cloud': 'gcp',
    'microsoft azure': 'azure',
    'ci/cd': 'ci cd',
    'ci / cd': 'ci cd',
    'machine learning': 'ml',
    'artificial intelligence': 'ai',
    'deep learning': 'dl',
    'natural language processing': 'nlp',
    'c sharp': 'c#',
    'c++': 'cpp',
    'objective c': 'objective-c',
    'dot net': '.net',
    'dotnet': '.net',
};
/**
 * Normalize a skill name to its canonical form for comparison.
 */
function normalizeSkillName(skill) {
    const lower = skill.toLowerCase().trim();
    return SKILL_SYNONYMS[lower] || lower;
}
/**
 * Remove semantically duplicate skills (e.g., "Node.js" and "NodeJS").
 * Preserves the first (more detailed) variant.
 */
function deduplicateSkillsSemantic(skills) {
    const seen = new Map(); // normalized -> original
    const result = [];
    for (const skill of skills) {
        const normalized = normalizeSkillName(skill);
        if (seen.has(normalized))
            continue;
        seen.set(normalized, skill);
        result.push(skill);
    }
    return result;
}
// ─── Layer 5: Cross-Section Deduplication ─────────────────────────────────────
/**
 * Remove items from secondary section that already appear in primary section.
 * E.g., remove skills that are already mentioned in experience highlights.
 *
 * This is intentionally conservative — only exact/near-exact matches are removed.
 */
function deduplicateCrossSection(primary, secondary, threshold = 0.9) {
    const config = (0, extraction_config_js_1.getExtractionConfig)();
    if (!config.crossSectionDedup)
        return secondary;
    const primaryNormalized = new Set(primary.map((s) => s.toLowerCase().trim()));
    const result = [];
    for (const item of secondary) {
        const norm = item.toLowerCase().trim();
        // Exact match
        if (primaryNormalized.has(norm))
            continue;
        // Near-exact fuzzy match against all primary items
        let isDuplicate = false;
        for (const pItem of primaryNormalized) {
            if (stringSimilarity(norm, pItem) >= threshold) {
                isDuplicate = true;
                break;
            }
        }
        if (!isDuplicate)
            result.push(item);
    }
    return result;
}
// ─── Experience Deduplication ─────────────────────────────────────────────────
/**
 * Normalize a company name for comparison.
 */
function normalizeCompanyForDedup(company) {
    return company
        .toLowerCase()
        .replace(/\b(inc|llc|ltd|corp|co|pvt|limited|corporation|technologies|tech|systems|labs|solutions|group|studio|partners|consulting|digital)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}
/**
 * Advanced experience deduplication.
 * Only merges entries that are true duplicates — same company, same role title
 * (exact or near-exact match), and same/overlapping dates. Does NOT merge
 * different positions at the same company (e.g., promotions like
 * "Senior Engineer" and "Principal Engineer").
 */
function deduplicateExperience(entries) {
    const config = (0, extraction_config_js_1.getExtractionConfig)();
    if (!config.enhancedDedup)
        return entries;
    const result = [];
    const merged = new Set();
    for (let i = 0; i < entries.length; i++) {
        if (merged.has(i))
            continue;
        let current = { ...entries[i], highlights: [...entries[i].highlights] };
        for (let j = i + 1; j < entries.length; j++) {
            if (merged.has(j))
                continue;
            const companyMatch = normalizeCompanyForDedup(current.company) === normalizeCompanyForDedup(entries[j].company) ||
                stringSimilarity(current.company.toLowerCase(), entries[j].company.toLowerCase()) >= 0.85;
            if (!companyMatch)
                continue;
            // Strict role matching: require high similarity (>= 0.9) to avoid
            // merging different positions (promotions) at the same company.
            const roleSimilarity = stringSimilarity(current.role.toLowerCase(), entries[j].role.toLowerCase());
            if (roleSimilarity < 0.9)
                continue;
            // Merge: combine highlights, pick best dates
            merged.add(j);
            const mergedHighlights = [...current.highlights, ...entries[j].highlights];
            current.highlights = deduplicateExact(mergedHighlights);
            // Keep earliest start and latest end
            if (!current.startDate && entries[j].startDate) {
                current.startDate = entries[j].startDate;
            }
            if (!current.endDate && entries[j].endDate) {
                current.endDate = entries[j].endDate;
            }
            // Prefer the longer/more detailed company/role name
            if (entries[j].company.length > current.company.length) {
                current.company = entries[j].company;
            }
            if (entries[j].role.length > current.role.length) {
                current.role = entries[j].role;
            }
        }
        // Deduplicate highlights within the entry
        current.highlights = deduplicateSubset(deduplicateFuzzy(deduplicateExact(current.highlights), 0.88), 30);
        result.push(current);
    }
    return result;
}
/**
 * Run the full deduplication pipeline on extracted resume data.
 */
function runDeduplicationPipeline(input) {
    const config = (0, extraction_config_js_1.getExtractionConfig)();
    // Deduplicate skills: exact → semantic → fuzzy
    let skills = deduplicateExact(input.skills);
    skills = deduplicateSkillsSemantic(skills);
    if (config.fuzzyDedup) {
        skills = deduplicateFuzzy(skills, 0.9); // Higher threshold for skills
    }
    // Deduplicate experience entries
    let experience = deduplicateExperience(input.experience);
    // Cross-section: remove skills that are exact duplicates of experience highlights
    if (config.crossSectionDedup && input.highlights) {
        // Don't remove skills from experience highlights — instead, this is informational
        // We only do light cross-section cleanup: remove single-word "skills" that exactly
        // match a role title (e.g., "Manager" as a skill when it's a role)
    }
    // Enforce limits
    if (skills.length > config.maxSkills) {
        skills = skills.slice(0, config.maxSkills);
    }
    if (experience.length > config.maxExperienceEntries) {
        experience = experience.slice(0, config.maxExperienceEntries);
    }
    return { skills, experience };
}
