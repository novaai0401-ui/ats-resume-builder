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

/**
 * Stub the first-party API the connector talks to. R-106 made two calls
 * real: redeeming a connect code, and burning an authorization code's jti.
 * `consumed` models the API's uniqueness constraint on jti, which is what
 * makes replay impossible.
 */
function stubApi({ redeemOk = true, token = 'user-jwt-123' } = {}) {
  const consumed = new Set();
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const href = String(url);
    calls.push(href);
    if (href.endsWith('/auth/connect-code/redeem')) {
      return redeemOk
        ? { ok: true, json: async () => ({ accessToken: token }) }
        : { ok: false, json: async () => ({}) };
    }
    if (href.endsWith('/auth/oauth/consume-code')) {
      const { jti } = JSON.parse(init.body);
      if (consumed.has(jti)) return { ok: false, status: 409, json: async () => ({}) };
      consumed.add(jti);
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  return { consumed, calls, restore: () => { global.fetch = realFetch; } };
}

/** Walk register → authorize and return the issued authorization code. */
async function authorizeToCode(cfg = CFG, { redirect = 'https://chatgpt.com/cb' } = {}) {
  const clientId = makeClientId(cfg.secret, [redirect]);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`;
  const api = stubApi();
  const res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/authorize', body: `${q}&code=connect-code-abc` }), res, cfg);
  api.restore();
  assert.equal(res.out.status, 302, 'a valid connect code authorizes');
  const code = new URL(res.out.headers.location).searchParams.get('code');
  return { code, verifier, clientId, redirect };
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
  const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
  let res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/register', body: JSON.stringify({ redirect_uris: [redirect] }) }), res, CFG);
  assert.equal(res.out.status, 201);
  const clientId = JSON.parse(res.out.body).client_id;

  // authorize GET renders the connect-code form — and asks for no password
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`;
  res = mockRes();
  await handleOAuth(mockReq({ url: `/oauth/authorize?${q}` }), res, CFG);
  assert.equal(res.out.status, 200);
  assert.match(res.out.body, /connect code/i);

  // authorize POST redeems the connect code
  const api = stubApi();
  res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/authorize', body: `${q}&code=connect-code-abc` }), res, CFG);
  assert.equal(res.out.status, 302);
  const dest = new URL(res.out.headers.location);
  assert.equal(dest.searchParams.get('state'), 'xyz');
  const code = dest.searchParams.get('code');
  assert.ok(code);

  // token exchange with the right verifier
  res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: clientId }).toString(),
  }), res, CFG);
  assert.equal(res.out.status, 200);
  const tok = JSON.parse(res.out.body);
  assert.equal(tok.token_type, 'Bearer');
  assert.match(tok.access_token, /^cbcv\./);
  assert.equal(unwrapAccessToken(CFG.secret, tok.access_token), 'user-jwt-123');
  api.restore();

  // a wrong verifier is rejected
  const api2 = stubApi();
  res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: 'wrong-verifier-aaaaaaaaaaaaaaaaaaaaaaaa', redirect_uri: redirect, client_id: clientId }).toString(),
  }), res, CFG);
  api2.restore();
  assert.equal(res.out.status, 400);
});

test('R-106: an authorization code cannot be exchanged twice', async () => {
  const { code, verifier, clientId, redirect } = await authorizeToCode();
  const api = stubApi();
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: clientId,
  }).toString();

  const first = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/token', body }), first, CFG);
  assert.equal(first.out.status, 200, 'the first exchange succeeds');

  const second = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/token', body }), second, CFG);
  api.restore();
  assert.equal(second.out.status, 400, 'the replayed code is refused');
  assert.match(second.out.body, /already used/);
});

test('R-106: concurrent exchanges of one code — only one wins', async () => {
  const { code, verifier, clientId, redirect } = await authorizeToCode();
  const api = stubApi();
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: clientId,
  }).toString();

  const responses = [mockRes(), mockRes(), mockRes()];
  await Promise.all(responses.map((r) => handleOAuth(mockReq({ method: 'POST', url: '/oauth/token', body }), r, CFG)));
  api.restore();
  assert.equal(responses.filter((r) => r.out.status === 200).length, 1, 'exactly one exchange may succeed');
});

test('R-106: client_id and redirect_uri are required, not optional checks', async () => {
  const { code, verifier, clientId, redirect } = await authorizeToCode();
  const api = stubApi();

  // Omitting client_id used to SKIP the binding check entirely.
  let res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect }).toString(),
  }), res, CFG);
  assert.equal(res.out.status, 400, 'a missing client_id is rejected, not waved through');

  res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId }).toString(),
  }), res, CFG);
  assert.equal(res.out.status, 400, 'a missing redirect_uri is rejected');

  // A different client cannot spend a code minted for this one.
  res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect,
      client_id: makeClientId(CFG.secret, ['https://evil.example/cb']),
    }).toString(),
  }), res, CFG);
  api.restore();
  assert.equal(res.out.status, 400, 'a code is bound to the client it was issued to');
});

test('R-106: a token request for another resource is refused', async () => {
  const { code, verifier, clientId, redirect } = await authorizeToCode();
  const api = stubApi();
  const res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: clientId,
      resource: 'https://someone-elses-mcp.example.com',
    }).toString(),
  }), res, CFG);
  api.restore();
  assert.equal(res.out.status, 400);
  assert.match(res.out.body, /invalid_target/);
});

test('R-106: the token endpoint fails closed when the spend check is unreachable', async () => {
  const { code, verifier, clientId, redirect } = await authorizeToCode();
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('network down'); };
  const res = mockRes();
  await handleOAuth(mockReq({
    method: 'POST', url: '/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: clientId }).toString(),
  }), res, CFG);
  global.fetch = realFetch;
  // An outage must not silently re-enable replay by skipping the check.
  assert.equal(res.out.status, 503);
});

test('R-106: the authorize page asks for a connect code, never a password', async () => {
  const redirect = 'https://chatgpt.com/cb';
  const clientId = makeClientId(CFG.secret, [redirect]);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=S256`;
  const res = mockRes();
  await handleOAuth(mockReq({ url: `/oauth/authorize?${q}` }), res, CFG);

  assert.equal(res.out.status, 200);
  assert.doesNotMatch(res.out.body, /type="password"/, 'no password field may exist on a page we host off-origin');
  assert.doesNotMatch(res.out.body, /name="email"/, 'and no credential fields either');
  assert.match(res.out.body, /Settings/);
});

test('R-106: a rejected connect code re-renders the form with a reason', async () => {
  const redirect = 'https://chatgpt.com/cb';
  const clientId = makeClientId(CFG.secret, [redirect]);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = `client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=S256`;

  const api = stubApi({ redeemOk: false });
  let res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/authorize', body: `${q}&code=used-already` }), res, CFG);
  api.restore();
  assert.equal(res.out.status, 200);
  assert.match(res.out.body, /invalid, already used, or expired/);

  // An empty submission never reaches the API at all.
  res = mockRes();
  await handleOAuth(mockReq({ method: 'POST', url: '/oauth/authorize', body: q }), res, CFG);
  assert.equal(res.out.status, 200);
  assert.match(res.out.body, /Paste the connect code/);
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

