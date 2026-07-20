/**
 * Worked-example empty states (product critique fix).
 *
 * Logged-out /jd-match and /interview-prep must render a static sample
 * of the feature's output plus a register/sign-in CTA — and must fire
 * ZERO network calls while doing it.
 */
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
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.requestAnimationFrame =
  dom.window.requestAnimationFrame?.bind(dom.window) ??
  ((callback: FrameRequestCallback) => setTimeout(callback, 0) as unknown as number);

// Any fetch from these logged-out pages is a bug — record instead of network.
const fetchCalls: string[] = [];
const fetchSpy = (async (input: unknown) => {
  fetchCalls.push(String(input));
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
}) as typeof fetch;
globalThis.fetch = fetchSpy;
(dom.window as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

function getTestingLib() {
  return import('@testing-library/react');
}

test.afterEach(async () => {
  const { cleanup } = await getTestingLib();
  cleanup();
});

test('logged-out /jd-match renders the sample report and CTA without API calls', async () => {
  const { render } = await getTestingLib();
  const { default: JdMatchClient } = await import('@/app/jd-match/JdMatchClient');

  localStorage.clear();
  fetchCalls.length = 0;
  const view = render(React.createElement(JdMatchClient));

  const sample = view.getByTestId('jd-match-sample');
  assert.ok(sample.textContent?.includes('Sample output'), 'sample section is labeled Sample output');
  assert.ok(sample.textContent?.includes('Frontend Developer @ Acme (sample)'));
  assert.ok(sample.textContent?.includes('68'), 'shows the 68% sample score');
  assert.equal(sample.querySelectorAll('.ats-chip--match').length, 4, '4 matched keyword chips');
  assert.equal(sample.querySelectorAll('.ats-chip--missing').length, 3, '3 missing keyword chips');
  assert.equal(sample.querySelectorAll('.bullet-rewrite-option').length, 1, 'one sample bullet suggestion');

  assert.ok(view.getByText(/See this for YOUR resume — free/i));
  const register = view.getByRole('link', { name: /create free account/i });
  assert.ok(register.getAttribute('href')?.startsWith('/auth/register'));

  assert.equal(fetchCalls.length, 0, 'no network calls from the logged-out page');
});

test('/jd-match consumes rb_pending_jd from the home-page quick start on mount', async () => {
  const { render, waitFor } = await getTestingLib();
  const { default: JdMatchClient } = await import('@/app/jd-match/JdMatchClient');

  localStorage.clear();
  localStorage.setItem('accessToken', 'test-access-token');
  localStorage.setItem('rb_pending_jd', 'We are hiring a Frontend Developer with React experience.');
  fetchCalls.length = 0;

  const view = render(React.createElement(JdMatchClient));
  await waitFor(() => {
    const textarea = view.container.querySelector('#jd-text') as HTMLTextAreaElement | null;
    assert.ok(textarea, 'authed page renders the JD textarea');
    assert.equal(textarea!.value, 'We are hiring a Frontend Developer with React experience.');
  });
  assert.equal(localStorage.getItem('rb_pending_jd'), null, 'pending JD is consumed (removed) after read');
  localStorage.clear();
});

test('logged-out /interview-prep renders two sample cards and CTA without API calls', async () => {
  const { render } = await getTestingLib();
  const { default: InterviewPrepClient } = await import('@/app/interview-prep/InterviewPrepClient');

  localStorage.clear();
  fetchCalls.length = 0;
  const view = render(React.createElement(InterviewPrepClient));

  const sample = view.getByTestId('interview-prep-sample');
  assert.equal(sample.querySelectorAll('.prep-card').length, 2, 'two sample cards');
  assert.ok(sample.textContent?.includes('Behavioral'), 'one behavioral card');
  assert.ok(sample.textContent?.includes('Technical'), 'one technical card');
  assert.ok(sample.textContent?.includes('Why this is asked:'), 'shows the why-they-ask structure');
  assert.ok(sample.textContent?.includes('Answer outline:'), 'shows the outline structure');

  assert.ok(view.getByText(/See this for YOUR resume — free/i));
  const register = view.getByRole('link', { name: /create free account/i });
  assert.ok(register.getAttribute('href')?.startsWith('/auth/register'));

  assert.equal(fetchCalls.length, 0, 'no network calls from the logged-out page');
});
