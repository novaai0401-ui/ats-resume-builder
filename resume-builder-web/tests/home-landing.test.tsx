import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';

process.env.NEXT_TEST_MOCK_ROUTER = '1';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
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

(globalThis as unknown as { fetch: typeof fetch }).fetch = (() =>
  Promise.reject(new Error('network disabled in tests'))) as typeof fetch;

type TestingLib = typeof import('@testing-library/react');
let testingLibPromise: Promise<TestingLib> | null = null;
function getTestingLib() {
  if (!testingLibPromise) testingLibPromise = import('@testing-library/react');
  return testingLibPromise;
}

// HomeLanding calls next/navigation useRouter(); mount a no-op App Router
// context so the client component renders in jsdom without a real Next app.
async function AppRouterWrapper({ children }: { children: React.ReactNode }) {
  const { AppRouterContext } = await import(
    'next/dist/shared/lib/app-router-context.shared-runtime'
  );
  const router = {
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  } as unknown as import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterInstance;
  return React.createElement(AppRouterContext.Provider, { value: router }, children);
}

async function renderLanding(faq: { q: string; a: string }[]) {
  const { render } = await getTestingLib();
  const { default: HomeLanding } = await import('@/src/components/HomeLanding');
  const wrapped = await AppRouterWrapper({ children: React.createElement(HomeLanding, { faq }) });
  return render(wrapped);
}

test.afterEach(async () => {
  const { cleanup } = await getTestingLib();
  cleanup();
});

test.after(() => {
  try {
    (dom.window as unknown as { close?: () => void }).close?.();
  } catch {
    // best-effort teardown
  }
});

const appDir = path.join(__dirname, '..', 'app');
const pageSrc = readFileSync(path.join(appDir, 'page.tsx'), 'utf-8');

// --- Source-level invariants: the server page keeps the SEO surface -------

test('home page.tsx keeps the FAQPage JSON-LD and page metadata server-side', () => {
  assert(pageSrc.includes('export const metadata'), 'metadata export must stay on the server page');
  assert(pageSrc.includes("'@type': 'FAQPage'"), 'FAQPage JSON-LD must stay on the server page');
  assert(pageSrc.includes('<HomeLanding'), 'server page delegates the visible UI to HomeLanding');
});

test('home page.tsx passes the same FAQ array to the JSON-LD and to the visible accordion', () => {
  // A single FAQ source feeds both the structured data and the on-page
  // accordion, so Google never sees answers that are not rendered.
  assert(pageSrc.includes('faq={FAQ}'), 'the FAQ array must be handed to HomeLanding for on-page rendering');
  assert(pageSrc.includes('mainEntity: FAQ.map'), 'the same FAQ array must back the JSON-LD');
});

// --- Render: the landing is built on tekivex-ui and stays honest ----------

test('HomeLanding renders the tekivex-ui design system, not raw .btn/.card markup', async () => {
  const faq = [{ q: 'Is CallbackCV free?', a: 'Yes, building and editing is free forever.' }];

  const { container } = await renderLanding(faq);

  // The single <h1> is a real heading (TkxTitle level=1), good for SEO.
  const h1s = container.querySelectorAll('h1');
  assert.equal(h1s.length, 1, 'exactly one <h1>');
  assert(/callbacks/i.test(h1s[0].textContent ?? ''), 'h1 carries the callback differentiator');

  // tekivex-ui components actually mounted (their class prefix is `tkx-`).
  assert(container.querySelector('[class*="tkx-"]'), 'tekivex-ui components should be present');

  // The rebuilt CTA rows use TkxButton, not the legacy .btn class.
  // (JdQuickStart, an embedded R-090 component, keeps its own styling.)
  const ctaRows = container.querySelectorAll('.home-cta-row');
  assert(ctaRows.length >= 2, 'hero + final CTA rows render');
  for (const row of ctaRows) {
    assert(!row.querySelector('.btn'), 'CTA rows use TkxButton, not legacy .btn');
    assert(row.querySelector('button[class*="tkx-"]'), 'CTA rows contain tekivex buttons');
  }
});

test('HomeLanding renders every FAQ answer on-page (SEO parity with the JSON-LD)', async () => {
  const faq = [
    { q: 'Is CallbackCV free?', a: 'ANSWER_ONE_SENTINEL building is free forever.' },
    { q: 'Is my data private?', a: 'ANSWER_TWO_SENTINEL never sold, never trained on.' },
  ];

  const { container } = await renderLanding(faq);
  const html = container.innerHTML;
  for (const item of faq) {
    assert(html.includes(item.a), `FAQ answer must be in the initial HTML for crawlers: ${item.a}`);
  }
});

test('HomeLanding stat strip stays honest — no fabricated user/callback counts (C-003)', async () => {
  const src = readFileSync(path.join(__dirname, '..', 'src', 'components', 'HomeLanding.tsx'), 'utf-8');
  // Guard against the classic vanity metrics creeping into the hero. The
  // product cannot substantiate a user count or an aggregate callback rate,
  // so those must not appear as TkxStatistic values.
  assert(!/\b\d[\d,]*\s*\+?\s*(users|resumes made|happy customers)/i.test(src), 'no fabricated user counts');
  assert(!/callback rate/i.test(src) || !/value=\{?\d/.test(src.split('callback rate')[0].slice(-80)), 'no fabricated aggregate callback rate stat');
});
