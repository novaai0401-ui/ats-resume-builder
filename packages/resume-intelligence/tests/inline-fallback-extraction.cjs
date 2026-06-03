const assert = require('node:assert/strict');
const test = require('node:test');
const {
  extractInlineLanguages,
  extractInlineCertifications,
  extractInlineAchievements,
} = require('../dist/field-mapper.js');

// Inline-fallback extractors: ONLY fire when the dedicated section
// returned nothing, so they can be aggressive about pulling from
// experience bullets without trampling existing data. These tests
// pin the precision (catch real mentions) AND the recall guards
// (don't false-positive on common tech-bullet noise).

// ---------------------------------------------------------------------
// extractInlineLanguages — needs an explicit intro word
// ---------------------------------------------------------------------

test('pulls languages introduced by "Speaks X, Y"', () => {
  const out = extractInlineLanguages(['Speaks English and Hindi at home.']);
  assert.deepEqual(out.sort(), ['English', 'Hindi']);
});

test('pulls languages introduced by "Fluent in X"', () => {
  const out = extractInlineLanguages(['Fluent in Spanish, French, and German.']);
  assert.deepEqual(out.sort(), ['French', 'German', 'Spanish']);
});

test('pulls languages introduced by "Languages known: X, Y"', () => {
  const out = extractInlineLanguages(['Languages known: Marathi, Tamil, English.']);
  assert.deepEqual(out.sort(), ['English', 'Marathi', 'Tamil']);
});

test('does NOT false-positive on tech words that LOOK like languages', () => {
  // "Java" is not Javanese, "C" is not Cantonese. Without an intro
  // word these stay out of the languages list.
  const out = extractInlineLanguages([
    'Built backend services in Java and C++ using Docker.',
    'Wrote production code in Python and JavaScript daily.',
  ]);
  assert.deepEqual(out, []);
});

test('stops at the first sentence-end so unrelated content does not leak in', () => {
  const out = extractInlineLanguages([
    'Fluent in English. Built React apps and led teams.',
  ]);
  assert.deepEqual(out, ['English']);
});

test('handles empty / null / undefined entries safely', () => {
  assert.deepEqual(extractInlineLanguages([]), []);
  assert.deepEqual(extractInlineLanguages([null, undefined, '']), []);
});

// ---------------------------------------------------------------------
// extractInlineCertifications — must look like a real credential
// ---------------------------------------------------------------------

test('pulls AWS-prefixed certs out of a bullet', () => {
  const out = extractInlineCertifications([
    'Earned the AWS Certified Solutions Architect Associate in 2023.',
  ]);
  assert.equal(out.length, 1);
  assert.match(out[0].name, /AWS Certified Solutions Architect/);
  assert.equal(out[0].date, '2023');
});

test('pulls PMP / CISSP-style standalone codes', () => {
  const out = extractInlineCertifications([
    'PMP certified since 2021.',
  ]);
  assert.equal(out.length, 1);
  assert.match(out[0].name, /PMP/);
});

test('dedupes the same cert mentioned twice across bullets', () => {
  const out = extractInlineCertifications([
    'Hold the AWS Certified Developer Associate credential.',
    'Renewed the AWS Certified Developer Associate in 2024.',
  ]);
  assert.equal(out.length, 1);
});

test('ignores bullets that mention tech but no credential', () => {
  const out = extractInlineCertifications([
    'Built apps on AWS and deployed via Docker.',
    'Worked extensively with Azure and Kubernetes.',
  ]);
  assert.deepEqual(out, []);
});

test('caps the result to avoid noisy mega-lists', () => {
  // Generate 12 fake cert bullets — should keep at most 8.
  const bullets = Array.from({ length: 12 }, (_, i) =>
    `Earned the AWS Certified Specialty Cert${i} Associate in 2023.`,
  );
  const out = extractInlineCertifications(bullets);
  assert.ok(out.length <= 8);
});

// ---------------------------------------------------------------------
// extractInlineAchievements — must carry an award / recognition word
// ---------------------------------------------------------------------

test('pulls awarded / recognized / won statements', () => {
  const out = extractInlineAchievements([
    'Won the Rising Star award twice for delivering high-impact features.',
    'Recognized by the CTO for ownership and engineering excellence.',
  ]);
  assert.equal(out.length, 2);
  assert.match(out[0], /Won the Rising Star/);
});

test('pulls "ranked top N%" recognition lines', () => {
  const out = extractInlineAchievements([
    'Ranked top 1% of engineers in the annual performance review.',
  ]);
  assert.equal(out.length, 1);
});

test('ignores ordinary tech bullets without an achievement signal word', () => {
  const out = extractInlineAchievements([
    'Built a React-based dashboard with TypeScript and Redux.',
    'Led the migration of CI/CD pipelines to GitHub Actions.',
  ]);
  assert.deepEqual(out, []);
});

test('skips lines that are too short (header-like) or too long', () => {
  const tooShort = 'Won award';
  const tooLong = 'Won an award. ' + 'X'.repeat(400);
  const out = extractInlineAchievements([tooShort, tooLong]);
  assert.deepEqual(out, []);
});

test('dedupes identical achievement lines', () => {
  const line = 'Recognized by the CEO for delivering the Q3 launch on time.';
  const out = extractInlineAchievements([line, line, line]);
  assert.equal(out.length, 1);
});
