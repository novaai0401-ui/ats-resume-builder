import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allSkills,
  nonOverlappingMainSkills,
} from '../components/templates/templateUtils';

// Bug users reported as "duplicate fields in the downloaded resume" —
// when techSkills was empty, visual templates fell back to
// `allSkills(normalized)` which merges all three buckets, then ALSO
// rendered the softSkills list, so every soft skill appeared twice.
// nonOverlappingMainSkills returns either the explicit tech-skills
// list verbatim, or the merged list MINUS items already in soft.

function fixture(overrides: Partial<Record<'skills' | 'technicalSkills' | 'softSkills', string[]>>): any {
  return {
    skills: [],
    technicalSkills: [],
    softSkills: [],
    ...overrides,
  };
}

test('falls back to skills minus soft when technicalSkills is empty', () => {
  const r = fixture({
    skills: ['React', 'TypeScript', 'Collaboration', 'Communication'],
    softSkills: ['Collaboration', 'Communication'],
  });
  const main = nonOverlappingMainSkills(r);
  assert.deepEqual(main, ['React', 'TypeScript']);
});

test('honours an explicit technicalSkills split verbatim', () => {
  const r = fixture({
    skills: ['React', 'Collaboration'],
    technicalSkills: ['React', 'TypeScript'],
    softSkills: ['Collaboration'],
  });
  const main = nonOverlappingMainSkills(r);
  assert.deepEqual(main, ['React', 'TypeScript']);
});

test('returns the deduped skills list unchanged when no soft skills exist', () => {
  const r = fixture({ skills: ['React', 'React', 'TypeScript'] });
  const main = nonOverlappingMainSkills(r);
  // Casing/dedup is allSkills' job; we just verify nothing is dropped.
  assert.deepEqual(main, ['React', 'TypeScript']);
});

test('soft-skill match is case-insensitive', () => {
  const r = fixture({
    skills: ['React', 'COLLABORATION'],
    softSkills: ['collaboration'],
  });
  const main = nonOverlappingMainSkills(r);
  assert.deepEqual(main, ['React']);
});

test('empty input is safe', () => {
  assert.deepEqual(nonOverlappingMainSkills(fixture({})), []);
});

test('allSkills still merges + dedups across all three buckets (regression guard)', () => {
  const merged = allSkills(fixture({
    skills: ['React'],
    technicalSkills: ['TypeScript', 'React'],
    softSkills: ['Communication'],
  }));
  assert.deepEqual(merged, ['React', 'TypeScript', 'Communication']);
});
