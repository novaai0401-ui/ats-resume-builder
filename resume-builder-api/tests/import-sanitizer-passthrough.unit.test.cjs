const assert = require('node:assert/strict');
const test = require('node:test');
const { sanitizeImportedResume } = require('../dist/resume/import-sanitizer.js');

// Regression guard: the sanitizer USED to drop languages, technical
// skills, soft skills, and achievements before the data ever reached
// the client, which is why uploaded Languages and Achievements
// sections rendered as "0 languages" / "0 achievements" in the
// editor even though the parser extracted them cleanly upstream.
// These tests pin that the sanitizer now forwards every plain
// string-list field end to end.

function input(overrides) {
  return {
    title: 'Engineer Resume',
    contact: { fullName: 'Jane Engineer', email: 'jane@example.com' },
    summary: 'Senior engineer with 8 years of experience.',
    skills: ['React', 'TypeScript'],
    technicalSkills: ['React', 'TypeScript'],
    softSkills: ['Collaboration', 'Communication'],
    languages: ['English', 'Hindi'],
    experience: [
      {
        company: 'Acme',
        role: 'Engineer',
        startDate: '2020-01',
        endDate: 'Present',
        highlights: ['Built a thing'],
      },
    ],
    education: [
      { institution: 'IIT', degree: 'B.Tech', startDate: '2015-08', endDate: '2019-06' },
    ],
    projects: [],
    certifications: [],
    achievements: ['Won the Rising Star award twice', 'Spearheaded the Speedboat MVP'],
    ...overrides,
  };
}

test('sanitizer preserves languages on upload', () => {
  const out = sanitizeImportedResume(input(), { mode: 'upload' });
  assert.deepEqual(out.languages, ['English', 'Hindi']);
});

test('sanitizer preserves achievements on upload', () => {
  const out = sanitizeImportedResume(input(), { mode: 'upload' });
  assert.equal((out.achievements || []).length, 2);
  assert.ok(out.achievements?.[0].includes('Rising Star'));
});

test('sanitizer preserves the categorised skill buckets', () => {
  const out = sanitizeImportedResume(input(), { mode: 'upload' });
  assert.deepEqual(out.technicalSkills, ['React', 'TypeScript']);
  assert.deepEqual(out.softSkills, ['Collaboration', 'Communication']);
});

test('sanitizer trims + dedupes language and achievement entries', () => {
  const out = sanitizeImportedResume(
    input({
      languages: ['  English  ', 'English', 'Hindi', '   '],
      achievements: ['Won award', '  Won award  ', '', 'Recognised by CTO'],
    }),
    { mode: 'upload' },
  );
  assert.deepEqual(out.languages, ['English', 'Hindi']);
  assert.deepEqual(out.achievements, ['Won award', 'Recognised by CTO']);
});

test('sanitizer accepts undefined / missing optional lists without crashing', () => {
  const out = sanitizeImportedResume(
    {
      title: 'X',
      contact: { fullName: 'X Y' },
      summary: 'A meaningful summary that is long enough.',
      skills: ['React'],
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      // languages, technicalSkills, softSkills, achievements ALL absent
    },
    { mode: 'upload' },
  );
  // Should default to empty arrays, not undefined exceptions.
  assert.ok(Array.isArray(out.languages));
  assert.ok(Array.isArray(out.achievements));
  assert.ok(Array.isArray(out.technicalSkills));
  assert.ok(Array.isArray(out.softSkills));
});

test('persist mode (post-edit save) preserves the same fields', () => {
  // The same sanitizer runs on persist too — must not drop these on
  // the save round trip either.
  const out = sanitizeImportedResume(input(), { mode: 'persist' });
  assert.deepEqual(out.languages, ['English', 'Hindi']);
  assert.equal((out.achievements || []).length, 2);
});
