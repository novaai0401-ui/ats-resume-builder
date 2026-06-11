const assert = require('node:assert/strict');
const test = require('node:test');
const { __testables } = require('../dist/share-links/share-links.service.js');

/**
 * R-038 share-link contract tests.
 *
 * The integration path (create → public-read → revoke → 404) is
 * verified by hand in the local smoke run; these unit tests pin the
 * pieces that have to stay stable across refactors:
 *
 *   - slug shape (length, alphabet, no ambiguous chars)
 *   - sanitiseResumeForPublic strips everything the visitor doesn't
 *     need and applies maskContact correctly
 *   - the anon-id hash is deterministic per (slug, IP, UA) and
 *     different across slugs from the same IP (no cross-owner linkage)
 */

const { randomSlug, sanitiseResumeForPublic, anonIdFor } = __testables;

test('slug is 12 chars from a URL-safe alphabet (no 0/1/l)', () => {
  // Drops 0/1/l — the three chars most often confused in dictated
  // URLs ("Z-E-R-O or oh?"). 'o' is kept because it never collides
  // with another letter in the alphabet (no '0').
  for (let i = 0; i < 200; i += 1) {
    const slug = randomSlug();
    assert.equal(slug.length, 12);
    assert.match(slug, /^[a-z0-9]+$/);
    assert.doesNotMatch(slug, /[01l]/, 'avoid 0 / 1 / l in shared URLs');
  }
});

test('slug entropy: 200 draws produce 200 unique values', () => {
  // 12 chars × log2(33) ≈ 60 bits. Collisions at this batch size are
  // astronomically unlikely — if this ever fails the RNG is broken.
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(randomSlug());
  assert.equal(seen.size, 200);
});

test('sanitiseResumeForPublic strips userId / resumeId / unknown fields', () => {
  const raw = {
    id: 'r_abc',
    userId: 'u_abc',
    templateId: 'classic',
    secretInternalFlag: true,
    contact: { fullName: 'A', email: 'a@x.io', phone: '+91111' },
    summary: 'S',
    skills: ['React', '', null, 'Node'],
    experience: [{ company: 'Acme', role: 'TL' }],
    education: [{ institution: 'IIT', degree: 'B.E.' }],
    projects: [],
    achievements: ['Won x', '', null],
    certifications: [],
    languages: ['English'],
  };
  const out = sanitiseResumeForPublic(raw, false);
  // No leaked identifiers.
  assert.equal(out.id, undefined);
  assert.equal(out.userId, undefined);
  assert.equal(out.templateId, undefined);
  assert.equal(out.secretInternalFlag, undefined);
  // Falsy entries dropped from string arrays.
  assert.deepEqual(out.skills, ['React', 'Node']);
  assert.deepEqual(out.achievements, ['Won x']);
  // Contact preserved when maskContact is false.
  assert.equal(out.contact.email, 'a@x.io');
  assert.equal(out.contact.phone, '+91111');
});

test('sanitiseResumeForPublic with maskContact removes email + phone, keeps name', () => {
  const raw = {
    contact: { fullName: 'A', email: 'a@x.io', phone: '+91111', location: 'Pune' },
  };
  const out = sanitiseResumeForPublic(raw, true);
  assert.equal(out.contact.fullName, 'A');
  assert.equal(out.contact.location, 'Pune');
  assert.equal(out.contact.email, undefined);
  assert.equal(out.contact.phone, undefined);
});

test('anonIdFor is deterministic per (slug, ip, ua)', () => {
  const req = { headers: { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'Mozilla/5.0 Test' }, socket: {} };
  assert.equal(anonIdFor(req, 'slug1'), anonIdFor(req, 'slug1'));
});

test('anonIdFor differs across slugs for the same visitor', () => {
  // Two different owners (different slugs) seeing visits from the same
  // recruiter IP must NOT produce the same anon id — otherwise the
  // dashboard would cross-link visitors across owners (privacy leak).
  const req = { headers: { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'Mozilla/5.0 Test' }, socket: {} };
  assert.notEqual(anonIdFor(req, 'slug1'), anonIdFor(req, 'slug2'));
});

test('anonIdFor differs for different IPs viewing the same slug', () => {
  const a = { headers: { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'UA' }, socket: {} };
  const b = { headers: { 'x-forwarded-for': '198.51.100.7', 'user-agent': 'UA' }, socket: {} };
  assert.notEqual(anonIdFor(a, 'slug1'), anonIdFor(b, 'slug1'));
});
