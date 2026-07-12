import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';

process.env.NEXT_TEST_MOCK_ROUTER = '1';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.self = dom.window;
// jsdom lacks matchMedia; tekivex-ui components (theme hooks) call it.
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

type TestingLib = typeof import('@testing-library/react');
type LoginPageModule = typeof import('@/app/auth/login/LoginPageView');

let testingLibPromise: Promise<TestingLib> | null = null;
let loginPagePromise: Promise<LoginPageModule> | null = null;

function getTestingLib() {
  if (!testingLibPromise) {
    testingLibPromise = import('@testing-library/react');
  }
  return testingLibPromise;
}

function getLoginPageModule() {
  if (!loginPagePromise) {
    loginPagePromise = import('@/app/auth/login/LoginPageView');
  }
  return loginPagePromise;
}

test.afterEach(async () => {
  const { cleanup } = await getTestingLib();
  cleanup();
});

function createMockApi() {
  const calls: Record<string, unknown[]> = {
    loginWithPassword: [],
    register: [],
  };
  return {
    calls,
    api: {
      loginWithPassword: async (email: string, password: string) => {
        calls.loginWithPassword.push({ email, password });
        return { user: { id: '1', email, fullName: 'Test' }, accessToken: 'a', refreshToken: 'r' };
      },
      register: async (payload: { fullName: string; email: string }) => {
        calls.register.push(payload);
        return { user: { id: '1', email: payload.email, fullName: payload.fullName }, accessToken: 'a', refreshToken: 'r' };
      },
    },
  };
}

test('login page renders email input by default', async () => {
  const { render } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const { api } = createMockApi();

  const view = render(React.createElement(LoginPageView, { apiClient: api as any }));
  const emailInput = view.getByLabelText(/^email$/i) as HTMLInputElement;
  assert.equal(emailInput.id, 'login-email');
  assert.equal(emailInput.type, 'email');
});

test('login with password calls API and shows dashboard', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const { api, calls } = createMockApi();
  const routerHits: string[] = [];
  const routerStub = { push: async (href: string) => { routerHits.push(href); return true; } };

  const view = render(React.createElement(LoginPageView, { apiClient: api as any, routerOverride: routerStub }));
  fireEvent.change(view.getByLabelText(/^email$/i), { target: { value: 'test@example.com' } });
  fireEvent.change(view.getByLabelText(/password/i), { target: { value: 'password123' } });
  fireEvent.click(view.getByRole('button', { name: /sign in/i }));

  await waitFor(() => {
    assert.equal(calls.loginWithPassword.length, 1);
    const payload = calls.loginWithPassword[0] as { email: string; password: string };
    assert.equal(payload.email, 'test@example.com');
    assert.equal(payload.password, 'password123');
    assert.equal(routerHits[0], '/dashboard');
  });
});

test('register form is accessible via defaultMode', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const { api, calls } = createMockApi();
  const routerHits: string[] = [];
  const routerStub = { push: async (href: string) => { routerHits.push(href); return true; } };

  const view = render(React.createElement(LoginPageView, { apiClient: api as any, routerOverride: routerStub, defaultMode: 'register' }));

  fireEvent.change(view.getByLabelText(/full name/i), { target: { value: 'John Doe' } });
  fireEvent.change(view.getByLabelText(/^email$/i), { target: { value: 'john@example.com' } });
  fireEvent.change(view.getByLabelText(/password/i), { target: { value: 'securepass1' } });
  fireEvent.click(view.getByRole('button', { name: /create account/i }));

  await waitFor(() => {
    assert.equal(calls.register.length, 1);
    const payload = calls.register[0] as { fullName: string; email: string };
    assert.equal(payload.fullName, 'John Doe');
    assert.equal(payload.email, 'john@example.com');
    assert.equal(routerHits[0], '/dashboard');
  });
});
