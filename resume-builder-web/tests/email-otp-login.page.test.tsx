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
  const calls: Record<string, unknown[]> = {
    requestEmailOtp: [],
    verifyEmailOtp: [],
    register: [],
  };
  return {
    calls,
    api: {
      requestEmailOtp: async (email: string) => {
        calls.requestEmailOtp.push(email);
        return { ok: true, message: 'OTP sent', devOtp: '123456' };
      },
      verifyEmailOtp: async (payload: { email: string; otp: string }) => {
        calls.verifyEmailOtp.push(payload);
        return { user: { id: '1', email: payload.email, fullName: 'Test' }, accessToken: 'a', refreshToken: 'r' };
      },
      register: async (payload: { fullName: string; email: string; mobile: string }) => {
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
  const emailInput = view.getByLabelText(/email address/i) as HTMLInputElement;
  assert.equal(emailInput.id, 'login-email');
  assert.equal(emailInput.type, 'email');
});

test('request email OTP calls API and shows code step', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const { api, calls } = createMockApi();
  const routerStub = { push: async () => true };

  const view = render(React.createElement(LoginPageView, { apiClient: api as any, routerOverride: routerStub }));
  fireEvent.input(view.getByLabelText(/email address/i), { target: { value: 'test@example.com' } });
  fireEvent.click(view.getByRole('button', { name: /send otp/i }));

  await waitFor(() => {
    assert.equal(calls.requestEmailOtp.length, 1);
    assert.equal(calls.requestEmailOtp[0], 'test@example.com');
    // Should now show OTP code input
    view.getByLabelText(/enter otp/i);
  });
});

test('verify email OTP calls API and navigates to dashboard', async () => {
  const { render, fireEvent, waitFor } = await getTestingLib();
  const { LoginPageView } = await getLoginPageModule();
  const { api, calls } = createMockApi();
  const routerHits: string[] = [];
  const routerStub = { push: async (href: string) => { routerHits.push(href); return true; } };

  const view = render(React.createElement(LoginPageView, { apiClient: api as any, routerOverride: routerStub }));
  fireEvent.input(view.getByLabelText(/email address/i), { target: { value: 'test@example.com' } });
  fireEvent.click(view.getByRole('button', { name: /send otp/i }));

  await waitFor(() => view.getByLabelText(/enter otp/i));
  fireEvent.change(view.getByLabelText(/enter otp/i), { target: { value: '123456' } });
  fireEvent.click(view.getByRole('button', { name: /verify & login/i }));

  await waitFor(() => {
    assert.equal(calls.verifyEmailOtp.length, 1);
    const payload = calls.verifyEmailOtp[0] as { email: string; otp: string };
    assert.equal(payload.email, 'test@example.com');
    assert.equal(payload.otp, '123456');
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

  // Fill registration form
  fireEvent.input(view.getByLabelText(/full name/i), { target: { value: 'John Doe' } });
  fireEvent.input(view.getByLabelText(/email/i), { target: { value: 'john@example.com' } });
  fireEvent.input(view.getByLabelText(/mobile number/i), { target: { value: '+919876543210' } });
  fireEvent.click(view.getByRole('button', { name: /register/i }));

  await waitFor(() => {
    assert.equal(calls.register.length, 1);
    const payload = calls.register[0] as { fullName: string; email: string; mobile: string };
    assert.equal(payload.fullName, 'John Doe');
    assert.equal(payload.email, 'john@example.com');
    assert.equal(payload.mobile, '+919876543210');
    assert.equal(routerHits[0], '/dashboard');
  });
});
