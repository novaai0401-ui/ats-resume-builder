const assert = require('node:assert/strict');
const test = require('node:test');

const sharedPromise = import('../dist/index.js');

test('resolveSectionOrder returns canonical body order when no override', async () => {
  const { resolveSectionOrder, REORDERABLE_SECTIONS } = await sharedPromise;
  assert.deepEqual(resolveSectionOrder(null), REORDERABLE_SECTIONS);
  assert.deepEqual(resolveSectionOrder([]), REORDERABLE_SECTIONS);
});

test('resolveSectionOrder honours a full override', async () => {
  const { resolveSectionOrder } = await sharedPromise;
  const override = ['experience', 'skills', 'summary', 'education', 'projects', 'achievements', 'certifications', 'languages'];
  assert.deepEqual(resolveSectionOrder(override), override);
});

test('resolveSectionOrder appends missing sections in canonical position', async () => {
  const { resolveSectionOrder } = await sharedPromise;
  // Only experience + summary specified; the rest fall back to canonical order.
  assert.deepEqual(resolveSectionOrder(['experience', 'summary']), [
    'experience',
    'summary',
    'skills',
    'projects',
    'achievements',
    'education',
    'certifications',
    'languages',
  ]);
});

test('resolveSectionOrder ignores unknown / duplicate keys', async () => {
  const { resolveSectionOrder, REORDERABLE_SECTIONS } = await sharedPromise;
  assert.deepEqual(resolveSectionOrder(['header', 'bogus', 'photo']), REORDERABLE_SECTIONS);
  assert.deepEqual(resolveSectionOrder(['skills', 'skills', 'summary']), [
    'skills',
    'summary',
    'experience',
    'projects',
    'achievements',
    'education',
    'certifications',
    'languages',
  ]);
});

test('resolveSectionOrder respects a per-template default body order', async () => {
  const { resolveSectionOrder } = await sharedPromise;
  const academicDefault = ['summary', 'education', 'experience', 'projects', 'achievements', 'certifications', 'skills', 'languages'];
  assert.deepEqual(resolveSectionOrder(null, academicDefault), academicDefault);
  // Override wins; missing keys fall back to the academic default ordering.
  assert.deepEqual(resolveSectionOrder(['skills'], academicDefault), [
    'skills',
    'summary',
    'education',
    'experience',
    'projects',
    'achievements',
    'certifications',
    'languages',
  ]);
});

test('getAtsSectionOrder keeps header first and applies the override to present sections', async () => {
  const { getAtsSectionOrder } = await sharedPromise;
  const resume = {
    contact: { fullName: 'A B' },
    summary: 'A long enough professional summary for the resume body.',
    skills: ['ts'],
    experience: [{ role: 'Eng', company: 'X', startDate: '2020', endDate: '2021', highlights: ['did things'] }],
    education: [{ institution: 'U', degree: 'BS', startDate: '2016', endDate: '2020' }],
    sectionOrder: ['experience', 'summary'],
  };
  const order = getAtsSectionOrder(resume);
  assert.equal(order[0], 'header');
  // experience moved ahead of summary; absent sections (projects/certs/etc) dropped.
  assert.deepEqual(order, ['header', 'experience', 'summary', 'skills', 'education']);
});

test('getAtsSectionOrder falls back to canonical order with no override', async () => {
  const { getAtsSectionOrder } = await sharedPromise;
  const resume = {
    contact: { fullName: 'A B' },
    summary: 'A long enough professional summary for the resume body.',
    skills: ['ts'],
    experience: [{ role: 'Eng', company: 'X', startDate: '2020', endDate: '2021', highlights: ['did things'] }],
    education: [{ institution: 'U', degree: 'BS', startDate: '2016', endDate: '2020' }],
  };
  assert.deepEqual(getAtsSectionOrder(resume), ['header', 'summary', 'skills', 'experience', 'education']);
});
