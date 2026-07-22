import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * GEO honesty guard (C-003). llms.txt and the site metadata / JSON-LD are the
 * surfaces ChatGPT / Claude / Google quote VERBATIM. R-089 removed the false
 * "local-first / stays on your device" storage claim from the UI because
 * storage is server-side — but it lingered in these machine-read surfaces,
 * feeding LLMs a claim the product does not deliver. These tests pin the
 * corrected copy so the false claim can never reappear where a model cites it.
 *
 * Note: "Draft saved on this device only" (guest localStorage draft) is a
 * DIFFERENT, true claim and is intentionally not covered here.
 */

const webRoot = path.join(__dirname, '..');
const llmsSrc = readFileSync(path.join(webRoot, 'app', 'llms.txt', 'route.ts'), 'utf-8');
const layoutSrc = readFileSync(path.join(webRoot, 'app', 'layout.tsx'), 'utf-8');

const FORBIDDEN = [
  /local-first/i,
  /your resume stays on your device/i,
  /local\/zero-knowledge storage/i,
  /zero-knowledge storage/i,
];

test('llms.txt makes no false local-first / on-device storage claim', () => {
  for (const pattern of FORBIDDEN) {
    assert(!pattern.test(llmsSrc), `llms.txt must not claim: ${pattern}`);
  }
  // Positive: the true privacy claim is present and citable. Normalise
  // whitespace so a line wrap inside the markdown body doesn't hide a phrase.
  const flat = llmsSrc.replace(/\s+/g, ' ');
  assert(/encrypted in transit and at rest/i.test(flat), 'llms.txt states the true storage claim');
  assert(/never used to train AI without/i.test(flat), 'llms.txt states the true training-opt-in claim');
});

test('site metadata + JSON-LD make no false local-first / on-device storage claim', () => {
  // Scope to the machine-read description/JSON-LD area, not incidental
  // comments elsewhere in the file.
  for (const pattern of FORBIDDEN) {
    assert(!pattern.test(layoutSrc), `layout.tsx metadata must not claim: ${pattern}`);
  }
});

test('the served /llms.txt body is clean (exercises the route, not just source)', async () => {
  const mod = await import('@/app/llms.txt/route');
  const res = mod.GET();
  const body = await res.text();
  for (const pattern of FORBIDDEN) {
    assert(!pattern.test(body), `served llms.txt must not claim: ${pattern}`);
  }
  assert(body.includes('CallbackCV'), 'served llms.txt describes the product');
});
