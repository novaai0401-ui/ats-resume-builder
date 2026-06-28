const assert = require('node:assert/strict');
const test = require('node:test');
const { splitTabularExperienceHeaders } = require('../dist/resume/resume.service.js');

// Additive feature: Word/DOCX resumes often put the whole job header on one
// tab / 2+space separated line — "Company, City <gap> Role <gap> Date". The
// splitter rewrites such lines (inside the EXPERIENCE section only) into the
// canonical 3-line shape the parser already handles. Everything else must
// pass through unchanged.

test('splits a tab-separated Company / Role / Date header inside experience', () => {
  const input = [
    'WORK EXPERIENCE',
    "Ernst and Young LLP, Pune\t\tManager\t\tJan'21 - Till Date",
  ].join('\n');
  const out = splitTabularExperienceHeaders(input).split('\n');
  assert.deepEqual(out, [
    'WORK EXPERIENCE',
    'Manager',
    'Ernst and Young LLP (Pune)',
    '(Jan 2021 - Present)',
  ]);
});

test('handles 2+space columns too', () => {
  const input = 'EXPERIENCE\nUBS Business Solutions Ltd, Pune     Associate Director     2018 - 2020';
  const out = splitTabularExperienceHeaders(input).split('\n');
  assert.deepEqual(out, [
    'EXPERIENCE',
    'Associate Director',
    'UBS Business Solutions Ltd (Pune)',
    '(2018 - 2020)',
  ]);
});

test('does NOT touch lines outside the experience section', () => {
  // Same tabular shape under EDUCATION must be left for the education parser.
  const input = 'EDUCATION\nM.I.T. School, Pune\t\tMBA\t\t2010 - 2012';
  assert.equal(splitTabularExperienceHeaders(input), input);
});

test('does NOT touch bullets or sentences with tabs', () => {
  const input = 'EXPERIENCE\n\t• Built and shipped the payments platform across 3 regions.';
  assert.equal(splitTabularExperienceHeaders(input), input);
});

test('passes through text with no tabs/double-spaces unchanged', () => {
  const input = 'EXPERIENCE\nManager\nAcme Corp\n(2020 - Present)';
  assert.equal(splitTabularExperienceHeaders(input), input);
});

test('ignores a 3-segment line whose last segment is not a date', () => {
  const input = 'EXPERIENCE\nFoo Corp\t\tBar Baz\t\tQux Quux';
  assert.equal(splitTabularExperienceHeaders(input), input);
});

// ── Space-separated headers (real DOCX path collapses tabs to spaces) ──

test('splits "Company, City Role DateRange" (curly quotes + en-dash)', () => {
  const input = 'WORK EXPERIENCE\nErnst and Young LLP, Pune Manager Jan’21 – Till Date';
  const out = splitTabularExperienceHeaders(input).split('\n');
  assert.deepEqual(out, [
    'WORK EXPERIENCE',
    'Manager',
    'Ernst and Young LLP (Pune)',
    '(Jan 2021 - Present)',
  ]);
});

test('keeps the city with the company, not the role; full-year range', () => {
  const input = 'EXPERIENCE\nUBS Business Solutions Ltd, Pune Associate Director Jul’19-Dec’20';
  const out = splitTabularExperienceHeaders(input).split('\n');
  assert.deepEqual(out, [
    'EXPERIENCE',
    'Associate Director',
    'UBS Business Solutions Ltd (Pune)',
    '(Jul 2019 - Dec 2020)',
  ]);
});

test('demotes a bold sub-role heading to a bullet (keeps grouping intact)', () => {
  const input = 'EXPERIENCE\nManager\nAcme Ltd (Pune)\n(2020 - Present)\nDATA BUSINESS ANALYST :\n- did things';
  const out = splitTabularExperienceHeaders(input).split('\n');
  assert.ok(out.includes('- DATA BUSINESS ANALYST :'), 'sub-heading demoted to bullet');
});

test('space-separated split does NOT fire without a company signal', () => {
  // "Klearnow.ai" has no Ltd/comma-city → leave Muskan-style lines alone.
  const input = 'EXPERIENCE\nSoftware Engineer I - Klearnow.ai February 2024 - Present';
  assert.equal(splitTabularExperienceHeaders(input), input);
});

test('space-separated split skips lines with parentheses (existing parser owns them)', () => {
  const input = 'EXPERIENCE\nCiti Corp (Pune) Manager (Dec 2022 - Present)';
  assert.equal(splitTabularExperienceHeaders(input), input);
});

test('stops transforming once a new section begins', () => {
  const input = [
    'EXPERIENCE',
    "Acme Inc, Mumbai\t\tEngineer\t\t2019 - 2021",
    'SKILLS',
    'Tools, Frameworks\t\tand other things\t\t2020', // not experience anymore
  ].join('\n');
  const out = splitTabularExperienceHeaders(input).split('\n');
  assert.deepEqual(out, [
    'EXPERIENCE',
    'Engineer',
    'Acme Inc (Mumbai)',
    '(2019 - 2021)',
    'SKILLS',
    'Tools, Frameworks\t\tand other things\t\t2020',
  ]);
});
