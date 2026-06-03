const assert = require('node:assert/strict');
const test = require('node:test');
const { parseResumeText, mapParsedResume } = require('../dist/index.js');
const { normalizeHeading } = require('../dist/section-normalizer.js');

// Regression fixtures from a real two-column resume (Chandan Kumar)
// where the lower sections are interleaved by the PDF reading order:
//
//   EDUCATION
//   ACHIEVEMENTS
//   Spearheaded the Speedboat Project ...
//   Received the prestigious 'Rising Star' award ...
//   LANGUAGES
//   English, Hindi
//   HOBBIES
//   ...
//
// Achievements are now a DEDICATED section (resume schema has an
// `achievements: string[]` field). They must NOT be folded into
// projects, and languages must still be extracted.

const SAMPLE = [
  'CHANDAN KUMAR',
  'Tech Lead | AVP - Full Stack Engineering',
  'Phone: 9307003382',
  'E-mail: cks011992@gmail.com',
  '',
  'PROFESSIONAL SUMMARY',
  '- 11 years of experience in the IT industry delivering high-ROI software solutions for enterprise clients.',
  '- Hands-on expertise in ReactJS, Redux, NodeJS, MongoDB, and full-stack architecture.',
  '',
  'SKILLS',
  'Technical Skills: HTML5, CSS3, JavaScript, ReactJS, Redux, NodeJS, MongoDB, NextJS, Python',
  'Soft Skills: Communication, Teamwork, Leadership, Problem-solving',
  '',
  'WORK EXPERIENCE',
  'AVP',
  'Citi Corp (Pune)',
  '(Dec 2022 - Present)',
  '- Led a team of 10+ engineers to deliver high-performance frontend modules using ReactJS and NodeJS.',
  '- Coached junior developers and reduced defect rates by 30%.',
  '',
  'ACHIEVEMENTS',
  'Spearheaded the Speedboat Project with a 9-member team, delivering the MVP 2 weeks ahead of schedule with <2% post-release defects.',
  "Received the prestigious 'Rising Star' award twice for consistently delivering high-impact IT solutions.",
  '',
  'LANGUAGES',
  'English, Hindi',
  '',
  'HOBBIES',
  'Playing chess to enhance strategic thinking.',
].join('\n');

test('"Achievements" / "Awards" / "Honors" headings normalise to the achievements section', () => {
  assert.equal(normalizeHeading('Achievements'), 'achievements');
  assert.equal(normalizeHeading('ACHIEVEMENTS'), 'achievements');
  assert.equal(normalizeHeading('Awards & Honors'), 'achievements');
  assert.equal(normalizeHeading('Awards and Recognition'), 'achievements');
  assert.equal(normalizeHeading('Key Achievements'), 'achievements');
});

test('"Projects" still normalises to projects (not stolen by achievements)', () => {
  assert.equal(normalizeHeading('Projects'), 'projects');
  assert.equal(normalizeHeading('Notable Projects'), 'projects');
  assert.equal(normalizeHeading('Open Source Contributions'), 'projects');
});

test('achievements are extracted into their own list, NOT into projects', () => {
  const mapped = mapParsedResume(parseResumeText(SAMPLE));
  const achievements = mapped.achievements || [];
  assert.ok(achievements.length >= 2, `expected >=2 achievements, got ${achievements.length}`);
  assert.ok(
    achievements.some((a) => /Speedboat Project/.test(a)),
    'Speedboat achievement should be present',
  );
  assert.ok(
    achievements.some((a) => /Rising Star/.test(a)),
    'Rising Star award should be present',
  );
  // And crucially: no phantom project named "Project".
  const projects = mapped.projects || [];
  assert.equal(
    projects.find((p) => p.name === 'Project'),
    undefined,
    'achievements must not surface as a generic "Project"',
  );
});

test('languages "English, Hindi" are still extracted from the interleaved layout', () => {
  const mapped = mapParsedResume(parseResumeText(SAMPLE));
  assert.ok((mapped.languages || []).includes('English'));
  assert.ok((mapped.languages || []).includes('Hindi'));
});

test('each extracted achievement is a non-empty trimmed string', () => {
  const mapped = mapParsedResume(parseResumeText(SAMPLE));
  for (const a of mapped.achievements || []) {
    assert.equal(typeof a, 'string');
    assert.equal(a, a.trim());
    assert.ok(a.length > 0);
  }
});
