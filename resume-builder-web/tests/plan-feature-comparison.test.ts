import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Source-level guardrails for the Free vs Paid feature matrix and the
 * ₹49 explainer on the billing page. The numbers in this UI must match
 * resume-builder-api/src/billing/plan-limits.ts — if a plan limit
 * changes server-side and this file is left stale, users get a wrong
 * promise on the billing page. These tests pin the contract.
 */

const src = readFileSync(
  path.resolve(__dirname, '..', 'src', 'components', 'PlanFeatureComparison.tsx'),
  'utf8',
);

test('exports the comparison table and the ₹49 explainer', () => {
  assert.match(src, /export default function PlanFeatureComparison/);
  assert.match(src, /export function MicroPaymentExplainer/);
});

test('quotas match plan-limits.ts source of truth', () => {
  // FREE: 2 resumes / 2 ATS scans / 5 PDFs / 8000 tokens
  assert.match(src, /Saved resumes[\s\S]*?free:\s*'2'/);
  assert.match(src, /ATS scans \/ month[\s\S]*?free:\s*'2'/);
  assert.match(src, /PDF \+ Word exports \/ month[\s\S]*?free:\s*'5/);
  assert.match(src, /AI tokens \/ month[\s\S]*?free:\s*'8,000'/);
  // STUDENT quotas
  assert.match(src, /student:\s*'10'/);
  assert.match(src, /student:\s*'50'/);
  assert.match(src, /student:\s*'25 \(included\)'/);
  assert.match(src, /student:\s*'40,000'/);
  // PRO quotas
  assert.match(src, /pro:\s*'100'/);
  assert.match(src, /pro:\s*'300'/);
  assert.match(src, /pro:\s*'200 \(included\)'/);
  assert.match(src, /pro:\s*'120,000'/);
});

test('plan prices match plan-limits.ts (₹199 Student, ₹499 Pro)', () => {
  assert.match(src, /₹199\/mo/);
  assert.match(src, /₹499\/mo/);
});

test('₹49 explainer states what the micro-payment unlocks', () => {
  assert.match(src, /₹49/);
  assert.match(src, /per export/i);
  assert.match(src, /One ATS-optimized PDF download/);
  assert.match(src, /Word \(\.docx\) export/);
  assert.match(src, /15-minute download window/);
  assert.match(src, /GST invoice/);
});

test('explainer up-sells to Student plan with break-even pitch', () => {
  assert.match(src, /Student plan at ₹199\/mo/);
  assert.match(src, /breaks even at 5 downloads/);
});

test('comparison table calls out Pro-only features', () => {
  // Pro-exclusives must be false for FREE and STUDENT
  assert.match(
    src,
    /Mentor Chat[^}]*free:\s*false[^}]*student:\s*false[^}]*pro:\s*true/,
  );
  assert.match(
    src,
    /Interview Prep Cards[^}]*free:\s*false[^}]*student:\s*false[^}]*pro:\s*true/,
  );
});

test('GST disclosure is present', () => {
  assert.match(src, /GST/);
});
