import assert from 'node:assert/strict';
import test from 'node:test';
import { applySinglePresentRule } from '../src/lib/date-utils';

// "Present" on multiple roles implies moonlighting, which most ATSes
// dedupe and recruiters distrust. Editor must enforce exactly one
// "Present" — when the user checks Present on role N, any other role
// holding Present is cleared to a blank end date for the user to fill.

test('checking Present on a role clears Present on every OTHER role', () => {
  const before = [
    { role: 'Senior Engineer', endDate: 'Present' },
    { role: 'Tech Lead',       endDate: 'Present' },
    { role: 'Engineer',        endDate: '2020-01' },
  ];
  const { experiences, clearedIndexes } = applySinglePresentRule(before, 0, true);
  assert.equal(experiences[0].endDate, 'Present');
  assert.equal(experiences[1].endDate, '', 'index 1 should be cleared');
  assert.equal(experiences[2].endDate, '2020-01', 'past role untouched');
  assert.deepEqual(clearedIndexes, [1]);
});

test('checking Present on a role that already has Present is a no-op for others', () => {
  const before = [
    { role: 'A', endDate: 'Present' },
    { role: 'B', endDate: '2023-04' },
  ];
  const { experiences, clearedIndexes } = applySinglePresentRule(before, 0, true);
  assert.equal(experiences[0].endDate, 'Present');
  assert.equal(experiences[1].endDate, '2023-04');
  assert.deepEqual(clearedIndexes, []);
});

test('unchecking Present clears only the toggled role', () => {
  const before = [
    { role: 'A', endDate: 'Present' },
    { role: 'B', endDate: '2023-04' },
  ];
  const { experiences, clearedIndexes } = applySinglePresentRule(before, 0, false);
  assert.equal(experiences[0].endDate, '');
  assert.equal(experiences[1].endDate, '2023-04');
  assert.deepEqual(clearedIndexes, []);
});

test('toggling Present on a fresh role with no existing Present is harmless', () => {
  const before = [
    { role: 'A', endDate: '2022-01' },
    { role: 'B', endDate: '2023-04' },
  ];
  const { experiences, clearedIndexes } = applySinglePresentRule(before, 1, true);
  assert.equal(experiences[0].endDate, '2022-01');
  assert.equal(experiences[1].endDate, 'Present');
  assert.deepEqual(clearedIndexes, []);
});

test('handles "present" in any casing as a Present token', () => {
  const before = [
    { role: 'A', endDate: 'present' },
    { role: 'B', endDate: 'PRESENT' },
    { role: 'C', endDate: '2020-01' },
  ];
  const { experiences, clearedIndexes } = applySinglePresentRule(before, 2, true);
  assert.equal(experiences[2].endDate, 'Present');
  // Both case variants must be detected and cleared, otherwise the user
  // can sneak two Presents past us by typing the date manually.
  assert.equal(experiences[0].endDate, '');
  assert.equal(experiences[1].endDate, '');
  assert.deepEqual(clearedIndexes.sort(), [0, 1]);
});

test('treats null / undefined / empty end dates as not-Present', () => {
  const before = [
    { role: 'A', endDate: null },
    { role: 'B', endDate: undefined },
    { role: 'C', endDate: '' },
    { role: 'D', endDate: 'Present' },
  ] as Array<{ role: string; endDate?: string | null }>;
  const { experiences, clearedIndexes } = applySinglePresentRule(before, 0, true);
  assert.equal(experiences[0].endDate, 'Present');
  // Only the existing Present (index 3) should have been cleared.
  assert.deepEqual(clearedIndexes, [3]);
});

test('does not mutate the input array', () => {
  const before = [
    { role: 'A', endDate: 'Present' },
    { role: 'B', endDate: 'Present' },
  ];
  const snapshot = JSON.parse(JSON.stringify(before));
  applySinglePresentRule(before, 0, true);
  assert.deepEqual(before, snapshot, 'input must be untouched');
});
