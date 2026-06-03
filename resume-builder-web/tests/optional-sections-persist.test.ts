import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySinglePresentRule,
} from '../src/lib/date-utils';
import { buildResumePayload } from '../src/lib/resume-flow';

// Correct save semantics (after the "phantom project" + "can't remove
// section" bug fix):
//   - Optional sections default to ENABLED (getDefaultSections), so a
//     normal upload never loses extracted languages / projects / certs.
//   - When the user EXPLICITLY removes a section, the data is dropped —
//     that is what "Remove" means.
//   - Empty / phantom entries (a project with no name and no
//     highlights, a cert with no name, an empty optional role/issuer)
//     are dropped or sent as undefined so the server's ">=2 chars if
//     present" rules never make the save un-completable.

const ALL_ENABLED = [
  { id: 'sec-contact', type: 'contact' as const, enabled: true, required: true },
  { id: 'sec-summary', type: 'summary' as const, enabled: true, required: true },
  { id: 'sec-experience', type: 'experience' as const, enabled: true, required: true },
  { id: 'sec-education', type: 'education' as const, enabled: true, required: true },
  { id: 'sec-skills', type: 'skills' as const, enabled: true, required: true },
  { id: 'sec-languages', type: 'languages' as const, enabled: true, required: false },
  { id: 'sec-projects', type: 'projects' as const, enabled: true, required: false },
  { id: 'sec-achievements', type: 'achievements' as const, enabled: true, required: false },
  { id: 'sec-certifications', type: 'certifications' as const, enabled: true, required: false },
];

function withSectionDisabled(type: 'languages' | 'projects' | 'certifications') {
  return ALL_ENABLED.map((s) => (s.type === type ? { ...s, enabled: false } : s));
}

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

// --------------------------------------------------------------------
// Default-enabled sections persist their data
// --------------------------------------------------------------------

test('certifications persist when the section is enabled (default)', () => {
  const draft = draftWith({
    certifications: [
      { name: 'AWS Certified Solutions Architect', issuer: 'Amazon', date: '2024-03', details: [] },
    ],
  });
  const payload = buildResumePayload(draft, ALL_ENABLED);
  assert.equal(payload.certifications.length, 1);
  assert.equal(payload.certifications[0].name, 'AWS Certified Solutions Architect');
});

test('languages persist when the section is enabled (default)', () => {
  const draft = draftWith({ languages: ['English', 'Hindi', 'Marathi'] });
  const payload = buildResumePayload(draft, ALL_ENABLED);
  assert.deepEqual(payload.languages, ['English', 'Hindi', 'Marathi']);
});

test('projects persist when the section is enabled (default)', () => {
  const draft = draftWith({
    projects: [
      { name: 'PocketResume', role: 'Founder', startDate: '', endDate: '', url: '', highlights: ['Shipped v1'] },
    ],
  });
  const payload = buildResumePayload(draft, ALL_ENABLED);
  assert.equal(payload.projects.length, 1);
  assert.equal(payload.projects[0].name, 'PocketResume');
});

// --------------------------------------------------------------------
// Explicit Remove drops the data (this is what the user asked for —
// removing the Projects section must let the resume save)
// --------------------------------------------------------------------

test('removing the Projects section drops its data on save', () => {
  const draft = draftWith({
    projects: [
      { name: 'Key Achievements', role: '', startDate: '', endDate: '', url: '', highlights: ['Won an award'] },
    ],
  });
  const payload = buildResumePayload(draft, withSectionDisabled('projects'));
  assert.deepEqual(payload.projects, []);
});

test('removing the Certifications section drops its data on save', () => {
  const draft = draftWith({
    certifications: [{ name: 'AWS', issuer: 'Amazon', date: '', details: [] }],
  });
  const payload = buildResumePayload(draft, withSectionDisabled('certifications'));
  assert.deepEqual(payload.certifications, []);
});

// --------------------------------------------------------------------
// Phantom / empty entries are dropped or made schema-safe so the save
// never fails with "Too small: expected string to have >=2 characters"
// --------------------------------------------------------------------

test('a phantom project with empty role does not send an empty-string role', () => {
  // The extractor can emit { name: "Key Achievements", role: "" } from
  // an ACHIEVEMENTS section. role:"" fails the server's >=2 rule, so we
  // must omit it (undefined), never send "".
  const draft = draftWith({
    projects: [
      { name: 'Key Achievements', role: '', startDate: '', endDate: '', url: '', highlights: ['Won the Rising Star award'] },
    ],
  });
  const payload = buildResumePayload(draft, ALL_ENABLED);
  assert.equal(payload.projects.length, 1);
  assert.equal(payload.projects[0].role, undefined, 'empty role must be undefined, not ""');
  assert.equal(payload.projects[0].url, undefined, 'empty url must be undefined, not ""');
});

test('a fully empty project (no name, no highlights) is dropped entirely', () => {
  const draft = draftWith({
    projects: [
      { name: '', role: '', startDate: '', endDate: '', url: '', highlights: [] },
    ],
  });
  const payload = buildResumePayload(draft, ALL_ENABLED);
  assert.deepEqual(payload.projects, []);
});

test('a certification with empty issuer omits issuer instead of sending ""', () => {
  const draft = draftWith({
    certifications: [{ name: 'Some Cert', issuer: '', date: '', details: [] }],
  });
  const payload = buildResumePayload(draft, ALL_ENABLED);
  assert.equal(payload.certifications.length, 1);
  assert.equal(payload.certifications[0].issuer, undefined, 'empty issuer must be undefined, not ""');
});

test('a certification with no name is dropped', () => {
  const draft = draftWith({
    certifications: [{ name: '   ', issuer: 'Amazon', date: '', details: [] }],
  });
  const payload = buildResumePayload(draft, ALL_ENABLED);
  assert.deepEqual(payload.certifications, []);
});

test('empty optional arrays stay empty', () => {
  const payload = buildResumePayload(draftWith({}), ALL_ENABLED);
  assert.deepEqual(payload.certifications, []);
  assert.deepEqual(payload.projects, []);
  assert.deepEqual(payload.languages, []);
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

// --------------------------------------------------------------------
// Achievements — the dedicated section
// --------------------------------------------------------------------

test('achievements persist when the section is enabled (default)', () => {
  const draft = draftWith({
    achievements: ['Won the Rising Star award twice', 'Shipped MVP 2 weeks early'],
  } as Partial<Parameters<typeof buildResumePayload>[0]>);
  const payload = buildResumePayload(draft, ALL_ENABLED) as { achievements: string[] };
  assert.deepEqual(payload.achievements, ['Won the Rising Star award twice', 'Shipped MVP 2 weeks early']);
});

test('removing the Achievements section drops its data on save', () => {
  const draft = draftWith({
    achievements: ['Won an award'],
  } as Partial<Parameters<typeof buildResumePayload>[0]>);
  const disabled = ALL_ENABLED.map((s) =>
    s.type === ('achievements' as typeof s.type) ? { ...s, enabled: false } : s,
  );
  const payload = buildResumePayload(draft, disabled) as { achievements: string[] };
  assert.deepEqual(payload.achievements, []);
});

test('blank achievement lines are trimmed out on save', () => {
  const draft = draftWith({
    achievements: ['  Real achievement  ', '', '   ', 'Another one'],
  } as Partial<Parameters<typeof buildResumePayload>[0]>);
  const payload = buildResumePayload(draft, ALL_ENABLED) as { achievements: string[] };
  assert.deepEqual(payload.achievements, ['Real achievement', 'Another one']);
});
