const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseAlternatives,
  ruleBasedRewrites,
} = require('../dist/ai/bullet-rewriter.service.js');

// ─────────────────────────────────────────────────────────────────────
// Unit tests for the AI Bullet Rewriter helpers. The DI'd `rewrite`
// method needs Prisma + Settings + Config and is exercised by the
// e2e suite; these tests pin the pure parsing / fallback logic.
// ─────────────────────────────────────────────────────────────────────

test('parseAlternatives extracts a clean JSON array', () => {
  const raw = '["Led the rollout", "Built the rollout", "Drove the rollout"]';
  assert.deepEqual(parseAlternatives(raw), [
    'Led the rollout',
    'Built the rollout',
    'Drove the rollout',
  ]);
});

test('parseAlternatives strips markdown fences before parsing', () => {
  const raw = '```json\n["Designed the API", "Architected the API"]\n```';
  const out = parseAlternatives(raw);
  assert.equal(out.length, 2);
  assert.equal(out[0], 'Designed the API');
});

test('parseAlternatives ignores commentary outside the array', () => {
  const raw = 'Here you go!\n["A", "B", "C"]\nLet me know.';
  assert.deepEqual(parseAlternatives(raw), ['A', 'B', 'C']);
});

test('parseAlternatives falls back to line-split when not JSON', () => {
  const raw = '1) Led the migration to Postgres.\n2) Drove the migration to Postgres.\n3) Engineered the migration to Postgres.';
  const out = parseAlternatives(raw);
  assert.equal(out.length, 3);
  assert.match(out[0], /^Led /);
});

test('parseAlternatives returns [] for empty / null', () => {
  assert.deepEqual(parseAlternatives(''), []);
  assert.deepEqual(parseAlternatives(null), []);
  assert.deepEqual(parseAlternatives(undefined), []);
});

test('ruleBasedRewrites returns three distinct variants', () => {
  const variants = ruleBasedRewrites('Responsible for migrating user accounts to OAuth.');
  assert.equal(variants.length, 3);
  const unique = new Set(variants.map((v) => v.toLowerCase()));
  assert.equal(unique.size, 3, 'all three variants should be distinct');
  // Each variant should start with a strong action verb (Led / Drove / Built / Delivered).
  for (const v of variants) {
    assert.match(v, /^(Led|Drove|Built|Delivered)\b/);
  }
});

test('ruleBasedRewrites preserves the rest of the bullet after the verb', () => {
  const variants = ruleBasedRewrites('Owned end-to-end delivery from requirements to production.');
  for (const v of variants) {
    assert.ok(
      v.toLowerCase().includes('end-to-end') || v.toLowerCase().includes('delivery'),
      `variant lost the original meaning: "${v}"`,
    );
  }
});

test('ruleBasedRewrites returns [] for empty input', () => {
  assert.deepEqual(ruleBasedRewrites(''), []);
  assert.deepEqual(ruleBasedRewrites('   '), []);
});

test('ruleBasedRewrites strips a leading bullet character', () => {
  const variants = ruleBasedRewrites('• Designed the new pricing page.');
  for (const v of variants) {
    assert.equal(v.startsWith('•'), false, `bullet char leaked into variant: "${v}"`);
  }
});
