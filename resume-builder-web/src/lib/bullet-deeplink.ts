/**
 * Deep-link helpers connecting the Recruiter-AI Simulator's "missing
 * must-haves" to the resume editor, so a user can jump straight to fixing a
 * gap with the Bullet Rewriter instead of hunting for the right field.
 *
 * Pure + framework-free so it can be unit-tested and reused by the editor
 * (which reads the `addKeyword` param) and the simulator (which builds links).
 */

const ADD_KEYWORD_PARAM = 'addKeyword';
const MAX_KEYWORD_LENGTH = 60;

/** Build an editor URL that asks the editor to highlight a keyword to add. */
export function buildAddKeywordLink(keyword: string, resumeId?: string): string {
  const clean = sanitizeKeyword(keyword);
  if (!clean) return '';
  const params = new URLSearchParams();
  if (resumeId && resumeId.trim()) params.set('id', resumeId.trim());
  params.set(ADD_KEYWORD_PARAM, clean);
  return `/resume?${params.toString()}`;
}

/** Parse + sanitize the `addKeyword` value the editor receives. Null if empty. */
export function parseAddKeyword(raw: string | null | undefined): string | null {
  return sanitizeKeyword(raw ?? '') || null;
}

/**
 * Normalize a keyword for safe display + linking: trim, collapse internal
 * whitespace, drop angle brackets (markup/injection guard), and cap the
 * length so a malformed JD token can't blow up the URL or the banner.
 * Technical punctuation that real skills depend on is preserved, so
 * "c++", "c#", "node.js", and "ci/cd" survive intact.
 */
export function sanitizeKeyword(keyword: string): string {
  const stripped = String(keyword ?? '').split('<').join(' ').split('>').join(' ');
  return stripped.replace(/\s+/g, ' ').trim().slice(0, MAX_KEYWORD_LENGTH);
}
