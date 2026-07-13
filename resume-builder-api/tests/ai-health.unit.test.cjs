const assert = require('node:assert/strict');
const test = require('node:test');
const { AiHealthService, buildAiHint } = require('../dist/admin/ai-health.service.js');

// R-085 — the admin AI-key health check. These pin the "is our Groq key
// working?" contract: honest configured/reachable reporting, a live-handshake
// verify that NEVER silently reports ok when no key is set, and a hint that
// maps Groq's common failure codes to an action. Never leaks the key.

function cfg(map) {
  return { get: (k, d) => (map[k] !== undefined ? map[k] : d) };
}

test('getStatus: missing GROQ_API_KEY → not configured with a clear reason', () => {
  const s = new AiHealthService(cfg({})).getStatus();
  assert.equal(s.configured, false);
  assert.equal(s.keyPresent, false);
  assert.match(s.reason, /GROQ_API_KEY/);
  assert.equal(s.model, 'llama-3.3-70b-versatile'); // default surfaced
});

test('getStatus: key present + default provider → configured, no reason', () => {
  const s = new AiHealthService(cfg({ GROQ_API_KEY: 'gsk_' + 'a'.repeat(50) })).getStatus();
  assert.equal(s.configured, true);
  assert.equal(s.keyPresent, true);
  assert.equal(s.reason, '');
});

test('getStatus: non-groq provider is flagged (this check only covers Groq)', () => {
  const s = new AiHealthService(cfg({ AI_PROVIDER: 'xai', GROQ_API_KEY: '' })).getStatus();
  assert.equal(s.configured, false);
  assert.match(s.reason, /not "groq"/);
});

test('getStatus surfaces a custom GROQ_MODEL', () => {
  const s = new AiHealthService(cfg({ GROQ_API_KEY: 'gsk_x'.padEnd(44, 'x'), GROQ_MODEL: 'llama-3.1-8b-instant' })).getStatus();
  assert.equal(s.model, 'llama-3.1-8b-instant');
});

test('verify: no provider → ok:false, never a false positive (C-004)', async () => {
  // Pass an explicit null provider so no network call happens.
  const v = await new AiHealthService(cfg({})).verify(null);
  assert.equal(v.ok, false);
  assert.match(v.error, /No server AI provider/);
  assert.equal(v.latencyMs, null);
});

test('verify: a working provider stub → ok:true with latency', async () => {
  const stub = { name: 'groq', complete: async () => '{"status":"ok"}' };
  const v = await new AiHealthService(cfg({ GROQ_API_KEY: 'gsk_' + 'a'.repeat(50) })).verify(stub);
  assert.equal(v.ok, true);
  assert.equal(v.error, null);
  assert.equal(typeof v.latencyMs, 'number');
});

test('verify: a throwing provider → ok:false and the key is scrubbed from the error', async () => {
  const leaky = { name: 'groq', complete: async () => { throw new Error('Groq API 401 with Bearer gsk_secretkey1234567890'); } };
  const v = await new AiHealthService(cfg({})).verify(leaky);
  assert.equal(v.ok, false);
  assert.doesNotMatch(v.error, /gsk_secretkey/);
  assert.match(v.error, /401/);
});

test('buildAiHint maps Groq failure codes to actionable guidance', () => {
  const okStatus = { configured: true, model: 'llama-3.3-70b-versatile', keyPresent: true, provider: 'groq', reason: '' };
  assert.match(buildAiHint(okStatus, { ok: false, error: 'Groq API 401: invalid_api_key', model: 'm', latencyMs: 1 }), /rejected it \(401\)/);
  assert.match(buildAiHint(okStatus, { ok: false, error: 'Groq API 404: model_not_found', model: 'm', latencyMs: 1 }), /not available/);
  assert.match(buildAiHint(okStatus, { ok: false, error: 'Groq API 429: rate limit', model: 'm', latencyMs: 1 }), /rate\/quota/);
  assert.match(buildAiHint(okStatus, { ok: true, error: null, model: 'llama-3.3-70b-versatile', latencyMs: 42 }), /working/);
});
