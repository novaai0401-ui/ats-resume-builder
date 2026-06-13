const assert = require('node:assert/strict');
const test = require('node:test');
const { __testables, hashKey, randomString } = require('../dist/public-api/api-keys.service.js');

/**
 * R-041 public-API helper tests.
 *
 * The integration loop (admin issues key → tenant calls /v1/parse|
 * score|tailor → usage logged → revoke → 401) is smoke-verified
 * against the live local stack. These tests pin the pieces that
 * have to stay correct across refactors:
 *   - keys are 32 chars from the unambiguous alphabet (read aloud
 *     in support conversations);
 *   - the SHA-256 hash is deterministic so authorise() can look up
 *     the row;
 *   - tenant slugs are normalised the same way on create + list so
 *     "Acme Inc!" and "acmeinc" don't fragment one tenant's usage.
 */

test('keys are 32 chars from the no-0/1/l/o alphabet', () => {
  const alpha = __testables.normalizeSlug ? 'abcdefghijkmnpqrstuvwxyz23456789' : 'abcdefghijkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 200; i += 1) {
    const k = randomString(32);
    assert.equal(k.length, 32);
    for (const ch of k) assert.ok(alpha.includes(ch), `unexpected char ${ch}`);
  }
});

test('key entropy: 200 random strings produce 200 unique values', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(randomString(32));
  assert.equal(seen.size, 200);
});

test('hashKey is deterministic and never echoes the plaintext', () => {
  const h1 = hashKey('pra_abcdefghijkmnpqrstuvwxyz23456789ab');
  const h2 = hashKey('pra_abcdefghijkmnpqrstuvwxyz23456789ab');
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  assert.doesNotMatch(h1, /pra_/);
});

test('tenant slug normalisation collapses casing + punctuation + length', () => {
  const { normalizeSlug } = __testables;
  assert.equal(normalizeSlug('Acme Inc!'), 'acmeinc');
  assert.equal(normalizeSlug('  Acme-Staffing  '), 'acme-staffing');
  assert.equal(normalizeSlug(''), 'default');
  // Length cap so a tenant can't poison the index with megaslugs.
  assert.equal(normalizeSlug('a'.repeat(200)).length, 60);
});

test('ipHash is deterministic and never echoes the IP', () => {
  const { hashIp } = __testables;
  assert.equal(hashIp('203.0.113.5'), hashIp('203.0.113.5'));
  assert.doesNotMatch(hashIp('203.0.113.5'), /203/);
  assert.equal(hashIp('203.0.113.5').length, 24);
});
