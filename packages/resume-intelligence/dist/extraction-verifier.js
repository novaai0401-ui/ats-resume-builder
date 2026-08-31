"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyExtraction = verifyExtraction;
exports.pickBetterExtraction = pickBetterExtraction;
const NAME_LINE_RE = /^[\p{Lu}][\p{L}.'\-]+(?:\s+[\p{Lu}][\p{L}.'\-]+){1,3}$/u;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /\+?\d[\d\s().\-]{7,}\d/;
const LOCATION_RE = /\b(remote|usa|united states|india|canada|uk|australia|singapore|pune|mumbai|bangalore|bengaluru|delhi|hyderabad|chennai|kolkata|noida|gurgaon|gurugram|new york|san francisco|london|berlin|tokyo)\b/i;
// Date-range patterns we treat as significant: at minimum "Month YYYY - Month YYYY",
// "MM/YYYY - MM/YYYY", "YYYY-MM - YYYY-MM", or bare "YYYY - YYYY".  We accept
// "Present"/"Current"/"Now" as a closing token.  The detector is lenient on
// surrounding parentheses because the seema-ats fixture wraps date ranges in
// parens — e.g. "(Dec 2022 - Present)".
const DATE_TOKEN = '(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\s+\\d{4}|\\d{1,2}[/\\-]\\d{4}|(?:19|20)\\d{2}(?:[-/]\\d{1,2})?)';
const PRESENT_TOKEN = '(?:present|current|now|till\\s*date)';
const DATE_RANGE_RE = new RegExp(`\\(?\\s*(${DATE_TOKEN})\\s*(?:-|to|–|—|â€”|â€“)\\s*(${PRESENT_TOKEN}|${DATE_TOKEN})\\s*\\)?`, 'gi');
function normalizeForCompare(token) {
    return String(token || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function containsLooseSubstring(haystack, needle) {
    const hayNorm = normalizeForCompare(haystack);
    const needleNorm = normalizeForCompare(needle);
    if (!needleNorm)
        return true;
    return hayNorm.includes(needleNorm);
}
function extractRawDateRanges(rawText) {
    const matches = Array.from(rawText.matchAll(DATE_RANGE_RE)).map((m) => m[0].trim());
    // Dedup by canonical form
    const seen = new Set();
    const out = [];
    for (const m of matches) {
        const key = normalizeForCompare(m);
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        out.push(m);
    }
    return out;
}
function rangeIsRepresented(range, extracted) {
    const rangeNorm = normalizeForCompare(range);
    if (!rangeNorm)
        return true;
    const candidates = [];
    for (const exp of extracted.experience) {
        candidates.push(`${exp.startDate} ${exp.endDate}`);
    }
    for (const edu of extracted.education) {
        candidates.push(`${edu.startDate} ${edu.endDate}`);
    }
    for (const candidate of candidates) {
        const cNorm = normalizeForCompare(candidate);
        if (!cNorm)
            continue;
        // Accept either order and partial match against the canonical form.
        const tokens = rangeNorm.split(' ').filter(Boolean);
        if (tokens.length === 0)
            continue;
        const matchCount = tokens.filter((t) => cNorm.includes(t)).length;
        if (matchCount === tokens.length)
            return true;
    }
    // Special case: "present"/"current" maps to "Present" in extracted output.
    if (/present|current|now|till\s*date/i.test(range)) {
        if (extracted.experience.some((e) => /present/i.test(e.endDate || ''))) {
            // Verify the start of the range matches too.
            const start = range.match(new RegExp(DATE_TOKEN, 'i'))?.[0] || '';
            if (!start)
                return true;
            const startNorm = normalizeForCompare(start);
            return extracted.experience.some((e) => normalizeForCompare(`${e.startDate}`).includes(startNorm));
        }
    }
    return false;
}
function findCandidateName(rawText) {
    const lines = rawText.split('\n').slice(0, 8).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
        if (NAME_LINE_RE.test(line))
            return line;
        // Also accept ALL CAPS multi-word names ("SEEMA ALMAS YUNUS SHAIKH")
        if (/^[\p{Lu}][\p{Lu}'\-]+(\s+[\p{Lu}][\p{Lu}'\-]+){1,4}$/u.test(line) && line.length <= 56)
            return line;
    }
    return '';
}
/**
 * Score how well the structured resume matches the raw text it was
 * extracted from.  Higher = better fidelity.  See file header for design.
 */
function verifyExtraction(rawText, extracted) {
    const issues = [];
    const text = String(rawText || '');
    // -----------------------------------------------------------------------
    // Contact: only flag when the raw text plainly contains the field but the
    // extractor did not surface it.
    // -----------------------------------------------------------------------
    const candidateName = findCandidateName(text);
    if (candidateName && !extracted.contact?.fullName) {
        issues.push({ kind: 'missing-name', detail: candidateName });
    }
    if (!extracted.contact?.email) {
        const emailMatch = text.match(EMAIL_RE);
        if (emailMatch)
            issues.push({ kind: 'missing-email', detail: emailMatch[0] });
    }
    if (!extracted.contact?.phone) {
        // Require at least 9 digits to avoid matching short IDs / years / zip codes.
        const phoneMatch = text.match(PHONE_RE);
        if (phoneMatch && (phoneMatch[0].replace(/\D/g, '').length >= 9)) {
            issues.push({ kind: 'missing-phone', detail: phoneMatch[0].trim() });
        }
    }
    if (!extracted.contact?.location) {
        if (LOCATION_RE.test(text)) {
            const m = text.match(LOCATION_RE);
            issues.push({ kind: 'missing-location', detail: m?.[0] || '' });
        }
    }
    // -----------------------------------------------------------------------
    // Experience: every entry must carry both a role AND a company. Phantom
    // entries (role is just "(" or skill-label company) score worst.
    // -----------------------------------------------------------------------
    for (const exp of extracted.experience) {
        const company = String(exp.company || '').trim();
        const role = String(exp.role || '').trim();
        if (!company && role)
            issues.push({ kind: 'experience-without-company', detail: role });
        if (!role && company)
            issues.push({ kind: 'experience-without-role', detail: company });
        // Phantom experience detection: role is non-alphanumeric or company is a
        // section label.
        const roleHasContent = /[A-Za-z0-9]{2,}/.test(role);
        const companyIsSection = /^\s*(soft|technical|hard|core|key)\s+(skills?|competencies)\b/i.test(company)
            || /^\s*(summary|education|experience|certifications|languages|achievements|hobbies)\s*$/i.test(company);
        if (!roleHasContent || companyIsSection) {
            issues.push({ kind: 'phantom-experience', detail: `${role} @ ${company}` });
        }
    }
    // Heuristic: if the text clearly describes a career (has ≥ 2 date ranges
    // AND a WORK EXPERIENCE-ish heading) but the mapper returned zero entries,
    // re-extraction is warranted.
    const dateRanges = extractRawDateRanges(text);
    const hasExperienceHeading = /\b(work\s+experience|professional\s+experience|employment\s+history|experience)\b/i.test(text);
    if (dateRanges.length >= 2 && hasExperienceHeading && extracted.experience.length === 0) {
        issues.push({ kind: 'no-experience-extracted', detail: `text has ${dateRanges.length} date ranges` });
    }
    // -----------------------------------------------------------------------
    // Orphaned date ranges: a date range in the raw text that no experience or
    // education entry uses. Allow up to one orphan (the certification year /
    // achievements year is commonly an orphan and harmless).
    // -----------------------------------------------------------------------
    const orphans = [];
    for (const range of dateRanges) {
        if (!rangeIsRepresented(range, extracted))
            orphans.push(range);
    }
    const orphansToFlag = orphans.slice(1);
    for (const orphan of orphansToFlag) {
        issues.push({ kind: 'orphan-date-range', detail: orphan });
    }
    // -----------------------------------------------------------------------
    // Education: if the text has a clear EDUCATION section AND mentions a
    // degree-shaped token, but no education entry was produced, flag it.
    // -----------------------------------------------------------------------
    const hasEducationHeading = /\beducation\b/i.test(text);
    const hasDegreeToken = /\b(b\.?e\.?|b\.?tech|b\.?sc|m\.?e\.?|m\.?tech|m\.?sc|m\.?b\.?a|ph\.?d\.?|bachelor|master|doctorate|diploma)\b/i.test(text);
    if (hasEducationHeading && hasDegreeToken && extracted.education.length === 0) {
        issues.push({ kind: 'no-education-extracted', detail: 'education heading + degree token present' });
    }
    // -----------------------------------------------------------------------
    // Confidence: weighted penalty per issue kind. Tuned so a single missing
    // location (low signal) costs less than a phantom experience (high signal).
    // -----------------------------------------------------------------------
    const WEIGHTS = {
        'missing-name': 0.15,
        'missing-email': 0.10,
        'missing-phone': 0.08,
        'missing-location': 0.04,
        'orphan-date-range': 0.10,
        'phantom-experience': 0.25,
        'experience-without-role': 0.20,
        'experience-without-company': 0.20,
        'no-experience-extracted': 0.40,
        'no-education-extracted': 0.10,
    };
    const basePenalty = issues.reduce((acc, issue) => acc + (WEIGHTS[issue.kind] ?? 0.05), 0);
    // Additional penalty when orphan date ranges outnumber the extracted
    // experience entries — that's the "we dropped entries" signal, and the
    // per-issue weight alone underrates it because each orphan is the same
    // 0.10 regardless of how badly the count diverges from the source.
    let coveragePenalty = 0;
    if (orphansToFlag.length > 0) {
        const totalDated = Math.max(1, dateRanges.length);
        const orphanRatio = orphansToFlag.length / totalDated;
        // Up to +0.4 penalty when nearly every date range is orphaned.
        coveragePenalty = 0.4 * orphanRatio;
    }
    const confidence = Math.max(0, Math.min(1, 1 - basePenalty - coveragePenalty));
    const shouldReExtract = confidence < 0.55;
    return {
        ok: issues.length === 0,
        issues,
        confidence,
        shouldReExtract,
    };
}
/**
 * Pick the better of two candidate extractions based on their verification
 * reports.  When confidence is tied (or both have major gaps), prefer the
 * candidate with more experience entries — most failure modes manifest as
 * "we dropped entries", so more-is-better is the safe tiebreaker.
 */
function pickBetterExtraction(primary, alternative, primaryReport, alternativeReport) {
    if (alternativeReport.confidence > primaryReport.confidence + 0.05) {
        return { winner: alternative, report: alternativeReport, usedAlternative: true };
    }
    if (primaryReport.confidence > alternativeReport.confidence + 0.05) {
        return { winner: primary, report: primaryReport, usedAlternative: false };
    }
    // Close call: prefer more experience entries, then more education entries.
    if (alternative.experience.length > primary.experience.length) {
        return { winner: alternative, report: alternativeReport, usedAlternative: true };
    }
    if (primary.experience.length > alternative.experience.length) {
        return { winner: primary, report: primaryReport, usedAlternative: false };
    }
    if (alternative.education.length > primary.education.length) {
        return { winner: alternative, report: alternativeReport, usedAlternative: true };
    }
    return { winner: primary, report: primaryReport, usedAlternative: false };
}
