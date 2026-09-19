import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

/**
 * R-108 — exporting the version the user actually reviewed.
 *
 * The download link used to carry only a resumeId, so a user could tailor
 * a resume to a job, log the application against the tailored version,
 * and download the ORIGINAL. The outcome graph then recorded a reply
 * against a document the employer never saw, which is the C-007
 * attribution link breaking without anyone noticing.
 *
 * These drive the real api client against a stubbed fetch rather than
 * grepping source text, so a refactor that keeps the behaviour keeps the
 * tests passing.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.localStorage = dom.window.localStorage;

// Imported after the DOM exists — the module touches window on load.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = require('../src/lib/api') as typeof import('../src/lib/api');

const originalFetch = globalThis.fetch;

function captureRequestUrl(): { urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return {
      ok: true,
      status: 200,
      headers: new dom.window.Headers({ 'content-type': 'application/pdf' }),
      blob: async () => new dom.window.Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response;
  }) as typeof fetch;
  return { urls };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});

test('downloadPdf sends versionId so the tailored version is what downloads', async () => {
  const { urls } = captureRequestUrl();
  try {
    await api.downloadPdf('r1', 'classic', undefined, 'name', 'v-tailored');
  } catch {
    // Blob/anchor plumbing is jsdom-dependent; the request URL is the contract.
  }
  const request = urls.find((u) => u.includes('/resumes/r1/pdf'));
  assert.ok(request, 'a PDF request must be issued');
  const url = new URL(request!);
  assert.equal(url.searchParams.get('versionId'), 'v-tailored');
  assert.equal(url.searchParams.get('templateId'), 'classic');
});

test('downloadPdf omits versionId entirely when exporting the live resume', async () => {
  const { urls } = captureRequestUrl();
  try {
    await api.downloadPdf('r1', 'classic');
  } catch {
    // as above
  }
  const request = urls.find((u) => u.includes('/resumes/r1/pdf'));
  assert.ok(request);
  // Not "versionId=" empty — absent, so the API takes its live-resume path.
  assert.equal(new URL(request!).searchParams.has('versionId'), false);
});

test('the template page reads versionId and passes it to the export', () => {
  // Behaviour here needs a full React render (quarantined in this repo),
  // so pin the two wiring points that make the flow work end to end.
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const source = readFileSync(
    path.join(__dirname, '..', 'app', 'resume', 'template', 'TemplateSelectionView.tsx'),
    'utf-8',
  );
  assert.match(source, /searchParams\.get\('versionId'\)/, 'the page must read the version from the link');
  assert.match(
    source,
    /downloadPdf\([^)]*versionId/s,
    'and hand it to the export, or the link parameter is decorative',
  );
  assert.match(
    source,
    /!versionId &&/,
    'exporting a version must not write design changes back to the live resume',
  );
});
