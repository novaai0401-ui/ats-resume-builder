import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Source-level guardrails for the Free vs Paid feature matrix and the
 * ₹49 explainer on the billing page.
 *
 * Post-pivot (R-071) there is ONE paid plan — "CallbackCV Plus" at
 * ₹499/mo (the 'PRO' value internally). The Free column doubles as the
 * BYOK path. The numbers must match
 * resume-builder-api/src/billing/plan-limits.ts (FREE + PRO).
 */

const src = readFileSync(
  path.resolve(__dirname, '..', 'src', 'components', 'PlanFeatureComparison.tsx'),
  'utf8',
);

test('exports the comparison table and the ₹49 explainer', () => {
  assert.match(src, /export default function PlanFeatureComparison/);
  assert.match(src, /export function MicroPaymentExplainer/);
});

test('quotas match plan-limits.ts source of truth (FREE + Plus/PRO)', () => {
  // FREE: 2 resumes / 2 ATS scans; AI runs on the user's own key.
  assert.match(src, /Saved resumes[\s\S]*?free:\s*'2'/);
  assert.match(src, /ATS scans \/ month[\s\S]*?free:\s*'2'/);
  assert.match(src, /AI tokens \/ month[\s\S]*?free:\s*'Your own key'/);
  // Plus (PRO) quotas: 100 resumes / 300 scans / 120,000 tokens.
  assert.match(src, /plus:\s*'100'/);
  assert.match(src, /plus:\s*'300'/);
  assert.match(src, /plus:\s*'120,000'/);
});

test('single paid plan is ₹499/mo and labelled CallbackCV Plus', () => {
  assert.match(src, /CallbackCV Plus/);
  assert.match(src, /₹499\/mo/);
  // No legacy tiers/prices should linger.
  assert.doesNotMatch(src, /₹199/);
  assert.doesNotMatch(src, /₹399/);
  assert.doesNotMatch(src, /₹799/);
});

test('₹49 explainer states what the micro-payment unlocks', () => {
  assert.match(src, /₹49/);
  assert.match(src, /per export/i);
  assert.match(src, /One ATS-optimized PDF download/);
  assert.match(src, /Word \(\.docx\) export/);
  assert.match(src, /15-minute download window/);
  assert.match(src, /GST invoice/);
});

test('explainer up-sells the ₹499 Plus plan and the free BYOK path', () => {
  assert.match(src, /CallbackCV Plus at ₹499\/mo/);
  assert.match(src, /own AI key/);
});

test('Plus-only perks are not on Free', () => {
  assert.match(src, /Salary band hints[^}]*free:\s*false[^}]*plus:\s*true/);
  assert.match(src, /Priority AI queue[^}]*free:\s*false[^}]*plus:\s*true/);
});

test('GST disclosure is present', () => {
  assert.match(src, /GST/);
});
