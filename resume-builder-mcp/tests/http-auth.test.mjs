import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bearerToken } from '../dist/http-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// R-097: one hosted URL, many users — each HTTP request authenticates
// itself with its own Bearer token.

test('bearerToken extracts the token, tolerating case and whitespace', () => {
  assert.equal(bearerToken({ headers: { authorization: 'Bearer abc.def.ghi' } }), 'abc.def.ghi');
  assert.equal(bearerToken({ headers: { authorization: 'bearer  tok123 ' } }), 'tok123');
});

test('bearerToken returns empty for missing or malformed headers', () => {
  assert.equal(bearerToken({ headers: {} }), '');
  assert.equal(bearerToken({ headers: { authorization: 'Basic dXNlcg==' } }), '');
  assert.equal(bearerToken({ headers: { authorization: 'Bearer' } }), '');
});

test('HTTP mode is per-request multi-tenant with a 401 when unauthenticated', () => {
  const src = readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
  assert(src.includes('bearerToken(req) || envToken'), 'request token wins; env token is the single-user fallback');
  assert(src.includes('writeHead(401'), 'requests with no token are rejected with 401');
  // The client must be constructed INSIDE the request handler so no user's
  // token can leak into another user's request.
  const handler = src.slice(src.indexOf('createServer(async (req, res)'));
  assert(handler.includes('new PocketResumeClient({ baseUrl, token })'), 'per-request client bound to the caller token');
});
