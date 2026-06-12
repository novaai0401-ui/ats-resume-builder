const assert = require('node:assert/strict');
const test = require('node:test');
const { __testables } = require('../dist/referrals/referrals.service.js');

/**
 * R-037 referral-credit contract tests (pure helpers).
 *
 * The integration loop (referred signup → +1 credit → credit buys an
 * export past the cap → anti-abuse rules) is smoke-verified against
 * the local stack; these pin the deterministic pieces:
 *   - code shape (8 chars, unambiguous alphabet) — codes get read
 *     aloud and typed from phone screens
 *   - deterministic code per user (stable across calls, support can
 *     re-derive it)
 *   - email/IP hashing is deterministic and never returns raw input
 */

const { deterministicCode, randomCode, hashEmail, hashIp, CODE_ALPHABET, IP_CREDIT_CAP } = __testables;

test('deterministic code: 8 chars from the unambiguous alphabet', () => {
  const code = deterministicCode('user-123');
  assert.equal(code.length, 8);
  for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), `unexpected char ${ch}`);
  assert.doesNotMatch(code, /[01lo]/);
});

test('deterministic code is stable for the same user and differs across users', () => {
  assert.equal(deterministicCode('user-123'), deterministicCode('user-123'));
  assert.notEqual(deterministicCode('user-123'), deterministicCode('user-124'));
});

test('random code: correct shape and 100/100 unique draws', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) {
    const code = randomCode();
    assert.equal(code.length, 8);
    seen.add(code);
  }
  assert.equal(seen.size, 100);
});

test('email hash is case/whitespace-insensitive and never echoes the input', () => {
  const a = hashEmail('Friend@Test.io');
  const b = hashEmail('  friend@test.io  ');
  assert.equal(a, b, 'same email in different casing must hash identically');
  assert.doesNotMatch(a, /friend|test\.io/i);
  assert.equal(a.length, 32);
});

test('ip hash is deterministic and never echoes the input', () => {
  const h = hashIp('203.0.113.77');
  assert.equal(h, hashIp('203.0.113.77'));
  assert.doesNotMatch(h, /203\.0\.113\.77/);
  assert.equal(h.length, 24);
});

test('per-IP credit cap matches the documented acceptance (3 per window)', () => {
  assert.equal(IP_CREDIT_CAP, 3);
});
