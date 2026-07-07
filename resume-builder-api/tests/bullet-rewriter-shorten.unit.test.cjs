const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ruleBasedRewrites,
  shortenBullet,
  splitLongBullet,
  BULLET_MAX_WORDS,
} = require('../dist/ai/bullet-rewriter.service.js');

const wc = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// The reported bug: a 53-word bullet's rule-based rewrites were still 53
// words (verb-swap only), so accepting one never cleared "Too long".
const LONG = 'Led an Assistant Vice President, owned technical leadership for the UI platform, taking responsibility for frontend architecture, system modernization, and delivery quality. Led architectural initiatives including framework upgrades, performance optimization, backend driven UI design, and microfrontend adoption, while mentoring engineers and ensuring alignment between business requirements, non functional requirements, and long-term platform stability.';

test('the reported 53-word bullet is over the limit', () => {
  assert.ok(wc(LONG) > BULLET_MAX_WORDS, `got ${wc(LONG)} words`);
});

test('rule-based rewrites of a long bullet are ALL within the word limit', () => {
  const alts = ruleBasedRewrites(LONG);
  assert.ok(alts.length >= 1, 'at least one alternative');
  for (const a of alts) {
    assert.ok(wc(a) <= BULLET_MAX_WORDS, `alternative too long (${wc(a)}): "${a}"`);
    assert.ok(wc(a) >= 3, `alternative too short: "${a}"`);
  }
});

test('shortenBullet returns a genuinely shorter, sentence-terminated bullet', () => {
  const s = shortenBullet(LONG);
  assert.ok(wc(s) <= BULLET_MAX_WORDS, `still too long: ${wc(s)}`);
  assert.match(s, /[.!?]$/);
  assert.match(s, /^[A-Z]/);
});

test('splitLongBullet breaks a multi-sentence bullet into concise pieces', () => {
  const pieces = splitLongBullet(LONG);
  assert.ok(pieces.length >= 2, `expected 2+ pieces, got ${pieces.length}`);
  for (const p of pieces) {
    assert.match(p, /[.!?]$/);
    assert.ok(wc(p) >= 2);
  }
});

test('rewrites do NOT echo the leaked "Assistant Vice President" job title', () => {
  const alts = ruleBasedRewrites(LONG);
  for (const a of alts) {
    assert.doesNotMatch(a, /assistant vice president/i, `leaked title should be dropped: "${a}"`);
  }
  assert.doesNotMatch(shortenBullet(LONG), /^led an assistant vice president/i);
});

test('rewrites read as clean clauses (capitalized, no dangling connector/comma)', () => {
  const alts = ruleBasedRewrites(LONG);
  for (const a of alts) {
    assert.match(a, /^[A-Z]/, `capitalized: "${a}"`);
    assert.doesNotMatch(a, /^(and|while|which|that|including)\b/i, `no leading connector: "${a}"`);
    assert.doesNotMatch(a, /,\s*[.!?]?$/, `no trailing comma: "${a}"`);
  }
});

// Real screenshot bullet: a single sentence that runs long. The engine
// must tighten it (drop the trailing clause), not just verb-swap it.
const SINGLE_SENTENCE_LONG =
  'Led and delivered a React-Redux modernization program for a legacy enterprise application, significantly improving runtime performance and application stability while achieving zero production defects and faster release cycles across engineering teams';

test('a long SINGLE-sentence bullet is genuinely tightened, not left full-length', () => {
  assert.ok(wc(SINGLE_SENTENCE_LONG) > BULLET_MAX_WORDS);
  const alts = ruleBasedRewrites(SINGLE_SENTENCE_LONG);
  assert.ok(alts.length >= 1);
  for (const a of alts) assert.ok(wc(a) <= BULLET_MAX_WORDS, `too long (${wc(a)}): "${a}"`);
  // The top rewrite must be strictly shorter than the original.
  assert.ok(wc(alts[0]) < wc(SINGLE_SENTENCE_LONG));
});

// Real screenshot bullet: an in-range bullet ending in a dangling,
// truncated fragment ("…the solution was recognized by").
const DANGLING =
  'Delivered a GenAI-based proof of concept for document analysis, integrating prompt-based AI APIs to identify missing or incomplete fields in editable PDF documents; the solution was recognized by';

test('a bullet ending in a dangling fragment is cleaned even when near the limit', () => {
  const alts = ruleBasedRewrites(DANGLING);
  assert.ok(alts.length >= 1);
  for (const a of alts) {
    assert.doesNotMatch(a, /recognized by\.?$/i, `dangling fragment should be dropped: "${a}"`);
    assert.doesNotMatch(a, /\b(by|with|for|to|of|and|as|via)\.?$/i, `no dangling ending: "${a}"`);
  }
});

test('a numeric/impact clause is surfaced first when present', () => {
  const withMetric =
    'Coordinated cross-team standups and status meetings across three time zones, reduced production incidents by 40% through proactive monitoring, and mentored five junior engineers on debugging discipline over the year';
  const alts = ruleBasedRewrites(withMetric);
  assert.ok(alts.length >= 1);
  assert.match(alts[0], /40%/, `metric clause should rank first: "${alts[0]}"`);
  assert.ok(wc(alts[0]) <= BULLET_MAX_WORDS);
});

test('filler phrases are dropped from shortened output', () => {
  const filler =
    'Was responsible for the successful and effective delivery of the customer onboarding portal in order to improve activation, working closely with a variety of stakeholders across product and design on a regular basis';
  const s = shortenBullet(filler);
  assert.doesNotMatch(s, /responsible for|successfully|in order to|a variety of|on a regular basis/i);
  assert.ok(wc(s) <= BULLET_MAX_WORDS);
});

test('an in-range bullet still gets verb-swapped variants (unchanged behavior)', () => {
  const alts = ruleBasedRewrites('Managed a team of five engineers.');
  assert.equal(alts.length, 3);
  assert.ok(alts.some((a) => /^Led|^Drove|^Built|^Delivered/.test(a)));
});

test('a clean in-range bullet is NOT mangled (no junk-tighten false positive)', () => {
  const clean = 'Mentored engineers, conducted design and code reviews, and ensured adherence to architectural standards.';
  const alts = ruleBasedRewrites(clean);
  assert.equal(alts.length, 3);
  // Verb-swap keeps the full clause list intact.
  for (const a of alts) assert.match(a, /architectural standards/i);
});

test('empty input returns no alternatives', () => {
  assert.deepEqual(ruleBasedRewrites('   '), []);
});
