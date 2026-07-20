import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';

process.env.NEXT_TEST_MOCK_ROUTER = '1';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/templates/preview' });
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
(globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame =
  (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);

if (typeof (dom.window as unknown as { matchMedia?: unknown }).matchMedia !== 'function') {
  Object.defineProperty(dom.window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
(globalThis as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
  (dom.window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia;

// No real network in tests — anything that slips past the injected apiClient
// fails loudly instead of leaving pending sockets.
(globalThis as unknown as { fetch: typeof fetch }).fetch = (() =>
  Promise.reject(new Error('network disabled in tests'))) as typeof fetch;

type TestingLib = typeof import('@testing-library/react');
type PreviewClientModule = typeof import('@/app/templates/preview/TemplatePreviewPageClient');

let testingLibPromise: Promise<TestingLib> | null = null;
let previewClientPromise: Promise<PreviewClientModule> | null = null;

function getTestingLib() {
  if (!testingLibPromise) {
    testingLibPromise = import('@testing-library/react');
  }
  return testingLibPromise;
}

function getPreviewClientModule() {
  if (!previewClientPromise) {
    previewClientPromise = import('@/app/templates/preview/TemplatePreviewPageClient');
  }
  return previewClientPromise;
}

test.afterEach(async () => {
  const { cleanup } = await getTestingLib();
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

test.after(() => {
  try {
    (dom.window as unknown as { close?: () => void }).close?.();
  } catch {
    // ignore — best-effort teardown.
  }
});

const appDir = path.join(__dirname, '..', 'app', 'templates', 'preview');

test('/templates/preview page shell is public (no AuthGate) and keeps metadata', () => {
  const pageContent = readFileSync(path.join(appDir, 'page.tsx'), 'utf-8');
  assert(!pageContent.includes('AuthGate'), 'Template preview page must not be auth-walled');
  assert(pageContent.includes('metadata'), 'Template preview page should export page metadata');
});

test('preview client no longer dead-ends logged-out visitors', () => {
  const clientContent = readFileSync(path.join(appDir, 'TemplatePreviewPageClient.tsx'), 'utf-8');
  assert(
    !clientContent.includes('Please sign in to preview templates.'),
    'Sample mode replaced the sign-in error for logged-out visitors',
  );
  assert(
    clientContent.includes('resolveCurrentSessionResumeId'),
    'Authed path still resolves resume ids through the shared explicit-selection helper',
  );
});

test('logged-out visitor gets the sample gallery + sign-up banner and NO getResume call', async () => {
  const { render, screen, waitFor } = await getTestingLib();
  const { default: TemplatePreviewPageClient } = await getPreviewClientModule();
  const { templates } = await import('@/src/components/TemplatePreview');

  const calls: string[] = [];
  const apiClient = {
    getResume: async (id: string) => {
      calls.push(`getResume:${id}`);
      throw new Error('getResume must not be called in sample mode');
    },
    updateResume: async (id: string) => {
      calls.push(`updateResume:${id}`);
      throw new Error('updateResume must not be called in sample mode');
    },
  } as unknown as import('@/app/templates/preview/TemplatePreviewPageClient').TemplatePreviewApiClient;

  render(
    <TemplatePreviewPageClient
      apiClient={apiClient}
      routerOverride={{ push: async () => true, replace: async () => true }}
      searchParamsOverride={new URLSearchParams()}
    />,
  );

  await waitFor(() => {
    assert(
      screen.getByTestId('template-sample-banner'),
      'Sample-mode banner should render for logged-out visitors',
    );
  });
  assert(
    screen.getByText(/previewing with sample data/i),
    'Banner should explain the sample-data preview',
  );
  // Auth CTAs carry a validated ?next=<path> so a fresh sign-up returns
  // to the editor with this template preselected (see app/auth/next-param.ts).
  const registerLink = screen.getByRole('link', { name: /start my resume/i }) as HTMLAnchorElement;
  assert(registerLink.getAttribute('href')?.startsWith('/auth/register?next='), 'Banner should link to register with next=');
  assert(registerLink.getAttribute('href')?.includes(encodeURIComponent('/resume/start?template=')), 'next= should target the editor start path');
  const loginLink = screen.getByRole('link', { name: /^sign in$/i }) as HTMLAnchorElement;
  assert(loginLink.getAttribute('href')?.startsWith('/auth/login?next='), 'Banner should link to login with next=');

  // Full gallery renders — one selectable card per registered template.
  const cards = document.querySelectorAll('button.template-gallery-card');
  assert.equal(cards.length, templates.length, 'Every template should render a sample gallery card');

  // Primary per-template CTA routes to sign-up, never an authed API.
  const cta = screen.getByRole('link', { name: /use this template/i }) as HTMLAnchorElement;
  assert(cta.getAttribute('href')?.startsWith('/auth/register'), 'Sample-mode CTA should route to register');

  assert.deepEqual(calls, [], 'Sample mode must not fire any authenticated API calls');
});

test('sample-mode gallery switches the live preview template on click', async () => {
  const { render, screen, waitFor, fireEvent } = await getTestingLib();
  const { default: TemplatePreviewPageClient } = await getPreviewClientModule();
  const { templates } = await import('@/src/components/TemplatePreview');
  const target = templates[1];

  render(
    <TemplatePreviewPageClient
      routerOverride={{ push: async () => true, replace: async () => true }}
      searchParamsOverride={new URLSearchParams()}
    />,
  );

  await waitFor(() => {
    assert(screen.getByTestId('template-sample-banner'));
  });

  const cards = Array.from(document.querySelectorAll('button.template-gallery-card'));
  const targetCard = cards.find((card) => card.textContent?.includes(target.name));
  assert(targetCard, `Gallery should include a card for ${target.name}`);
  fireEvent.click(targetCard!);

  await waitFor(() => {
    assert.equal(
      targetCard!.getAttribute('aria-pressed'),
      'true',
      'Clicked template card should become the selected preview',
    );
  });
});
