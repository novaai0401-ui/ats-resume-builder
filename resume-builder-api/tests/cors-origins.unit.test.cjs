const assert = require('node:assert/strict');
const test = require('node:test');
const { isOriginAllowed, parseAllowedOrigins } = require('../dist/cors-origins.js');

// Regression: the production web app on the custom domain
// https://callbackcv.tekivex.com was blocked by CORS (preflight 404) because
// the origin wasn't in CORS_ORIGIN. The brand domain is now allowed in code.
const RENDER = ['https://ats-rb-web.onrender.com'];

test('the production custom domain is allowed even if CORS_ORIGIN omits it', () => {
  assert.equal(isOriginAllowed('https://callbackcv.tekivex.com', RENDER), true);
  assert.equal(isOriginAllowed('https://tekivex.com', RENDER), true);
  assert.equal(isOriginAllowed('https://staging.tekivex.com', RENDER), true);
});

test('exact CORS_ORIGIN entries and Render preview deploys still work', () => {
  assert.equal(isOriginAllowed('https://ats-rb-web.onrender.com', RENDER), true);
  assert.equal(isOriginAllowed('https://ats-rb-web-pr-42.onrender.com', RENDER), true);
});

test('unrelated / spoofed origins are rejected', () => {
  assert.equal(isOriginAllowed('https://tekivex.com.evil.com', RENDER), false);
  assert.equal(isOriginAllowed('https://eviltekivex.com', RENDER), false);
  assert.equal(isOriginAllowed('http://callbackcv.tekivex.com', RENDER), false, 'http (non-TLS) brand origin is not auto-allowed');
  assert.equal(isOriginAllowed('https://example.com', RENDER), false);
});

test('parseAllowedOrigins splits env and falls back to localhost', () => {
  assert.deepEqual(parseAllowedOrigins('https://a.com, https://b.com'), ['https://a.com', 'https://b.com']);
  assert.deepEqual(parseAllowedOrigins(''), ['http://localhost:4000', 'http://localhost:4001']);
});
