import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySinglePresentRule,
} from '../src/lib/date-utils';
import { buildResumePayload } from '../src/lib/resume-flow';

// Bug users reported as "I added certifications and languages, saved
// the resume, and they were gone on next open" — the strict
// `enabled.has('certifications')` guard in buildResumePayload was
// dropping the arrays whenever the section navigator hadn't been
// flipped on. Optional sections must persist their data whenever the
// user has actually entered some, even if the section is currently
// disabled in the navigator.

const SECTIONS_ALL_OPTIONAL_DISABLED = [
  { id: 'sec-contact', type: 'contact' as const, enabled: true, required: true },
  { id: 'sec-summary', type: 'summary' as const, enabled: true, required: true },
  { id: 'sec-experience', type: 'experience' as const, enabled: true, required: true },
  { id: 'sec-education', type: 'education' as const, enabled: true, required: true },
  { id: 'sec-skills', type: 'skills' as const, enabled: true, required: true },
  { id: 'sec-languages', type: 'languages' as const, enabled: false, required: false },
  { id: 'sec-projects', type: 'projects' as const, enabled: false, required: false },
  { id: 'sec-certifications', type: 'certifications' as const, enabled: false, required: false },
];

function draftWith(overrides: Partial<Parameters<typeof buildResumePayload>[0]>) {
  return {
    title: 'Engineer Resume',
    contact: { fullName: 'Jane', email: 'j@x.io', phone: '', location: '', links: [] as string[] },
    summary: 'A real summary.',
    skills: ['React'],
    technicalSkills: [],
    softSkills: [],
    languages: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    templateId: 'classic',
    ...overrides,
  } as Parameters<typeof buildResumePayload>[0];
}

test('certifications survive save even when the section is toggled off', () => {
  const draft = draftWith({
    certifications: [
      { name: 'AWS Certified Solutions Architect', issuer: 'Amazon', date: '2024-03', details: [] },
    ],
  });
  const payload = buildResumePayload(draft, SECTIONS_ALL_OPTIONAL_DISABLED);
  assert.equal(payload.certifications.length, 1);
  assert.equal(payload.certifications[0].name, 'AWS Certified Solutions Architect');
});

test('languages survive save even when the section is toggled off', () => {
  const draft = draftWith({ languages: ['English', 'Hindi', 'Marathi'] });
  const payload = buildResumePayload(draft, SECTIONS_ALL_OPTIONAL_DISABLED);
  assert.deepEqual(payload.languages, ['English', 'Hindi', 'Marathi']);
});

test('projects survive save even when the section is toggled off', () => {
  const draft = draftWith({
    projects: [
      { name: 'PocketResume', role: 'Founder', startDate: '', endDate: '', url: '', highlights: ['Shipped v1'] },
    ],
  });
  const payload = buildResumePayload(draft, SECTIONS_ALL_OPTIONAL_DISABLED);
  assert.equal(payload.projects.length, 1);
  assert.equal(payload.projects[0].name, 'PocketResume');
});

test('empty optional arrays stay empty — the lenient guard only kicks in for real data', () => {
  const draft = draftWith({});
  const payload = buildResumePayload(draft, SECTIONS_ALL_OPTIONAL_DISABLED);
  assert.deepEqual(payload.certifications, []);
  assert.deepEqual(payload.projects, []);
  assert.deepEqual(payload.languages, []);
});

test('certifications with only whitespace name/issuer do NOT count as data', () => {
  // Catch the case where the row exists but the user typed nothing —
  // we should not persist a noisy empty-ish entry.
  const draft = draftWith({
    certifications: [{ name: '   ', issuer: '\t', date: '', details: [] }],
  });
  const payload = buildResumePayload(draft, SECTIONS_ALL_OPTIONAL_DISABLED);
  assert.deepEqual(payload.certifications, []);
});

// Sanity: the single-Present rule helper from earlier still in scope.
test('applySinglePresentRule still works (cross-suite sanity check)', () => {
  const { experiences } = applySinglePresentRule(
    [{ role: 'A', endDate: 'Present' }, { role: 'B', endDate: 'Present' }],
    0,
    true,
  );
  assert.equal(experiences[1].endDate, '');
});
