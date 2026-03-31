import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { api } from '../src/lib/api';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.self = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event as unknown as typeof Event;
globalThis.localStorage = dom.window.localStorage;

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});

test('email OTP functions exist on api client', async () => {
  assert.equal(typeof api.loginWithPassword, 'function', 'loginWithPassword should exist');
  assert.equal(typeof api.register, 'function', 'register should exist');
});

test('loginWithPassword calls /auth/login with email and password payload', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({
      user: { id: 'user-1', email: 'user@example.com', fullName: 'Test User' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await api.loginWithPassword('user@example.com', 'securepass123');

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/auth/login'), 'Should call /auth/login endpoint');
  assert.equal(String(calls[0].init?.method || ''), 'POST');
  const payload = JSON.parse(String(calls[0].init?.body || '{}'));
  assert.equal(payload.email, 'user@example.com');
  assert.equal(payload.password, 'securepass123');
  assert.equal(window.localStorage.getItem('accessToken'), 'access-1');
  assert.equal(window.localStorage.getItem('refreshToken'), 'refresh-1');
  assert.equal(window.localStorage.getItem('userId'), 'user-1');
});

test('register calls /auth/register with fullName, email, and mobile', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        user: { id: 'user-2', email: 'new@example.com', fullName: 'New User' },
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  await api.register({ fullName: 'New User', email: 'new@example.com', mobile: '+919876543210' });

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/auth/register'), 'Should call /auth/register endpoint');
  const payload = JSON.parse(String(calls[0].init?.body || '{}'));
  assert.equal(payload.fullName, 'New User');
  assert.equal(payload.email, 'new@example.com');
  assert.equal(payload.mobile, '+919876543210');
  assert.equal(window.localStorage.getItem('accessToken'), 'access-2');
});
