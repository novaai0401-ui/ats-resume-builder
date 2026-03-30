import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';

process.env.NEXT_TEST_MOCK_ROUTER = '1';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.self = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
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
    requestEmailOtp: async () => ({ ok: true, message: 'OTP sent', devOtp: '123456' }),
    verifyEmailOtp: async () => ({
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
  const emailInput = view.getByLabelText(/email address/i) as HTMLInputElement;
  assert.equal(emailInput.id, 'login-email');
  assert.equal(emailInput.type, 'email');
});

test('request OTP button calls email OTP API', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const requestCalls: string[] = [];
  const apiClient = {
    ...createMockApi(),
    requestEmailOtp: async (email: string) => {
      requestCalls.push(email);
      return { ok: true, message: 'OTP sent', devOtp: '123456' };
    },
  };

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any }));
  const emailInput = view.getByLabelText(/email address/i) as HTMLInputElement;
  fireEvent.input(emailInput, { target: { value: 'test@example.com' } });
  fireEvent.click(view.getByRole('button', { name: /send otp/i }));
  await waitFor(() => {
    assert.equal(requestCalls.length, 1);
    assert.equal(requestCalls[0], 'test@example.com');
  });
});

test('verify OTP calls API and navigates on success', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const verifyCalls: Array<{ email: string; otp: string }> = [];
  const apiClient = {
    ...createMockApi(),
    verifyEmailOtp: async (payload: { email: string; otp: string }) => {
      verifyCalls.push(payload);
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

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any, routerOverride: routerStub }));
  fireEvent.input(view.getByLabelText(/email address/i), { target: { value: 'test@example.com' } });
  fireEvent.click(view.getByRole('button', { name: /send otp/i }));
  await waitFor(() => view.getByLabelText(/enter otp/i));
  fireEvent.change(view.getByLabelText(/enter otp/i), { target: { value: '123456' } });
  fireEvent.click(view.getByRole('button', { name: /verify & login/i }));
  await waitFor(() => {
    assert.equal(verifyCalls.length, 1);
    assert.equal(verifyCalls[0].email, 'test@example.com');
    assert.equal(verifyCalls[0].otp, '123456');
    assert.equal(routerHits[0], '/dashboard');
  });
});

test('register form is accessible via defaultMode prop', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const registerCalls: Array<{ fullName: string; email: string; mobile: string }> = [];
  const apiClient = {
    ...createMockApi(),
    register: async (payload: { fullName: string; email: string; mobile: string }) => {
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
  fireEvent.input(view.getByLabelText(/full name/i), { target: { value: 'John Doe' } });
  fireEvent.input(view.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
  fireEvent.input(view.getByLabelText(/mobile number/i), { target: { value: '+919876543210' } });
  fireEvent.click(view.getByRole('button', { name: /register/i }));

  await waitFor(() => {
    assert.equal(registerCalls.length, 1);
    assert.equal(registerCalls[0].fullName, 'John Doe');
    assert.equal(registerCalls[0].email, 'john@example.com');
    assert.equal(registerCalls[0].mobile, '+919876543210');
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
  const link = view.getByRole('link', { name: /already have an account\? login/i }) as HTMLAnchorElement;
  assert.ok(link);
  assert.ok(link.getAttribute('href')?.includes('/auth/login'));
});

test('login page does not show mobile OTP or password login', async () => {
  const { render } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const apiClient = createMockApi();

  const view = render(React.createElement(LoginPageView, { apiClient: apiClient as any }));
  const html = view.container.innerHTML;
  assert.equal(html.includes('mobile OTP'), false, 'Should not contain mobile OTP text');
  assert.equal(html.includes('Use mobile'), false, 'Should not contain Use mobile text');
  // Ensure no password input field exists (the word "password" may appear in info text like "one-time password")
  const passwordInputs = view.container.querySelectorAll('input[type="password"]');
  assert.equal(passwordInputs.length, 0, 'Should not contain password input field');
});
