const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildLinkedInAuthUrl,
  normalizeLinkedInProfile,
  signOAuthState,
  verifyOAuthState,
} = require('../dist/auth/linkedin-oauth.service.js');

const SECRET = 'oauth-secret';

test('buildLinkedInAuthUrl includes required OAuth params', () => {
  const url = buildLinkedInAuthUrl({ clientId: 'cid', redirectUri: 'https://app/cb' }, 'state123');
  assert.ok(url.startsWith('https://www.linkedin.com/oauth/v2/authorization?'));
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('response_type'), 'code');
  assert.equal(params.get('client_id'), 'cid');
  assert.equal(params.get('redirect_uri'), 'https://app/cb');
  assert.equal(params.get('state'), 'state123');
  assert.equal(params.get('scope'), 'openid profile email');
});

test('normalizeLinkedInProfile uses name when present', () => {
  const p = normalizeLinkedInProfile({ sub: 'u1', email: 'A@Example.com', name: 'Ada Lovelace', email_verified: true });
  assert.equal(p.sub, 'u1');
  assert.equal(p.email, 'a@example.com');
  assert.equal(p.fullName, 'Ada Lovelace');
  assert.equal(p.emailVerified, true);
});

test('normalizeLinkedInProfile falls back to given+family, then email local part', () => {
  assert.equal(normalizeLinkedInProfile({ sub: 'u', email: 'x@y.com', given_name: 'Grace', family_name: 'Hopper' }).fullName, 'Grace Hopper');
  assert.equal(normalizeLinkedInProfile({ sub: 'u', email: 'katherine@nasa.gov' }).fullName, 'katherine');
});

test('normalizeLinkedInProfile rejects missing sub or email', () => {
  assert.throws(() => normalizeLinkedInProfile({ email: 'x@y.com' }), /user id/);
  assert.throws(() => normalizeLinkedInProfile({ sub: 'u' }), /email/);
});

test('signOAuthState + verifyOAuthState round-trip', () => {
  const state = signOAuthState(SECRET);
  assert.equal(verifyOAuthState(SECRET, state), true);
});

test('verifyOAuthState rejects wrong secret and tampering', () => {
  const state = signOAuthState(SECRET);
  assert.equal(verifyOAuthState('other', state), false);
  const [payload, sig] = state.split('.');
  const tampered = `${payload}x.${sig}`;
  assert.equal(verifyOAuthState(SECRET, tampered), false);
});

test('verifyOAuthState rejects expired state', () => {
  const old = Date.now() - 20 * 60 * 1000; // 20 min ago
  const state = signOAuthState(SECRET, old);
  assert.equal(verifyOAuthState(SECRET, state, 10 * 60 * 1000), false);
});

test('verifyOAuthState rejects garbage', () => {
  assert.equal(verifyOAuthState(SECRET, ''), false);
  assert.equal(verifyOAuthState(SECRET, 'nodot'), false);
  assert.equal(verifyOAuthState('', 'a.b'), false);
});
