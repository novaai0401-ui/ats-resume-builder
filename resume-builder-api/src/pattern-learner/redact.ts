/**
 * Strip personally-identifying tokens from raw resume text before storing it
 * as a learning sample. Replaces emails, phones, long digit runs and URLs
 * with stable placeholders so regex shapes remain visible to the LLM
 * proposer.
 *
 * R-112 — names are redacted too. This function used to strip everything
 * BUT the name, so the most obviously identifying string on a resume, the
 * one at the very top in bold, survived into stored samples while /privacy
 * described the data as redacted.
 *
 * Two passes, because neither alone is sufficient:
 *  - `knownNames`: the account holder's own name, which the caller knows
 *    exactly. Precise, and covers the name wherever it appears (header,
 *    "References: ...", a signature line).
 *  - a header heuristic for the resume's own title line, which catches the
 *    common case where the file's name differs from the account's.
 *
 * This is redaction, not anonymisation: third-party names in prose (a
 * manager, a co-author) are not detected without real NER. Say that
 * plainly wherever we describe it rather than implying more.
 */
export function redactPII(text: string, options: { knownNames?: string[] } = {}): string {
  // Order matters. Structured patterns run FIRST: a name substituted inside
  // "priya.sharma@example.com" would leave "<NAME>.<NAME>@example.com",
  // which no longer matches the email pattern — so the domain would leak
  // and the token would never be tagged <EMAIL>.
  let out = String(text || '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<EMAIL>')
    .replace(/\+?\d[\d\s().\-]{8,}\d/g, '<PHONE>')
    .replace(/\b\d{6,}\b/g, '<NUM>')
    .replace(/https?:\/\/\S+/gi, '<URL>');

  for (const raw of options.knownNames || []) {
    const name = String(raw || '').trim();
    if (name.length < 3) continue;
    // Whole name first, then each part, so "Priya Sharma" and a later bare
    // "Priya" both go. Parts under 3 chars are skipped — initials would
    // shred unrelated words.
    const parts = [name, ...name.split(/\s+/)].filter((p) => p.length >= 3);
    for (const part of parts) {
      out = out.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'), '<NAME>');
    }
  }

  return redactHeaderName(out).slice(0, 8000);
}

/** Section headings that look like names but aren't. */
const HEADING_WORDS = new Set([
  'resume', 'curriculum', 'vitae', 'cv', 'profile', 'summary', 'objective',
  'experience', 'education', 'skills', 'projects', 'certifications',
  'achievements', 'contact', 'references', 'languages', 'publications',
]);

/**
 * Redact a person's name on the first few lines of a resume. Conservative:
 * two to four capitalised words, no digits, not a known heading. A missed
 * name is a privacy failure, a false positive costs the model one token of
 * layout signal — so the bias is deliberate, but bounded to the header
 * where a bare name is overwhelmingly likely to BE the candidate.
 */
function redactHeaderName(text: string): string {
  const lines = text.split(/\r?\n/);
  const limit = Math.min(lines.length, 5);
  for (let i = 0; i < limit; i += 1) {
    const line = lines[i].trim();
    if (!line || line.length > 60) continue;
    if (/\d|@|https?:/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (words.some((w) => HEADING_WORDS.has(w.toLowerCase().replace(/[^a-z]/gi, '')))) continue;
    if (!words.every((w) => /^[A-Z][\p{L}'’.-]*$/u.test(w))) continue;
    lines[i] = lines[i].replace(line, '<NAME>');
    break;
  }
  return lines.join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
