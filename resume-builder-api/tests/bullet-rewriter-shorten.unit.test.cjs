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

test('an in-range bullet still gets verb-swapped variants (unchanged behavior)', () => {
  const alts = ruleBasedRewrites('Managed a team of five engineers.');
  assert.equal(alts.length, 3);
  assert.ok(alts.some((a) => /^Led|^Drove|^Built|^Delivered/.test(a)));
});

test('empty input returns no alternatives', () => {
  assert.deepEqual(ruleBasedRewrites('   '), []);
});
