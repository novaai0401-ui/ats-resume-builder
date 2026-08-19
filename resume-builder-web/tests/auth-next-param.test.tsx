/**
 * `?next=` post-auth redirect param — validation + wiring.
 *
 * The register/login flow honours a ?next=<path> query param on
 * successful auth, but only for same-origin paths (open-redirect guard).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';

process.env.NEXT_TEST_MOCK_ROUTER = '1';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/auth/login' });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.self = dom.window;
// jsdom lacks matchMedia; tekivex-ui components (theme hooks) call it on mount.
// The auth views now render TkxInput/TkxButton, so this shim is needed here as
// well — same shape as login.page.test.tsx already uses.
if (!dom.window.matchMedia) {
  // @ts-expect-error test shim
  dom.window.matchMedia = (q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
}
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.requestAnimationFrame =
  dom.window.requestAnimationFrame?.bind(dom.window) ??
  ((callback: FrameRequestCallback) => setTimeout(callback, 0) as unknown as number);

function setSearch(search: string) {
  dom.window.history.pushState({}, '', `/auth/login${search}`);
}

function getTestingLib() {
  return import('@testing-library/react');
}

test.afterEach(async () => {
  const { cleanup } = await getTestingLib();
  cleanup();
  setSearch('');
  sessionStorage.clear();
});

function createMockApi() {
  const auth = { user: { id: '1', email: 'a', fullName: 'b' }, accessToken: 'a', refreshToken: 'r' };
  return {
    loginWithPassword: async () => auth,
    register: async () => auth,
  };
}

test('sanitizeNextPath accepts same-origin paths and rejects redirect escapes', async () => {
  const { sanitizeNextPath } = await import('@/app/auth/next-param');
  assert.equal(sanitizeNextPath('/resume/start'), '/resume/start');
  assert.equal(sanitizeNextPath('/resume/start?template=modern'), '/resume/start?template=modern');
  assert.equal(sanitizeNextPath('https://evil.com'), null, 'absolute URL rejected');
  assert.equal(sanitizeNextPath('//evil.com'), null, 'protocol-relative rejected');
  assert.equal(sanitizeNextPath('/\\evil.com'), null, 'backslash protocol-relative rejected');
  assert.equal(sanitizeNextPath('javascript:alert(1)'), null);
  assert.equal(sanitizeNextPath(''), null);
  assert.equal(sanitizeNextPath(null), null);
});

async function loginWithNext(search: string): Promise<string[]> {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await import('@/app/auth/login/LoginPageView');
  setSearch(search);
  const routerHits: string[] = [];
  const routerStub = { push: async (href: string) => { routerHits.push(href); return true; } };
  const view = render(
    React.createElement(LoginPageView, { apiClient: createMockApi() as never, routerOverride: routerStub }),
  );
  fireEvent.change(view.getByLabelText(/^email$/i), { target: { value: 'test@example.com' } });
  fireEvent.change(view.getByLabelText(/password/i), { target: { value: 'mypassword123' } });
  fireEvent.click(view.getByRole('button', { name: /sign in/i }));
  await waitFor(() => assert.equal(routerHits.length, 1));
  return routerHits;
}

test('login honours a valid ?next= path', async () => {
  const hits = await loginWithNext('?next=%2Fresume%2Fstart');
  assert.equal(hits[0], '/resume/start');
});

test('login falls back to /dashboard for an absolute-URL next', async () => {
  const hits = await loginWithNext(`?next=${encodeURIComponent('https://evil.com')}`);
  assert.equal(hits[0], '/dashboard');
});

test('login falls back to /dashboard for a protocol-relative next', async () => {
  const hits = await loginWithNext(`?next=${encodeURIComponent('//evil.com')}`);
  assert.equal(hits[0], '/dashboard');
});

test('register honours a valid ?next= path on successful sign-up', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await import('@/app/auth/login/LoginPageView');
  setSearch('?next=%2Fresume%2Fstart%3Ftemplate%3Dmodern');
  const routerHits: string[] = [];
  const routerStub = { push: async (href: string) => { routerHits.push(href); return true; } };
  const view = render(
    React.createElement(LoginPageView, {
      apiClient: createMockApi() as never,
      routerOverride: routerStub,
      defaultMode: 'register',
    }),
  );
  fireEvent.change(view.getByLabelText(/full name/i), { target: { value: 'John Doe' } });
  fireEvent.change(view.getByLabelText(/^email$/i), { target: { value: 'john@example.com' } });
  fireEvent.change(view.getByLabelText(/password/i), { target: { value: 'secure123!' } });
  fireEvent.click(view.getByRole('button', { name: /create account/i }));
  await waitFor(() => {
    assert.equal(routerHits.length, 1);
    assert.equal(routerHits[0], '/resume/start?template=modern');
  });
});
