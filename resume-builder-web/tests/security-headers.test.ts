import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Pins the security-header contract that the print-preview flow
 * depends on.
 *
 * Bug being guarded: the editor's "Print preview" button mounts a
 * same-origin iframe pointing at /resume/template?print=1 and calls
 * window.print() on it. With frame-ancestors 'none' + X-Frame-Options
 * DENY (the old config), the browser refused to load that iframe at
 * all and the print dialog never appeared. The user-visible symptom
 * was "Print preview not working", and the console showed:
 *   Framing 'https://…onrender.com/' violates the following CSP
 *   directive: "frame-ancestors 'none'".
 *
 * The new contract:
 *   - frame-ancestors 'self'     ← allow our own routes only
 *   - X-Frame-Options SAMEORIGIN ← legacy-browser parity
 *   - everything ELSE in the CSP must stay tight (no 'unsafe-eval'
 *     in prod, frame-src still pinned to payment SDKs, etc.)
 *
 * If any of these three pins regress, this test fails before the
 * fix ships.
 */

const cfg = readFileSync(
  path.resolve(__dirname, '..', 'next.config.mjs'),
  'utf8',
);

test("frame-ancestors is 'self', not 'none' — print preview needs same-origin iframe", () => {
  assert.match(cfg, /"frame-ancestors 'self'"/);
  assert.doesNotMatch(cfg, /"frame-ancestors 'none'"/);
});

test('X-Frame-Options is SAMEORIGIN (matches the CSP, lets legacy browsers print)', () => {
  assert.match(cfg, /X-Frame-Options['"\s:,]+value:\s*'SAMEORIGIN'/);
  assert.doesNotMatch(cfg, /X-Frame-Options['"\s:,]+value:\s*'DENY'/);
});

test('clickjacking protection against THIRD parties is still in place', () => {
  // 'self' blocks every origin that is not our own. The combination
  // of frame-ancestors 'self' + X-Frame-Options SAMEORIGIN means an
  // attacker at evil.com cannot embed our editor in a clickjacking
  // overlay. This test pins that the directive isn't accidentally
  // relaxed to '*' or to a wildcard host.
  assert.doesNotMatch(cfg, /"frame-ancestors [^"]*\*/);
  assert.doesNotMatch(cfg, /"frame-ancestors 'self' [^"]/);
});

test('Razorpay + Stripe frame-src allow-list is still intact', () => {
  // Regression guard: when relaxing frame-ancestors it is easy to
  // also delete the frame-src line and break checkout.
  assert.match(cfg, /frame-src 'self' https:\/\/api\.razorpay\.com https:\/\/checkout\.razorpay\.com https:\/\/js\.stripe\.com/);
});

test('CSP still locks down the other directives we care about', () => {
  assert.match(cfg, /"object-src 'none'"/);
  assert.match(cfg, /"base-uri 'self'"/);
  assert.match(cfg, /"form-action 'self'"/);
});
