/**
 * Stateless OAuth 2.1 provider for the hosted MCP endpoint (R-098).
 *
 * ChatGPT / Claude remote connectors authenticate MCP servers via OAuth
 * (authorization-code + PKCE, dynamic client registration, RFC 8414/9728
 * discovery) — their UIs have no "paste a bearer token" field. This module
 * adds that layer WITHOUT a database, keeping the server stateless:
 *
 *   - client_id            = HMAC-signed blob of the registered redirect_uris
 *   - authorization code   = AES-256-GCM blob {user token, PKCE challenge,
 *                            client_id, redirect_uri}, 10-minute TTL
 *   - issued access token  = AES-256-GCM wrapper around the user's
 *                            CallbackCV token (the raw JWT is never handed
 *                            to the connector)
 *
 * The authorize page asks the user to paste their token from CallbackCV →
 * Settings → API access and validates it against the API before issuing a
 * code — the MCP layer never touches passwords. When the underlying
 * CallbackCV token expires (~7 days), tools return the re-auth message and
 * the user reconnects.
 *
 * Enabled only when BOTH env vars are set (otherwise the endpoints 404 and
 * plain Bearer auth continues to work):
 *   MCP_OAUTH_SECRET  — long random string; signs/encrypts everything above
 *   MCP_PUBLIC_URL    — the public https origin of this server (the issuer)
 */

import { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface OAuthConfig {
  secret: string;
  /** Public https origin of this server, no trailing slash. */
  issuer: string;
  /** CallbackCV API base — used to validate pasted tokens. */
  apiBaseUrl: string;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches the API JWT default

// ── crypto helpers (stateless: everything lives inside the artifacts) ──

function key(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function b64u(buf: Buffer): string {
  return buf.toString('base64url');
}

export function seal(secret: string, payload: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return `${b64u(iv)}.${b64u(data)}.${b64u(cipher.getAuthTag())}`;
}

export function unseal(secret: string, sealed: string): Record<string, unknown> | null {
  try {
    const [iv, data, tag] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plain);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function sign(secret: string, payload: string): string {
  return b64u(createHmac('sha256', key(secret)).update(payload).digest());
}

// ── dynamic client registration (stateless client_id) ─────────────────

export function makeClientId(secret: string, redirectUris: string[]): string {
  const payload = b64u(Buffer.from(JSON.stringify({ r: redirectUris })));
  return `${payload}.${sign(secret, payload)}`;
}

export function clientRedirectUris(secret: string, clientId: string): string[] | null {
  const dot = clientId.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = clientId.slice(0, dot);
  const mac = clientId.slice(dot + 1);
  const expected = sign(secret, payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Array.isArray(parsed?.r) && parsed.r.every((u: unknown) => typeof u === 'string') ? parsed.r : null;
  } catch {
    return null;
  }
}

// ── PKCE ──────────────────────────────────────────────────────────────

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = b64u(createHash('sha256').update(codeVerifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── access-token wrapping ─────────────────────────────────────────────

export function wrapAccessToken(secret: string, userToken: string): string {
  return `cbcv.${seal(secret, { t: userToken, e: Date.now() + ACCESS_TOKEN_TTL_MS })}`;
}

/** Returns the inner CallbackCV token, '' if not a wrapped token, null if wrapped but invalid/expired. */
export function unwrapAccessToken(secret: string, bearer: string): string | '' | null {
  if (!bearer.startsWith('cbcv.')) return '';
  const payload = unseal(secret, bearer.slice(5));
  if (!payload || typeof payload.t !== 'string') return null;
  if (typeof payload.e === 'number' && Date.now() > payload.e) return null;
  return payload.t;
}

// ── HTTP handling ─────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function authorizeForm(params: URLSearchParams, error = ''): string {
  const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'response_type']
    .map((k) => `<input type="hidden" name="${k}" value="${esc(params.get(k) || '')}">`)
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Connect CallbackCV</title>
<style>body{font-family:system-ui,sans-serif;max-width:460px;margin:48px auto;padding:0 16px;color:#1a1815}
input[type=password]{width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box}
button{margin-top:14px;padding:10px 18px;background:#4f46e5;color:#fff;border:0;border-radius:6px;font-weight:600;cursor:pointer}
.err{color:#a8412c}.muted{color:#6b6560;font-size:13px}</style></head><body>
<h1>Connect CallbackCV</h1>
<p>Your AI assistant is asking to use your CallbackCV account (resumes, tailoring, job tracking — only what you can do yourself).</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="POST">
${hidden}
<label for="token"><strong>Your CallbackCV token</strong></label>
<p class="muted">Sign in to CallbackCV → <strong>Settings → API access</strong> → Copy token, then paste it here. It is verified and never shown to the assistant.</p>
<input type="password" id="token" name="token" placeholder="Paste your token" required>
<button type="submit">Allow access</button>
</form></body></html>`;
}

/**
 * Handle OAuth-related paths. Returns true if the request was handled.
 * Call before MCP request handling; pass cfg=null when OAuth is disabled
 * (env vars unset) — discovery paths then 404 and we return false fast.
 */
export async function handleOAuth(req: IncomingMessage, res: ServerResponse, cfg: OAuthConfig | null): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://internal');
  const path = url.pathname;
  const oauthPath =
    path.startsWith('/.well-known/oauth-') || path === '/oauth/register' || path === '/oauth/authorize' || path === '/oauth/token';
  if (!oauthPath) return false;
  if (!cfg) {
    json(res, 404, { error: 'oauth_disabled', message: 'Set MCP_OAUTH_SECRET and MCP_PUBLIC_URL to enable OAuth.' });
    return true;
  }

  if (path === '/.well-known/oauth-protected-resource') {
    json(res, 200, {
      resource: cfg.issuer,
      authorization_servers: [cfg.issuer],
    });
    return true;
  }

  if (path === '/.well-known/oauth-authorization-server') {
    json(res, 200, {
      issuer: cfg.issuer,
      authorization_endpoint: `${cfg.issuer}/oauth/authorize`,
      token_endpoint: `${cfg.issuer}/oauth/token`,
      registration_endpoint: `${cfg.issuer}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['callbackcv'],
    });
    return true;
  }

  if (path === '/oauth/register' && req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await readBody(req)) || '{}');
    } catch {
      json(res, 400, { error: 'invalid_client_metadata' });
      return true;
    }
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
    if (!uris.length || !uris.every((u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u))) {
      json(res, 400, { error: 'invalid_redirect_uri', error_description: 'https redirect_uris required' });
      return true;
    }
    json(res, 201, {
      client_id: makeClientId(cfg.secret, uris),
      redirect_uris: uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    });
    return true;
  }

  if (path === '/oauth/authorize') {
    const params = req.method === 'POST' ? new URLSearchParams(await readBody(req)) : url.searchParams;
    const clientId = params.get('client_id') || '';
    const redirectUri = params.get('redirect_uri') || '';
    const challenge = params.get('code_challenge') || '';
    const method = params.get('code_challenge_method') || '';
    const registered = clientRedirectUris(cfg.secret, clientId);
    if (!registered || !registered.includes(redirectUri)) {
      html(res, 400, '<p>Invalid client or redirect_uri. Re-register the connector.</p>');
      return true;
    }
    if (!challenge || method !== 'S256') {
      html(res, 400, '<p>PKCE (S256) is required.</p>');
      return true;
    }
    if (req.method !== 'POST') {
      html(res, 200, authorizeForm(params));
      return true;
    }
    const token = (params.get('token') || '').trim();
    // Verify the pasted token against the CallbackCV API before issuing a code.
    let valid = false;
    try {
      const check = await fetch(`${cfg.apiBaseUrl.replace(/\/+$/, '')}/resumes`, {
        headers: { authorization: `Bearer ${token}` },
      });
      valid = check.ok;
    } catch {
      valid = false;
    }
    if (!token || !valid) {
      html(res, 200, authorizeForm(params, 'That token was rejected by CallbackCV — copy a fresh one from Settings → API access.'));
      return true;
    }
    const code = seal(cfg.secret, { t: token, c: challenge, i: clientId, r: redirectUri, e: Date.now() + CODE_TTL_MS });
    const dest = new URL(redirectUri);
    dest.searchParams.set('code', code);
    const state = params.get('state');
    if (state) dest.searchParams.set('state', state);
    res.writeHead(302, { location: dest.toString() });
    res.end();
    return true;
  }

  if (path === '/oauth/token' && req.method === 'POST') {
    const params = new URLSearchParams(await readBody(req));
    if (params.get('grant_type') !== 'authorization_code') {
      json(res, 400, { error: 'unsupported_grant_type' });
      return true;
    }
    const payload = unseal(cfg.secret, params.get('code') || '');
    const verifier = params.get('code_verifier') || '';
    if (
      !payload ||
      typeof payload.t !== 'string' ||
      typeof payload.c !== 'string' ||
      (typeof payload.e === 'number' && Date.now() > payload.e) ||
      (params.get('redirect_uri') && params.get('redirect_uri') !== payload.r) ||
      (params.get('client_id') && params.get('client_id') !== payload.i) ||
      !verifier ||
      !verifyPkce(verifier, payload.c)
    ) {
      json(res, 400, { error: 'invalid_grant' });
      return true;
    }
    json(res, 200, {
      access_token: wrapAccessToken(cfg.secret, payload.t),
      token_type: 'Bearer',
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      scope: 'callbackcv',
    });
    return true;
  }

  json(res, 404, { error: 'not_found' });
  return true;
}
