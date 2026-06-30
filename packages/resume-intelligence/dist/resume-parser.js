"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripWatermarkFragments = stripWatermarkFragments;
exports.parseResumeText = parseResumeText;
exports.normalizeText = normalizeText;
const section_normalizer_js_1 = require("./section-normalizer.js");
// Canonical section headings + a few words that legitimately repeat as
// standalone short tokens — never treat these as watermark noise even if
// they recur.
const WATERMARK_SAFE_TOKENS = new Set([
    'experience', 'education', 'skills', 'languages', 'projects', 'summary',
    'profile', 'objective', 'achievements', 'certifications', 'awards',
    'contact', 'references', 'interests', 'hobbies', 'present', 'current',
]);
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
function stripWatermarkFragments(lines) {
    const freq = new Map();
    for (const line of lines) {
        if (!/^[A-Za-z]{2,20}$/.test(line))
            continue;
        const letters = line.replace(/[^A-Za-z]/g, '');
        const upper = line.replace(/[^A-Z]/g, '').length;
        if (letters.length === 0)
            continue;
        if (upper / letters.length < 0.8)
            continue; // mostly-uppercase only
        const key = line.toLowerCase();
        if (WATERMARK_SAFE_TOKENS.has(key))
            continue;
        freq.set(key, (freq.get(key) || 0) + 1);
    }
    const noise = new Set([...freq.entries()].filter(([, n]) => n >= 3).map(([k]) => k));
    if (noise.size === 0)
        return lines;
    return lines.filter((line) => !noise.has(line.toLowerCase()));
}
function parseResumeText(rawText) {
    const text = normalizeText(rawText);
    const prelim = text.split('\n').map((line) => line.trim()).filter((line) => {
        if (!line)
            return false;
        // Filter page footers like "-- 1 of 1 --", "Page 2 of 3"
        if (/^-*\s*(?:page\s+)?\d+\s+of\s+\d+\s*-*$/i.test(line))
            return false;
        return true;
    });
    const lines = stripWatermarkFragments(prelim);
    const sections = {};
    let current = 'unmapped';
    for (const line of lines) {
        const heading = (0, section_normalizer_js_1.normalizeHeading)(line);
        if (heading) {
            // "Achievements:" / "Achievements" inside the experience section is a
            // sub-heading within a job entry (e.g. listing accomplishments after
            // bullet points), NOT a separate top-level section.  Keep these lines
            // in the experience section so they stay attached to the correct role.
            if (current === 'experience' && heading === 'projects' && /^achievements?\b/i.test(line.replace(/[:\s]+$/g, '').trim())) {
                // Don't switch section — treat as a content line within experience
                sections[current].push(line);
                continue;
            }
            // "Innovation & POCs" or similar sub-headings inside experience are
            // descriptions of work done, not separate top-level sections.
            if (current === 'experience' && heading === 'hobbies' && /innovation/i.test(line)) {
                sections[current].push(line);
                continue;
            }
            current = heading;
            if (!sections[current])
                sections[current] = [];
            continue;
        }
        if (!sections[current])
            sections[current] = [];
        sections[current].push(line);
    }
    return { lines, sections };
}
function normalizeText(text) {
    const canonical = text
        .replace(/\u0000/g, '')
        // Normalize Unicode ligatures commonly mangled by pdf-parse:
        // ﬃ→ffi, ﬄ→ffl, ﬀ→ff, ﬁ→fi, ﬂ→fl (order matters: longest first)
        .replace(/\uFB03/g, 'ffi')
        .replace(/\uFB04/g, 'ffl')
        .replace(/\uFB00/g, 'ff')
        .replace(/\uFB01/g, 'fi')
        .replace(/\uFB02/g, 'fl')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/â€¢|â—¦|â–ª|â—/g, '- ')
        .replace(/[\u2022\u25e6\u25aa\u25cf\u00b7]/g, '- ')
        // Check-mark / arrow bullet markers (\u2713 \u2714 \u2705 \u27a4 \u25b8 \u25b9 \u2023 \u2043 \u25ba) \u2192 "- " so
        // downstream bullet detection and highlight attachment work. Some ATS
        // templates (e.g. Angular-dev resumes) use \u2713 as the bullet character,
        // which previously leaked into the highlight text as a literal glyph.
        .replace(/[\u2713\u2714\u2705\u27a4\u25b8\u25b9\u2023\u2043\u25ba]/g, '- ')
        .replace(/\r/g, '')
        // Convert any single tab to a space so "Company\tDate" becomes a normal
        // separator. PDF extractors and docx readers leak tab-separated columns
        // through to text, and downstream date/role detectors assume
        // whitespace-only separation.
        .replace(/\t/g, ' ')
        .split('\n')
        .map((line) => normalizeLegacyBulletPrefix(line))
        .join('\n');
    // Repair date range separators that lost a space ("Dec 2013- Present" or
    // "2022-Mar 2023"). Pdf-parse / docx readers sometimes drop the leading
    // space, which kills downstream date-range detection in the experience
    // mapper. Insert the missing space when the hyphen sits directly between a
    // year and the next date token (year, month name, or "Present").
    const dateSeparatorRepaired = canonical
        .replace(/\b((?:19|20)\d{2})-\s*(Present|Current|Now|Till\s*Date)\b/gi, '$1 - $2')
        .replace(/\b((?:19|20)\d{2})-\s*((?:19|20)\d{2})\b/g, '$1 - $2')
        .replace(/\b((?:19|20)\d{2})-\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b)/gi, '$1 - $2');
    return dateSeparatorRepaired
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}
const LEGACY_BULLET_PREFIX_RE = /^\s*(?:[-*•·]+|\d{1,3}[.)]|[a-z][.)])?\s*(impact|achievement|result|highlights?|accomplishment)s?:\s*/i;
function normalizeLegacyBulletPrefix(line) {
    const raw = String(line || '');
    if (!LEGACY_BULLET_PREFIX_RE.test(raw))
        return raw;
    const stripped = raw.replace(LEGACY_BULLET_PREFIX_RE, '').trim();
    if (!stripped)
        return '';
    // Preserve bullet semantics so highlights continue to attach to the active role.
    return `- ${stripped}`;
}
