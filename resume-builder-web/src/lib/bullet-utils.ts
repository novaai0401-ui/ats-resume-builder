/**
 * Client-side bullet helpers (pure, tested). Mirrors the API rule-based
 * shortener so a free/no-key user can fix an over-long bullet WITHOUT a
 * round-trip: the editor offers "Split into N bullets" which turns one
 * packed 50-word bullet into several concise single-idea bullets, and a
 * "Shorten" that tightens it to one clean impact-first bullet.
 *
 * Keep this in sync with
 * `resume-builder-api/src/ai/bullet-rewriter.service.ts`.
 */

export const BULLET_MAX_WORDS = 28;

export function wordCount(s: string): number {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

/** Filler phrases we can drop without changing meaning. */
const FILLER_RE = /\b(responsible for|taking responsibility for|in order to|as well as|with a focus on|which included|including but not limited to|that helped to|in an effort to|so as to|with the goal of|for the purpose of|a variety of|a number of|various|successfully|effectively|efficiently|actively|closely|proactively|as needed|on a regular basis|from time to time|end to end|end-to-end)\b/gi;

const ACTION_VERBS = new Set(
  (
    'led managed built designed drove developed delivered launched created improved ' +
    'reduced increased grew owned architected implemented migrated optimized automated ' +
    'mentored coordinated established streamlined engineered spearheaded oversaw directed ' +
    'scaled shipped introduced integrated deployed refactored analyzed championed cut ' +
    'boosted accelerated enabled ensured maintained supported defined'
  ).split(' '),
);

const TITLE_TOKENS = /\b(vice president|president|director|manager|engineer|analyst|architect|officer|consultant|specialist|associate|intern|head|lead|principal|founder|owner|coordinator|administrator)\b/i;

const DANGLING_END = /\b(by|with|for|to|of|and|or|in|on|at|from|the|a|an|as|via|into|through|that|which|while)$/i;

function stripMarker(s: string): string {
  return String(s || '').replace(/^\s*(?:[•◦▪●*+\-]+|\d{1,3}[.)]|[a-z][.)])\s*/i, '').trim();
}

/** A leaked role/title clause like "Led an Assistant Vice President". */
function isRoleLeakClause(clause: string): boolean {
  const m = clause
    .trim()
    .match(/^(led|managed|was|served|worked|acted|promoted|reporting|reported|joined|hired)\s+(as\s+|to\s+)?(an?\s+|the\s+)?(.+)$/i);
  if (!m) return false;
  const rest = m[4].trim();
  return TITLE_TOKENS.test(rest) && wordCount(rest) <= 5;
}

/** A dangling/truncated fragment ("…recognized by") or a stub. */
function isDanglingFragment(clause: string): boolean {
  const w = clause.trim().replace(/[.,;:]+$/, '');
  if (wordCount(w) < 2) return true;
  return DANGLING_END.test(w);
}

/**
 * Break a sentence into clauses — commas/semicolons AND subordinate /
 * participial connectors ("while", "which", "including", …) so a long
 * single-sentence bullet still yields tightenable pieces.
 */
function splitClauses(sentence: string): string[] {
  const SENTINEL = '|||CLAUSE_BREAK|||';
  return sentence
    .replace(
      /\s+(while|whereby|thereby|which|including|so that|in order to|resulting in|leading to|such that)\s+/gi,
      `${SENTINEL}$1 `,
    )
    .replace(/\s*[;,]\s*/g, SENTINEL)
    .split(SENTINEL)
    .map((c) => c.trim())
    .filter(Boolean);
}

function dropFiller(s: string): string {
  return s
    .replace(FILLER_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*(?:and|while|which|that|including|also|then|plus|so that|in order to)\s+/i, '')
    .replace(/\s+,/g, ',')
    .trim();
}

function tidy(piece: string): string {
  let s = piece.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');
  if (!s) return s;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
}

function hasMetric(s: string): boolean {
  return /(\d|%|₹|\$)/.test(s);
}

function startsWithActionVerb(s: string): boolean {
  const w = s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  return ACTION_VERBS.has(w);
}

function candidateScore(s: string): number {
  let n = 0;
  if (startsWithActionVerb(s)) n += 2;
  if (hasMetric(s)) n += 3;
  if (wordCount(s) >= 6) n += 1;
  return n;
}

/**
 * Break the bullet into sentences → clauses, discard leaked-title,
 * dangling, and filler-only clauses, then greedily pack surviving
 * clauses into tidy single-idea bullets each within `maxWords`. `rank`
 * sorts impact-first (suggestions); leave it off to keep document order
 * (splitting).
 */
function buildBulletCandidates(bullet: string, maxWords: number, rank: boolean): string[] {
  const text = stripMarker(bullet);
  if (!text) return [];
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const sent of sentences) {
    const clauses = splitClauses(sent)
      .filter((c) => !isRoleLeakClause(c))
      .filter((c) => !isDanglingFragment(c))
      .map(dropFiller)
      .filter((c) => wordCount(c) >= 1);
    if (!clauses.length) continue;

    let group: string[] = [];
    let count = 0;
    const flush = () => {
      if (group.length) {
        candidates.push(tidy(group.join(', ')));
        group = [];
        count = 0;
      }
    };
    for (const c of clauses) {
      const wc = wordCount(c);
      if (wc > maxWords) {
        flush();
        candidates.push(tidy(c.split(/\s+/).slice(0, maxWords).join(' ')));
        continue;
      }
      if (count + wc > maxWords) flush();
      group.push(c);
      count += wc;
    }
    flush();
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (wordCount(c) >= 2 && wordCount(c) <= maxWords && !seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  if (rank) out.sort((a, b) => candidateScore(b) - candidateScore(a));
  return out;
}

/**
 * Split one over-long bullet into several concise, single-idea bullets
 * in document order. Returns the original (tidied) as a single element
 * when nothing meaningfully splits.
 */
export function splitBulletIntoBullets(bullet: string, maxWords = BULLET_MAX_WORDS): string[] {
  const text = String(bullet || '').trim();
  if (!text) return [];
  const out = buildBulletCandidates(text, maxWords, false);
  return out.length ? out : [tidy(stripMarker(text))].filter(Boolean);
}

/** Tighten one over-long bullet to a single clean ≤maxWords bullet. */
export function shortenBulletText(bullet: string, maxWords = BULLET_MAX_WORDS): string {
  const text = stripMarker(bullet);
  if (!text) return '';
  if (wordCount(text) <= maxWords) return text;
  const ranked = buildBulletCandidates(text, maxWords, true);
  if (ranked.length) return ranked[0];
  return tidy(text.replace(/[.!?]+$/, '').split(/\s+/).slice(0, maxWords).join(' '));
}

/**
 * Whether the editor should offer a Split action for this bullet: it is
 * over the word limit AND genuinely breaks into more than one piece.
 */
export function canSplitBullet(bullet: string, maxWords = BULLET_MAX_WORDS): boolean {
  if (wordCount(bullet) <= maxWords) return false;
  return splitBulletIntoBullets(bullet, maxWords).length >= 2;
}
