const assert = require('node:assert/strict');
const test = require('node:test');
const {
  compilePattern,
  validateProposal,
} = require('../dist/pattern-learner/pattern-validator.js');
const { redactPII } = require('../dist/pattern-learner/redact.js');

test('compilePattern rejects empty pattern', () => {
  assert.throws(() => compilePattern({ kind: 'x', pattern: '', flags: 'i', patternType: 'regex' }));
});

test('compilePattern rejects nested quantifier shapes', () => {
  assert.throws(() =>
    compilePattern({ kind: 'x', pattern: '(a+)+b', flags: 'i', patternType: 'regex' }),
  );
});

test('compilePattern accepts a safe pattern', () => {
  const re = compilePattern({
    kind: 'experience.dateRange',
    pattern: '\\d{4}\\s*-\\s*\\d{4}',
    flags: 'i',
    patternType: 'regex',
  });
  assert.ok(re instanceof RegExp);
});

test('validateProposal flags regression on clean sample', () => {
  const target = { id: 't1', redactedText: 'Dec 2022 to Present', confidence: 0.4 };
  const corpus = [
    target,
    { id: 'c1', redactedText: 'Dec 2022 to Present', confidence: 0.95 },
  ];
  const result = validateProposal(
    { kind: 'experience.dateRange', pattern: 'Dec\\s+2022', flags: 'i', patternType: 'regex' },
    target,
    corpus,
  );
  assert.equal(result.ok, false);
  assert.ok(result.metrics.regressionCount >= 1);
});

test('validateProposal accepts a pattern that only matches the target', () => {
  const target = { id: 't1', redactedText: 'WORKED-DURING: 2022/04 — 2024/11', confidence: 0.3 };
  const corpus = [
    target,
    { id: 'c1', redactedText: 'Software Engineer at Acme — Mar 2020 to Present', confidence: 0.95 },
  ];
  const result = validateProposal(
    { kind: 'experience.dateRange', pattern: 'WORKED-DURING:\\s*\\d{4}/\\d{2}', flags: 'i', patternType: 'regex' },
    target,
    corpus,
  );
  assert.equal(result.ok, true);
  assert.equal(result.metrics.regressionCount, 0);
});

test('redactPII strips emails, phones, urls', () => {
  const out = redactPII('Contact: jane.doe@example.com, +1 415-555-0100, https://foo.bar/baz');
  assert.ok(!out.includes('jane.doe@example.com'));
  assert.ok(!out.includes('415'));
  assert.ok(!out.includes('https://foo.bar'));
  assert.ok(out.includes('<EMAIL>'));
  assert.ok(out.includes('<PHONE>'));
  assert.ok(out.includes('<URL>'));
});
