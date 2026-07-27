import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import {
  handleOAuth, makeClientId, clientRedirectUris, verifyPkce,
  wrapAccessToken, unwrapAccessToken, seal, unseal,
} from '../dist/oauth.js';

const CFG = { secret: 'test-secret-please-rotate', issuer: 'https://mcp.example.com', apiBaseUrl: 'https://api.example.com' };

function mockReq({ method = 'GET', url = '/', body = '', headers = {} } = {}) {
  return {
    method, url, headers,
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); },
  };
}
function mockRes() {
  const out = { status: 0, headers: {}, body: '' };
  return {
    out,
    writeHead(status, headers) { out.status = status; Object.assign(out.headers, headers || {}); },
    end(body) { out.body = String(body ?? ''); },
  };
}

test('client_id round-trips and rejects tampering', () => {
  const id = makeClientId(CFG.secret, ['https://chatgpt.com/connector_platform_oauth_redirect']);
  assert.deepEqual(clientRedirectUris(CFG.secret, id), ['https://chatgpt.com/connector_platform_oauth_redirect']);
  assert.equal(clientRedirectUris(CFG.secret, id.slice(0, -2) + 'xx'), null);
  assert.equal(clientRedirectUris('other-secret', id), null);
});

test('seal/unseal round-trips and rejects garbage', () => {
  const sealed = seal(CFG.secret, { hello: 'world' });
  assert.deepEqual(unseal(CFG.secret, sealed), { hello: 'world' });
  assert.equal(unseal(CFG.secret, 'not.a.blob'), null);
});

test('full PKCE flow: register → authorize → code → token → unwrap', async () => {
  // 1. dynamic client registration
  const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
  let res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/register', body: JSON.stringify({ redirect_uris: [redirect] }) }), res, CFG);
  assert.equal(res.out.status, 201);
  const clientId = JSON.parse(res.out.body).client_id;

  // 2. authorize GET renders the token form
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`;
  res = mockRes();
  await handleOAuth(mockReq({ url: `/oauth/authorize?${q}` }), res, CFG);
  assert.equal(res.out.status, 200);
  assert.match(res.out.body, /Settings → API access/);

  // 3. authorize POST with a token the API accepts (stub fetch)
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true });
  res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/authorize', body: `${q}&token=user-jwt-123` }), res, CFG);
  global.fetch = realFetch;
  assert.equal(res.out.status, 302);
  const dest = new URL(res.out.headers.location);
  assert.equal(dest.searchParams.get('state'), 'xyz');
  const code = dest.searchParams.get('code');
  assert.ok(code);

  // 4. token exchange with the right verifier
  res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: clientId }).toString(),
  }), res, CFG);
  assert.equal(res.out.status, 200);
  const tok = JSON.parse(res.out.body);
  assert.equal(tok.token_type, 'Bearer');
  assert.match(tok.access_token, /^cbcv\./);
  // 5. the wrapped token unwraps to the original user token
  assert.equal(unwrapAccessToken(CFG.secret, tok.access_token), 'user-jwt-123');

  // 6. a wrong verifier is rejected
  res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: 'wrong-verifier-aaaaaaaaaaaaaaaaaaaaaaaa', redirect_uri: redirect, client_id: clientId }).toString(),
  }), res, CFG);
  assert.equal(res.out.status, 400);
});

test('authorize rejects invalid tokens against the API', async () => {
  const redirect = 'https://chatgpt.com/cb';
  const clientId = makeClientId(CFG.secret, [redirect]);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=S256`;
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false });
  const res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/authorize', body: `${q}&token=bad` }), res, CFG);
  global.fetch = realFetch;
  assert.equal(res.out.status, 200);
  assert.match(res.out.body, /rejected by CallbackCV/);
});

test('raw bearers pass through; expired wrapped tokens are refused', () => {
  assert.equal(unwrapAccessToken(CFG.secret, 'plain-jwt'), '');            // not wrapped → caller uses it raw
  assert.equal(unwrapAccessToken(CFG.secret, 'cbcv.garbage'), null);        // wrapped but invalid
  const wrapped = wrapAccessToken(CFG.secret, 'user-jwt');
  assert.equal(unwrapAccessToken('other-secret', wrapped), null);           // wrong secret
});

test('disabled config: oauth paths 404, other paths untouched', async () => {
  let res = mockRes();
  const handled = await handleOAuth(mockReq({ url: '/.well-known/oauth-authorization-server' }), res, null);
  assert.equal(handled, true);
  assert.equal(res.out.status, 404);
  res = mockRes();
  assert.equal(await handleOAuth(mockReq({ url: '/anything-else' }), res, null), false);
});

test('discovery metadata advertises PKCE + registration', async () => {
  const res = mockRes();
  await handleOAuth(mockReq({ url: '/.well-known/oauth-authorization-server' }), res, CFG);
  const meta = JSON.parse(res.out.body);
  assert.equal(meta.issuer, CFG.issuer);
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  assert.equal(meta.registration_endpoint, `${CFG.issuer}/oauth/register`);
});

test('authorize supports real email+password sign-in via /auth/login', async () => {
  const redirect = 'https://chatgpt.com/cb2';
  const clientId = makeClientId(CFG.secret, [redirect]);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=S256`;

  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
    return { ok: true, json: async () => ({ accessToken: 'jwt-from-login' }) };
  };
  const res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/authorize',
    body: `${q}&email=${encodeURIComponent('user@example.com')}&password=${encodeURIComponent('s3cret!')}`,
  }), res, CFG);
  global.fetch = realFetch;

  assert.equal(res.out.status, 302, 'successful login redirects with a code');
  assert.match(calls[0].url, /\/auth\/login$/, 'credentials go to the first-party login endpoint');
  const code = new URL(res.out.headers.location).searchParams.get('code');

  // The issued code exchanges into a wrapped token containing the login JWT.
  const res2 = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: clientId }).toString(),
  }), res2, CFG);
  const tok = JSON.parse(res2.out.body);
  assert.equal(unwrapAccessToken(CFG.secret, tok.access_token), 'jwt-from-login');
});

test('authorize rejects failed sign-in and empty submissions', async () => {
  const redirect = 'https://chatgpt.com/cb3';
  const clientId = makeClientId(CFG.secret, [redirect]);
  const challenge = createHash('sha256').update('v'.repeat(43)).digest('base64url');
  const q = `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=S256`;

  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, json: async () => ({}) });
  let res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/authorize', body: `${q}&email=a@b.c&password=wrong` }), res, CFG);
  global.fetch = realFetch;
  assert.equal(res.out.status, 200);
  assert.match(res.out.body, /Sign-in failed/);

  res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/authorize', body: q }), res, CFG);
  assert.equal(res.out.status, 200);
  assert.match(res.out.body, /Enter your email and password/);
});
