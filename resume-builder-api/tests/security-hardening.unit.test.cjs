const assert = require('node:assert/strict');
const test = require('node:test');
const { collectEnvIssues } = require('../dist/env-validation.js');
const { shouldSkipThrottle } = require('../dist/throttle/throttle.module.js');

// A production env with every hard-required secret set to a strong value.
function goodProdEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/app?sslmode=require',
    JWT_SECRET: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    JWT_REFRESH_SECRET: 'f0e1d2c3b4a5968778695a4b3c2d1e0fa9b8c7d6',
    CORS_ORIGIN: 'https://app.example.com',
    // warn-only infra intentionally set so the happy path is clean:
    TOKEN_ENC_KEY: '0123456789abcdef0123456789abcdef0123456789ab',
    REDIS_URL: 'rediss://cache.example.com:6379',
    REDIS_TOKEN: 'sometoken1234567890',
    ...overrides,
  };
}

// ── env validation ──────────────────────────────────────────────────────

test('a fully-configured production env passes clean', () => {
  const r = collectEnvIssues(goodProdEnv(), true);
  assert.equal(r.ok, true, `unexpected errors: ${r.errors.join('; ')}`);
  assert.equal(r.errors.length, 0);
});

test('missing JWT_SECRET is a HARD error in production', () => {
  const env = goodProdEnv();
  delete env.JWT_SECRET;
  const r = collectEnvIssues(env, true);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('JWT_SECRET')));
});

test('a weak/placeholder JWT secret is rejected in production', () => {
  const weak = collectEnvIssues(goodProdEnv({ JWT_SECRET: 'dev_secret_dev_secret_dev_secret_xx' }), true);
  assert.equal(weak.ok, false);
  assert.ok(weak.errors.some((e) => /JWT_SECRET/.test(e)));
});

test('missing CORS_ORIGIN is a hard error in production', () => {
  const env = goodProdEnv();
  delete env.CORS_ORIGIN;
  assert.equal(collectEnvIssues(env, true).ok, false);
});

test('missing REDIS/TOKEN_ENC_KEY are WARN-ONLY — never block the boot', () => {
  const env = goodProdEnv();
  delete env.REDIS_URL;
  delete env.REDIS_TOKEN;
  delete env.TOKEN_ENC_KEY;
  const r = collectEnvIssues(env, true);
  assert.equal(r.ok, true, `warn-only infra must not error: ${r.errors.join('; ')}`);
  assert.ok(r.warnings.some((w) => w.includes('REDIS_URL')));
  assert.ok(r.warnings.some((w) => w.includes('TOKEN_ENC_KEY')));
});

test('Stripe secret is only required once its webhook secret is set', () => {
  // Neither set → no Stripe complaint.
  assert.equal(collectEnvIssues(goodProdEnv(), true).ok, true);
  // Webhook set but secret missing → error.
  const r = collectEnvIssues(goodProdEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_live_abcdefghijklmnop' }), true);
  assert.ok(r.errors.some((e) => e.includes('STRIPE_SECRET_KEY')));
});

test('outside production, even missing critical secrets are only warnings', () => {
  const r = collectEnvIssues({ NODE_ENV: 'development' }, false);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.length > 0);
  assert.equal(r.errors.length, 0);
});

// ── throttle skip logic ─────────────────────────────────────────────────

test('throttling is enforced ONLY in production', () => {
  assert.equal(shouldSkipThrottle({ NODE_ENV: 'production' }), false);
  assert.equal(shouldSkipThrottle({ NODE_ENV: 'development' }), true);
  assert.equal(shouldSkipThrottle({}), true); // undefined NODE_ENV → skip
});

test('FORCE_DISABLE_RATE_LIMIT bypasses throttling even in production', () => {
  assert.equal(shouldSkipThrottle({ NODE_ENV: 'production', FORCE_DISABLE_RATE_LIMIT: 'true' }), true);
  assert.equal(shouldSkipThrottle({ NODE_ENV: 'production', FORCE_DISABLE_RATE_LIMIT: '1' }), true);
  assert.equal(shouldSkipThrottle({ NODE_ENV: 'production', FORCE_DISABLE_RATE_LIMIT: 'false' }), false);
});
