const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeHeading, parseResumeText } = require('resume-intelligence');

/**
 * Regression guard: soft-wrap continuation words must NOT be treated as
 * section headings.
 *
 * The reported bug: a user uploaded a Chandan Kumar resume exported by
 * Outspark. The first bullet of his 4th experience entry wrapped across
 * a line break, leaving "frameworks." alone on its own line. The
 * heading detector matched "frameworks" as a SKILLS heading (because
 * "frameworks" is a known synonym for the skills section), switched
 * the current section to 'skills', and silently shunted every Infosys
 * bullet + achievement that followed into the wrong bucket. The user
 * saw Experience #4 with only 1 bullet instead of 13, and the achievements
 * section came back empty.
 *
 * The fix tightens isHeadingLike: a line containing sentence-ending
 * punctuation (".", ",", ";", "!", "?") is prose, not a heading,
 * regardless of whether the alphabetic part of it is a known phrase.
 * The only headings with trailing punctuation are colon-suffixed
 * labels ("Skills:") which have their own explicit rule below.
 */

test('orphan soft-wrap continuation "frameworks." is NOT a section heading', () => {
  // This was the exact line in the reported PDF. Before the fix it
  // returned 'skills'. After the fix it must return ''.
  assert.equal(normalizeHeading('frameworks.'), '');
});

test('other one-word continuations with trailing periods stay as prose', () => {
  // Same shape, different words — all of these are continuation lines
  // from soft-wrapped bullets in real-world resumes.
  for (const line of [
    'frameworks.',
    'technologies.',
    'skills.',
    'leadership.',
    'experience.',
    'achievements.',
    'projects.',
  ]) {
    assert.equal(normalizeHeading(line), '', `"${line}" must not register as a heading`);
  }
});

test('legitimate headings still register', () => {
  // The fix must not break the regular heading-detection path.
  assert.equal(normalizeHeading('Skills'), 'skills');
  assert.equal(normalizeHeading('Skills:'), 'skills');
  assert.equal(normalizeHeading('SKILLS'), 'skills');
  assert.equal(normalizeHeading('Frameworks'), 'skills');
  assert.equal(normalizeHeading('TECHNICAL SKILLS'), 'skills');
  assert.equal(normalizeHeading('WORK EXPERIENCE'), 'experience');
  assert.equal(normalizeHeading('ACHIEVEMENTS'), 'achievements');
  assert.equal(normalizeHeading('EDUCATION'), 'education');
});

test('section split keeps an orphan "frameworks." inside its original section', () => {
  // Simulate the Outspark layout: a soft-wrapped bullet's tail lands
  // alone on a line. The orphan word must NOT close the current
  // section. We use "experience" as the carrier so the assertion is
  // unambiguous — if the bug regressed, the orphan would flip current
  // to 'skills' and the bullets after it would land in the wrong bucket.
  const sample = [
    'WORK EXPERIENCE',
    'Lead UI Developer  Jul 2014 - Aug 2020',
    'Infosys Ltd',
    'Led frontend engineering and UI architecture for a large-scale core banking platform,',
    'managing a team and defining reusable UI',
    'frameworks.',
    'Owned design and evolution of a component-driven UI framework.',
    'Acted as UI technical lead for a 9-member team.',
  ].join('\n');

  const parsed = parseResumeText(sample);
  // Every non-heading line above (5 of them) plus the company + role
  // headers (2) should remain under "experience". Skills must stay empty.
  assert.ok(
    !parsed.sections.skills || parsed.sections.skills.length === 0,
    `expected skills section to stay empty, got ${JSON.stringify(parsed.sections.skills || [])}`,
  );
  // The orphan word itself + the bullets after it must end up under experience.
  const expContent = (parsed.sections.experience || []).join('\n');
  assert.match(expContent, /frameworks\./);
  assert.match(expContent, /Owned design and evolution/);
  assert.match(expContent, /Acted as UI technical lead/);
});
