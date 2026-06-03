const assert = require('node:assert/strict');
const test = require('node:test');
const { buildByokProvider, isByokProviderName } = require('../dist/ai/providers/byok-factory.js');

// The factory is the trust boundary for BYOK headers — anything not in
// the allowlist is rejected and the caller falls back to the shared
// operator key. These tests pin down the allowlist and the failure
// modes so a future refactor can't accidentally widen the surface.

test('builds a Groq provider when both headers are present and valid', () => {
  const p = buildByokProvider('groq', 'gsk_' + 'a'.repeat(50));
  assert.ok(p, 'expected a provider instance');
  assert.equal(p.name, 'groq');
});

test('builds an OpenAI provider for the openai header', () => {
  const p = buildByokProvider('openai', 'sk-' + 'x'.repeat(50));
  assert.ok(p);
  assert.equal(p.name, 'openai');
});

test('builds an Anthropic provider for the anthropic header', () => {
  const p = buildByokProvider('anthropic', 'sk-ant-' + 'y'.repeat(50));
  assert.ok(p);
  assert.equal(p.name, 'anthropic');
});

test('returns null when the provider header is missing', () => {
  assert.equal(buildByokProvider(null, 'gsk_' + 'a'.repeat(50)), null);
  assert.equal(buildByokProvider(undefined, 'gsk_' + 'a'.repeat(50)), null);
  assert.equal(buildByokProvider('', 'gsk_' + 'a'.repeat(50)), null);
});

test('returns null when the key header is missing', () => {
  assert.equal(buildByokProvider('groq', null), null);
  assert.equal(buildByokProvider('groq', ''), null);
  assert.equal(buildByokProvider('groq', '   '), null);
});

test('rejects unknown provider names (allowlist guard)', () => {
  // The header is attacker-controlled; we must not let it steer the
  // proxy at an arbitrary upstream.
  assert.equal(buildByokProvider('bing', 'key'), null);
  assert.equal(buildByokProvider('replicate', 'key'), null);
  assert.equal(buildByokProvider('http://evil.example.com', 'key'), null);
  assert.equal(buildByokProvider('__proto__', 'key'), null, 'prototype-pollution-style names rejected');
  assert.equal(buildByokProvider('constructor', 'key'), null);
});

test('provider name is normalised (lowercased + trimmed)', () => {
  const p = buildByokProvider('  GROQ  ', 'gsk_' + 'a'.repeat(50));
  assert.ok(p);
  assert.equal(p.name, 'groq');
});

test('isByokProviderName is true only for the three allowlist entries', () => {
  assert.equal(isByokProviderName('groq'), true);
  assert.equal(isByokProviderName('openai'), true);
  assert.equal(isByokProviderName('anthropic'), true);
  assert.equal(isByokProviderName('xai'), false);
  assert.equal(isByokProviderName(''), false);
});
