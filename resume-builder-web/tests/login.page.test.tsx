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
  return {
    loginWithPassword: async () => ({
      user: { id: '1', email: 'a', fullName: 'b' },
      accessToken: 'a',
      refreshToken: 'r',
    }),
    register: async () => ({
      user: { id: '1', email: 'a', fullName: 'b' },
      accessToken: 'a',
      refreshToken: 'r',
    }),
  };
}

test('login page renders email input by default', async () => {
  const { render } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const apiClient = createMockApi();

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any }));
  const emailInput = view.getByLabelText(/^email$/i) as HTMLInputElement;
  assert.equal(emailInput.id, 'login-email');
  assert.equal(emailInput.type, 'email');
});

test('login with password calls API and navigates on success', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const loginCalls: Array<{ email: string; password: string }> = [];
  const apiClient = {
    ...createMockApi(),
    loginWithPassword: async (email: string, password: string) => {
      loginCalls.push({ email, password });
      return { user: { id: '1', email, fullName: 'b' }, accessToken: 'a', refreshToken: 'r' };
    },
  };
  const routerHits: string[] = [];
  const routerStub = {
    push: async (href: string) => {
      routerHits.push(href);
      return true;
    },
  };

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any, routerOverride: routerStub }));
  fireEvent.change(view.getByLabelText(/^email$/i), { target: { value: 'test@example.com' } });
  fireEvent.change(view.getByLabelText(/password/i), { target: { value: 'mypassword123' } });
  fireEvent.click(view.getByRole('button', { name: /sign in/i }));
  await waitFor(() => {
    assert.equal(loginCalls.length, 1);
    assert.equal(loginCalls[0].email, 'test@example.com');
    assert.equal(loginCalls[0].password, 'mypassword123');
    assert.equal(routerHits[0], '/dashboard');
  });
});

test('register form is accessible via defaultMode prop', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  // Registration is email + password only (mobile was removed in the
  // email-required auth refactor); the form no longer collects a mobile.
  const registerCalls: Array<{ fullName: string; email: string }> = [];
  const apiClient = {
    ...createMockApi(),
    register: async (payload: { fullName: string; email: string }) => {
      registerCalls.push(payload);
      return { user: { id: '1', email: 'a', fullName: 'b' }, accessToken: 'a', refreshToken: 'r' };
    },
  };
  const routerHits: string[] = [];
  const routerStub = {
    push: async (href: string) => {
      routerHits.push(href);
      return true;
    },
  };

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any, routerOverride: routerStub, defaultMode: 'register' }));
  fireEvent.change(view.getByLabelText(/full name/i), { target: { value: 'John Doe' } });
  fireEvent.change(view.getByLabelText(/^email$/i), { target: { value: 'john@example.com' } });
  fireEvent.change(view.getByLabelText(/password/i), { target: { value: 'secure123!' } });
  fireEvent.click(view.getByRole('button', { name: /create account/i }));

  await waitFor(() => {
    assert.equal(registerCalls.length, 1);
    assert.equal(registerCalls[0].fullName, 'John Doe');
    assert.equal(registerCalls[0].email, 'john@example.com');
    assert.equal(routerHits[0], '/dashboard');
  });
});

test('register is two-step when the code endpoint exists: details → emailed code → account', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const startCalls: Array<{ email: string }> = [];
  const registerCalls: Array<{ email: string; otp?: string }> = [];
  const apiClient = {
    ...createMockApi(),
    registerStart: async (payload: { email: string }) => {
      startCalls.push(payload);
      return { sent: true };
    },
    register: async (payload: { fullName: string; email: string; otp?: string }) => {
      registerCalls.push(payload);
      return { user: { id: '1', email: payload.email, fullName: 'b' }, accessToken: 'a', refreshToken: 'r' };
    },
  };
  const routerHits: string[] = [];
  const routerStub = { push: async (href: string) => { routerHits.push(href); return true; } };

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any, routerOverride: routerStub, defaultMode: 'register' }));
  fireEvent.change(view.getByLabelText(/full name/i), { target: { value: 'Jane Doe' } });
  fireEvent.change(view.getByLabelText(/^email$/i), { target: { value: 'jane@example.com' } });
  fireEvent.change(view.getByLabelText(/password/i), { target: { value: 'secure123!' } });
  fireEvent.click(view.getByRole('button', { name: /create account/i }));

  // Step 1: the code was requested, NO account was created yet.
  await waitFor(() => {
    assert.equal(startCalls.length, 1);
    assert.equal(startCalls[0].email, 'jane@example.com');
    assert.equal(registerCalls.length, 0);
  });

  // Step 2: enter the emailed code — register is called WITH it.
  const codeInput = await waitFor(() => view.getByLabelText(/verification code/i));
  fireEvent.change(codeInput, { target: { value: '654321' } });
  fireEvent.click(view.getByRole('button', { name: /verify & create account/i }));
  await waitFor(() => {
    assert.equal(registerCalls.length, 1);
    assert.equal(registerCalls[0].otp, '654321');
    assert.equal(registerCalls[0].email, 'jane@example.com');
    assert.equal(routerHits[0], '/dashboard');
  });
});

test('login page has link to register page', async () => {
  const { render } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const apiClient = createMockApi();

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any }));
  const link = view.getByRole('link', { name: /new here\? create account/i }) as HTMLAnchorElement;
  assert.ok(link);
  assert.ok(link.getAttribute('href')?.includes('/auth/register'));
});

test('register mode has link back to login page', async () => {
  const { render } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const apiClient = createMockApi();

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any, defaultMode: 'register' }));
  const link = view.getByRole('link', { name: /already have an account/i }) as HTMLAnchorElement;
  assert.ok(link);
  assert.ok(link.getAttribute('href')?.includes('/auth/login'));
});

test('login page has password input field for password-based auth', async () => {
  const { render } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const apiClient = createMockApi();

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any }));
  const passwordInputs = view.container.querySelectorAll('input[type="password"]');
  assert.equal(passwordInputs.length, 1, 'Should have one password input field');
  const html = view.container.innerHTML;
  assert.equal(html.includes('mobile OTP'), false, 'Should not contain mobile OTP text');
  assert.equal(html.includes('Use mobile'), false, 'Should not contain Use mobile text');
});
