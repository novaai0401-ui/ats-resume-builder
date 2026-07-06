/**
 * Client-side bullet helpers (pure, tested). Mirrors the API rule-based
 * shortener so a free/no-key user can fix an over-long bullet WITHOUT a
 * round-trip: the editor offers "Split into N bullets" which turns one
 * packed 50-word bullet into several concise single-idea bullets.
 */

export const BULLET_MAX_WORDS = 28;

export function wordCount(s: string): number {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

function tidy(piece: string): string {
  let s = piece.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');
  if (!s) return s;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
}

/**
 * Split one over-long bullet into several concise, single-idea bullets.
 * Sentence boundaries first; any sentence still over the limit is split
 * again on clause connectors (; , and/while/which/including…). Returns
 * the original (tidied) as a single-element array when nothing splits.
 */
export function splitBulletIntoBullets(bullet: string, maxWords = BULLET_MAX_WORDS): string[] {
  const text = String(bullet || '').trim();
  if (!text) return [];
  let parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((p) => p.trim()).filter(Boolean);
  parts = parts.flatMap((p) =>
    wordCount(p) <= maxWords
      ? [p]
      : p
          .split(/\s*(?:;|,\s+(?:and|while|which|including|and ensuring|and driving|and delivering))\s+/i)
          .map((c) => c.trim())
          .filter(Boolean),
  );
  const out = parts.map(tidy).filter((s) => wordCount(s) >= 2);
  return out.length ? out : [tidy(text)];
}

/**
 * Whether the editor should offer a Split action for this bullet: it is
 * over the word limit AND genuinely breaks into more than one piece.
 */
export function canSplitBullet(bullet: string, maxWords = BULLET_MAX_WORDS): boolean {
  if (wordCount(bullet) <= maxWords) return false;
  return splitBulletIntoBullets(bullet, maxWords).length >= 2;
}
