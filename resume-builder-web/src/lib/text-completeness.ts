/**
 * Heuristic checks for resume text that LOOKS like it was truncated or
 * left as a fragment. Used by the editor to flag suspicious extracted
 * content so the user notices and edits it instead of submitting
 * mid-sentence prose to a recruiter.
 *
 * The detector is intentionally conservative: false positives nag the
 * user, false negatives are silent. We require multiple signals
 * before raising the alarm.
 */

/** Words that almost never end a complete English sentence. */
const TRAILING_CONNECTOR_WORDS = new Set([
  'and', 'or', 'but', 'so', 'because', 'although', 'though', 'while',
  'when', 'where', 'which', 'who', 'whom', 'whose', 'that', 'than',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'into', 'onto', 'about', 'between', 'among', 'through', 'across',
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'their', 'its',
  'my', 'our', 'his', 'her', 'your',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'will', 'would', 'shall', 'should', 'may',
  'might', 'can', 'could', 'must',
]);

export interface IncompleteTextSignal {
  /** True if the text shows at least one strong incompleteness signal. */
  looksIncomplete: boolean;
  /** Short user-facing explanation, '' if not flagged. */
  reason: string;
}

/**
 * Returns a signal describing whether a free-form text field (resume
 * summary, education detail, project description, etc.) looks
 * truncated. Empty / very short text returns `looksIncomplete: false`
 * because that's a different problem (missing content, not truncated
 * content) handled by length-based validators elsewhere.
 */
export function detectIncompleteText(input: string | null | undefined): IncompleteTextSignal {
  const text = String(input || '').trim();
  // Need at least one sentence's worth before mid-sentence detection
  // makes sense. Below this length the section-length validator owns
  // the message.
  if (text.length < 60) return { looksIncomplete: false, reason: '' };

  const lastChar = text.slice(-1);
  const endsInTerminator = /[.!?]/.test(lastChar) || /["')\]]/.test(lastChar);

  // Compute the last word, stripping any trailing comma or whitespace.
  const tokens = text
    .replace(/[\s,;:]+$/, '')
    .split(/\s+/);
  const lastWord = (tokens[tokens.length - 1] || '').toLowerCase().replace(/[^a-z]/g, '');

  if (!endsInTerminator) {
    if (TRAILING_CONNECTOR_WORDS.has(lastWord)) {
      return {
        looksIncomplete: true,
        reason: `Looks truncated — ends with the word "${lastWord}". Add the missing finish before saving.`,
      };
    }
    // No terminator AND last word ends in a comma or semicolon — the
    // text was clearly cut mid-list.
    if (/[,;]$/.test(text)) {
      return {
        looksIncomplete: true,
        reason: 'Looks truncated — ends with a comma or semicolon. Complete the thought before saving.',
      };
    }
  }

  // Hanging "with X, Y," at the end (two consecutive commas near the
  // end with no closing word) — common pattern in extracted summaries
  // where a list was clipped.
  const tail = text.slice(-80);
  if (/,\s*[A-Za-z][A-Za-z\-]+\s*,?\s*$/.test(tail) && !endsInTerminator) {
    return {
      looksIncomplete: true,
      reason: 'Looks truncated — final list item lacks a closing phrase.',
    };
  }

  return { looksIncomplete: false, reason: '' };
}
