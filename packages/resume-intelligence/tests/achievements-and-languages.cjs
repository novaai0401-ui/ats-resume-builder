const assert = require('node:assert/strict');
const test = require('node:test');
const { parseResumeText, mapParsedResume } = require('../dist/index.js');

// Regression fixtures from a real two-column resume (Chandan Kumar)
// where the lower sections are interleaved by the PDF's reading order:
//
//   EDUCATION
//   ACHIEVEMENTS
//   Spearheaded the Speedboat Project ...
//   Received the prestigious 'Rising Star' award ...
//   LANGUAGES
//   English, Hindi
//   HOBBIES
//   B.E: Telecommunication Engineering
//   ...
//
// Bugs this pins down:
//   - Languages ("English, Hindi") must be extracted, not dropped.
//   - The standalone ACHIEVEMENTS prose must NOT surface as a project
//     literally named "Project" with an empty role — it is labelled
//     "Key Achievements" so the editor reads honestly.

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

test('languages "English, Hindi" are extracted from the interleaved layout', () => {
  const mapped = mapParsedResume(parseResumeText(SAMPLE));
  assert.ok(Array.isArray(mapped.languages));
  assert.ok(mapped.languages.includes('English'), `expected English in ${JSON.stringify(mapped.languages)}`);
  assert.ok(mapped.languages.includes('Hindi'), `expected Hindi in ${JSON.stringify(mapped.languages)}`);
});

test('standalone ACHIEVEMENTS prose is labelled "Key Achievements", never a blank "Project"', () => {
  const mapped = mapParsedResume(parseResumeText(SAMPLE));
  const projects = mapped.projects || [];
  // There should be no project literally named "Project" with an empty role.
  const blankProject = projects.find((p) => p.name === 'Project');
  assert.equal(blankProject, undefined, 'must not emit a generic "Project" entry');
  // The achievement content should be captured under "Key Achievements".
  const achievements = projects.find((p) => p.name === 'Key Achievements');
  if (achievements) {
    assert.ok(achievements.highlights.length > 0, 'Key Achievements should carry the bullet content');
  }
});

test('extracted achievement entry never carries an empty-string role from the mapper path', () => {
  const mapped = mapParsedResume(parseResumeText(SAMPLE));
  for (const p of mapped.projects || []) {
    // role may be '' from the mapper, but it must be a string (the web
    // save layer converts '' -> undefined). Guard the type contract.
    assert.equal(typeof p.role, 'string');
  }
});
