"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADDITIONAL_TECH_SKILLS = void 0;
exports.extractEmail = extractEmail;
exports.extractPhone = extractPhone;
exports.normalizePhone = normalizePhone;
exports.isPlausiblePhone = isPlausiblePhone;
exports.extractLinks = extractLinks;
exports.classifyLink = classifyLink;
exports.normalizeDateFlexible = normalizeDateFlexible;
exports.extractAdditionalTechSkills = extractAdditionalTechSkills;
exports.hardenString = hardenString;
exports.isSafeUrl = isSafeUrl;
exports.extractSpokenLanguages = extractSpokenLanguages;
// ---------------------------------------------------------------------------
// Email extraction (handles obfuscated forms used to defeat scrapers)
// ---------------------------------------------------------------------------
const STANDARD_EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const EMAIL_OBFUSCATIONS = [
    [/\s*\(\s*at\s*\)\s*/gi, '@'],
    [/\s*\[\s*at\s*\]\s*/gi, '@'],
    [/\s+at\s+/gi, '@'],
    [/\s*\(\s*dot\s*\)\s*/gi, '.'],
    [/\s*\[\s*dot\s*\]\s*/gi, '.'],
    [/\s+dot\s+/gi, '.'],
];
function extractEmail(text) {
    if (!text)
        return '';
    const direct = text.match(STANDARD_EMAIL_RE);
    if (direct)
        return direct[0];
    let normalized = text;
    for (const [pattern, replacement] of EMAIL_OBFUSCATIONS) {
        normalized = normalized.replace(pattern, replacement);
    }
    const obfuscated = normalized.match(STANDARD_EMAIL_RE);
    return obfuscated ? obfuscated[0] : '';
}
// ---------------------------------------------------------------------------
// International phone extraction
// ---------------------------------------------------------------------------
// Match a wide variety of international phone formats:
//   +1 (555) 123-4567
//   +44 20 7946 0958
//   +91-9876543210
//   0091 98765 43210
//   (555) 123-4567
//   555.123.4567
const PHONE_PATTERNS = [
    /(?:\+|00)\d{1,3}[\s-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{0,4}/,
    /\(\d{2,4}\)\s*\d{3,4}[\s.-]?\d{3,4}/,
    /\b\d{3,4}[\s.-]\d{3,4}[\s.-]\d{3,4}\b/,
    /\b\d{10}\b/,
];
function extractPhone(text) {
    if (!text)
        return '';
    // Strip URLs first to prevent matching path digits
    const stripped = text.replace(/https?:\/\/\S+/gi, ' ');
    for (const pattern of PHONE_PATTERNS) {
        const match = stripped.match(pattern);
        if (!match)
            continue;
        const candidate = normalizePhone(match[0]);
        if (isPlausiblePhone(candidate))
            return candidate;
    }
    return '';
}
function normalizePhone(value) {
    return String(value || '')
        .replace(/[^\d+()\s.-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function isPlausiblePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    // Filter out year-only matches and ZIP codes (10 digits is typical mobile)
    if (digits.length < 7 || digits.length > 15)
        return false;
    // Reject all-same-digit (e.g. 0000000000)
    if (/^(\d)\1+$/.test(digits))
        return false;
    return true;
}
// ---------------------------------------------------------------------------
// Social / portfolio URL extraction
// ---------------------------------------------------------------------------
const URL_RE = /https?:\/\/[^\s)]+/gi;
const KNOWN_SOCIAL_HOSTS = [
    'linkedin.com',
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'stackoverflow.com',
    'medium.com',
    'dev.to',
    'kaggle.com',
    'hackerrank.com',
    'leetcode.com',
    'codepen.io',
    'behance.net',
    'dribbble.com',
    'twitter.com',
    'x.com',
    'youtube.com',
    'producthunt.com',
];
function extractLinks(text) {
    if (!text)
        return [];
    const found = new Set();
    const matches = text.match(URL_RE) || [];
    for (const raw of matches) {
        const cleaned = raw.replace(/[).,;]+$/g, '').trim();
        if (cleaned)
            found.add(cleaned);
    }
    // Also recover bare-host social profiles like "linkedin.com/in/jane"
    const bareHostRe = new RegExp('\\b((?:' + KNOWN_SOCIAL_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|') + ')\\/[A-Za-z0-9._\\-/]+)', 'gi');
    const bareMatches = text.match(bareHostRe) || [];
    for (const raw of bareMatches) {
        const cleaned = raw.replace(/[).,;]+$/g, '').trim();
        if (cleaned && !Array.from(found).some((f) => f.includes(cleaned))) {
            found.add(`https://${cleaned}`);
        }
    }
    return Array.from(found);
}
function classifyLink(url) {
    const lower = String(url || '').toLowerCase();
    if (lower.includes('linkedin.com'))
        return 'linkedin';
    if (lower.includes('github.com') || lower.includes('gitlab.com') || lower.includes('bitbucket.org'))
        return 'github';
    if (KNOWN_SOCIAL_HOSTS.some((h) => lower.includes(h)))
        return 'social';
    if (/portfolio|website|home|me\b|\.dev|\.io|\.me/.test(lower))
        return 'portfolio';
    return 'other';
}
// ---------------------------------------------------------------------------
// Date parsing — supports European DD/MM/YYYY and quarter notation
// ---------------------------------------------------------------------------
const QUARTER_RE = /\bQ([1-4])\s*[/-]?\s*((?:19|20)\d{2})\b/i;
const EURO_DATE_RE = /\b(0?[1-9]|[12]\d|3[01])[./-](0?[1-9]|1[0-2])[./-]((?:19|20)\d{2})\b/;
const ISO_DATE_RE = /\b((?:19|20)\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/;
function normalizeDateFlexible(token) {
    if (!token)
        return '';
    const cleaned = token.trim();
    if (/^(present|current|now|till\s*date|ongoing)$/i.test(cleaned))
        return 'Present';
    const quarter = cleaned.match(QUARTER_RE);
    if (quarter) {
        const monthIdx = (Number(quarter[1]) - 1) * 3; // 0,3,6,9
        const monthName = ['Jan', 'Apr', 'Jul', 'Oct'][monthIdx / 3];
        return `${monthName} ${quarter[2]}`;
    }
    const iso = cleaned.match(ISO_DATE_RE);
    if (iso) {
        return `${monthAbbr(Number(iso[2]))} ${iso[1]}`;
    }
    const euro = cleaned.match(EURO_DATE_RE);
    if (euro) {
        return `${monthAbbr(Number(euro[2]))} ${euro[3]}`;
    }
    return cleaned;
}
function monthAbbr(month) {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[Math.max(0, Math.min(11, month - 1))];
}
// ---------------------------------------------------------------------------
// Skills enrichment — modern AI/ML, cloud, mobile, data tooling
// ---------------------------------------------------------------------------
exports.ADDITIONAL_TECH_SKILLS = [
    // AI / ML / LLM
    'PyTorch', 'TensorFlow', 'Keras', 'JAX', 'scikit-learn', 'XGBoost', 'LightGBM',
    'Hugging Face', 'Transformers', 'LangChain', 'LlamaIndex', 'OpenAI', 'Anthropic',
    'Claude', 'GPT-4', 'GPT-5', 'Gemini', 'Llama', 'Mistral', 'Stable Diffusion',
    'RAG', 'Vector Database', 'Pinecone', 'Weaviate', 'Chroma', 'Milvus', 'Qdrant',
    'MLflow', 'Kubeflow', 'Airflow', 'DVC', 'Weights & Biases',
    // Data engineering
    'Spark', 'PySpark', 'Hadoop', 'Hive', 'Snowflake', 'Databricks', 'BigQuery',
    'Redshift', 'dbt', 'Fivetran', 'Tableau', 'Power BI', 'Looker', 'Superset',
    // Mobile
    'Flutter', 'React Native', 'SwiftUI', 'Jetpack Compose', 'Xamarin', 'Ionic',
    // Cloud & DevOps
    'AWS Lambda', 'EC2', 'S3', 'RDS', 'EKS', 'ECS', 'CloudFormation', 'Pulumi',
    'Helm', 'ArgoCD', 'Prometheus', 'Grafana', 'Datadog', 'New Relic', 'Splunk',
    'GitHub Actions', 'CircleCI', 'TravisCI', 'GitLab CI', 'Azure DevOps',
    // Backend frameworks
    'FastAPI', 'Quart', 'Sanic', 'Tornado', 'Phoenix', 'Elixir', 'Akka',
    'Micronaut', 'Quarkus', 'Vert.x', 'Ktor',
    // Frontend & build
    'Svelte', 'SvelteKit', 'Solid.js', 'Solid', 'Astro', 'Remix', 'Qwik',
    'Turbopack', 'Rollup', 'Parcel', 'esbuild', 'pnpm', 'Yarn',
    // Testing
    'Vitest', 'Testing Library', 'Puppeteer', 'WebdriverIO', 'TestCafe', 'k6',
    // Security / Auth
    'OAuth', 'OAuth2', 'OIDC', 'SAML', 'JWT', 'Auth0', 'Okta', 'Cognito',
    // Misc
    'WebRTC', 'Socket.io', 'Apollo', 'Hasura', 'Prisma', 'Drizzle', 'TypeORM',
    'Sequelize', 'SQLAlchemy', 'Alembic', 'Flyway', 'Liquibase',
];
function extractAdditionalTechSkills(text, knownSet) {
    if (!text)
        return [];
    const found = [];
    const seen = new Set(knownSet ? Array.from(knownSet).map((s) => s.toLowerCase()) : []);
    for (const skill of exports.ADDITIONAL_TECH_SKILLS) {
        const escaped = skill.replace(/[.+*?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, 'i');
        if (pattern.test(text)) {
            const key = skill.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                found.push(skill);
            }
        }
    }
    return found;
}
// ---------------------------------------------------------------------------
// String hardening — remove control characters, HTML/script tags, NULs
// (defense in depth: extracted text from PDFs / DOCX should never contain
// HTML, but malicious uploads might try to embed it)
// ---------------------------------------------------------------------------
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SCRIPT_TAG_RE = /<script[\s\S]*?<\/script>/gi;
const STYLE_TAG_RE = /<style[\s\S]*?<\/style>/gi;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const JS_PROTOCOL_RE = /javascript\s*:/gi;
const DATA_URL_HTML_RE = /data:text\/html[^,]*,/gi;
function hardenString(value) {
    if (typeof value !== 'string')
        return '';
    return value
        .replace(SCRIPT_TAG_RE, ' ')
        .replace(STYLE_TAG_RE, ' ')
        .replace(HTML_TAG_RE, ' ')
        .replace(JS_PROTOCOL_RE, ' ')
        .replace(DATA_URL_HTML_RE, ' ')
        .replace(CONTROL_CHARS_RE, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function isSafeUrl(url) {
    if (typeof url !== 'string' || !url)
        return false;
    if (JS_PROTOCOL_RE.test(url))
        return false;
    if (DATA_URL_HTML_RE.test(url))
        return false;
    // Allow http/https/mailto/tel and bare domain references
    return /^(https?:\/\/|mailto:|tel:|[A-Za-z0-9]+\.[A-Za-z]{2,})/i.test(url);
}
// ---------------------------------------------------------------------------
// Language detection (declared spoken languages, e.g. "English (Native)")
// ---------------------------------------------------------------------------
const LANGUAGE_NAMES = new Set([
    'english', 'hindi', 'marathi', 'tamil', 'telugu', 'kannada', 'malayalam',
    'bengali', 'gujarati', 'punjabi', 'urdu', 'sanskrit', 'odia',
    'spanish', 'french', 'german', 'italian', 'portuguese', 'dutch', 'russian',
    'mandarin', 'chinese', 'japanese', 'korean', 'arabic', 'hebrew', 'turkish',
    'polish', 'swedish', 'norwegian', 'danish', 'finnish', 'greek', 'czech',
    'thai', 'vietnamese', 'indonesian', 'malay', 'filipino', 'tagalog', 'swahili',
]);
const PROFICIENCY_TOKENS = /\b(native|fluent|professional|conversational|basic|intermediate|advanced|beginner|proficient|read|write|speak)\b/i;
function extractSpokenLanguages(lines) {
    const result = [];
    const seen = new Set();
    for (const rawLine of lines || []) {
        const line = String(rawLine || '');
        if (!line)
            continue;
        // Languages are typically comma- or pipe-separated, sometimes with proficiency in parens
        const tokens = line.split(/[,;|]/);
        for (const token of tokens) {
            const cleaned = token.trim().replace(/^[*•·\-]+/, '').trim();
            if (!cleaned)
                continue;
            const namePart = cleaned.replace(/\([^)]*\)/g, '').replace(/[-:].*$/, '').trim();
            const lang = namePart.toLowerCase();
            if (!LANGUAGE_NAMES.has(lang))
                continue;
            if (seen.has(lang))
                continue;
            seen.add(lang);
            const profMatch = cleaned.match(/\(([^)]+)\)/) || cleaned.match(/[-:]\s*(.+)$/);
            const proficiency = profMatch && PROFICIENCY_TOKENS.test(profMatch[1])
                ? profMatch[1].trim()
                : undefined;
            result.push({
                name: namePart.replace(/\b\w/g, (c) => c.toUpperCase()),
                proficiency,
            });
        }
    }
    return result;
}
