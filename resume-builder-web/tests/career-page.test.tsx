import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

process.env.NEXT_TEST_MOCK_ROUTER = '1';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.self = dom.window as unknown as Window & typeof globalThis;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.requestAnimationFrame =
  dom.window.requestAnimationFrame?.bind(dom.window) ??
  ((callback: FrameRequestCallback) => setTimeout(callback, 0) as unknown as number);

/**
 * Smoke test for the /career route.
 *
 * We don't try to render the full Tekivex provider stack here (that has
 * portal + hydration quirks covered by the existing TopNav tests). Instead
 * we import the module and verify it exposes a default React component
 * export — enough to catch syntax errors, missing imports, and shape
 * regressions. Full end-to-end behavior is covered by the API tests that
 * guard the /quantum endpoints.
 */
test('career page default export is a React component', async () => {
  const mod: typeof import('@/app/career/page') = await import('@/app/career/page');
  assert.equal(typeof mod.default, 'function', 'page.tsx must export a default component');
});

test('pricing page default export is a React component', async () => {
  const mod: typeof import('@/app/pricing/page') = await import('@/app/pricing/page');
  assert.equal(typeof mod.default, 'function', 'page.tsx must export a default component');
});

test('shared industry taxonomy is available at runtime for the web client', async () => {
  const shared = await import('resume-builder-shared');
  assert.ok(Array.isArray(shared.INDUSTRIES));
  assert.ok(shared.INDUSTRIES.length >= 8);
  // sanity-check one recommendation call so we know the dist build the web
  // client imports actually ships the quantum engine.
  const result = shared.recommendNextSkills({
    industryId: 'it',
    roleId: 'frontend-engineer',
    currentSkills: ['HTML'],
    limit: 3,
  });
  assert.equal(result.recommendations.length, 3);
});
