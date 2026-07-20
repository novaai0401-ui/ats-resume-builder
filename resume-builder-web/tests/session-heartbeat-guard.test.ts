/**
 * Session-heartbeat anonymous-401 guard.
 *
 * startSessionHeartbeat() is called unconditionally on TopNav mount, so
 * logged-out marketing pages used to arm session upkeep. The guard:
 *   - no access token → NO ensureSessionActive(), NO /auth/heartbeat ping,
 *     no interval, no activity tracking;
 *   - it re-arms automatically when 'auth-state-changed' fires (or a token
 *     shows up cross-tab via 'storage') and then behaves exactly as before.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.self = dom.window;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;

const fetchCalls: string[] = [];
const fetchSpy = (async (input: unknown) => {
  fetchCalls.push(String(input));
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
}) as typeof fetch;
globalThis.fetch = fetchSpy;
(dom.window as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

test('heartbeat: logged out → no session calls; token appears → arms as before', async () => {
  const { startSessionHeartbeat } = await import('@/src/lib/api');

  // 1) No token: calling the heartbeat must be a no-op on the network and
  //    must not start session-activity tracking.
  localStorage.clear();
  fetchCalls.length = 0;
  startSessionHeartbeat();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fetchCalls.length, 0, 'no fetch (heartbeat ping / session refresh) without a token');
  assert.equal(
    localStorage.getItem('sessionLastActivityAt'),
    null,
    'no session-activity bookkeeping without a token',
  );

  // 2) Token appears + auth-state-changed fires: the guard re-arms and the
  //    heartbeat behaves exactly as before (immediate /auth/heartbeat ping).
  localStorage.setItem('accessToken', 'test-access-token');
  window.dispatchEvent(new dom.window.Event('auth-state-changed'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fetchCalls.length, 1, 'exactly one immediate ping after auth');
  assert.ok(fetchCalls[0].includes('/auth/heartbeat'), 'ping targets /auth/heartbeat');
  assert.ok(localStorage.getItem('sessionLastActivityAt'), 'activity tracking starts once authed');

  // 3) Idempotent: calling again while armed does not double-start.
  startSessionHeartbeat();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fetchCalls.length, 1, 'no duplicate ping from a second start call');
});
