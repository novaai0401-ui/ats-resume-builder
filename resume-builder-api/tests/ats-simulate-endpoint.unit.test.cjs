const assert = require('node:assert/strict');
const test = require('node:test');
const { ResumeController } = require('../dist/resume/resume.controller.js');
const { simulateAts } = require('../dist/resume/ats-simulator.js');

/**
 * R-105 regression. The endpoint used to read summary/experience/education/
 * projects/certifications out of `resume.sections`. The Prisma Resume model
 * has no `sections` column — those are top-level fields — so the object was
 * always {} and every simulation scored a resume with no work history.
 *
 * These tests drive the controller with the shape resumeService.get()
 * actually returns (a decorated Prisma row), not a hand-made `sections`
 * object, which is the only way to notice the mismatch.
 */

/** Mirrors a real row: top-level fields, no `sections` key anywhere. */
const RESUME_ROW = {
  id: 'r1',
  userId: 'u1',
  title: 'Senior Nurse Resume',
  contact: { fullName: 'A. Candidate', email: 'a@example.com', phone: '+91 90000 00000', location: 'Pune' },
  summary: 'Critical-care nurse. Ten years in tertiary ICUs. Cut line infections by 30%.',
  skills: ['Triage', 'ICU', 'Ventilators', 'Phlebotomy', 'EPIC', 'ACLS', 'Charting', 'Mentoring'],
  experience: [
    { role: 'Charge Nurse', company: 'City Hospital', startDate: 'Jan 2020', endDate: 'Present', highlights: ['Led a 12-bed ICU'] },
    { role: 'Staff Nurse', company: 'Rural Clinic', startDate: 'Jan 2016', endDate: 'Dec 2019', highlights: ['Ran triage'] },
  ],
  education: [{ degree: 'B.Sc Nursing', institution: 'State University', startDate: '2012', endDate: '2016' }],
  projects: [{ name: 'Sepsis pathway rollout', description: 'Cut time-to-antibiotic by 40 minutes' }],
  certifications: [{ name: 'ACLS', issuer: 'AHA' }],
  achievements: ['Nurse of the Year 2023'],
  licenses: [{ name: 'RN License', issuer: 'State Board', number: 'RN-99887' }],
  publications: [{ title: 'ICU staffing ratios', publisher: 'Nursing Journal', date: '2024' }],
};

function controllerFor(row) {
  return new ResumeController({ get: async () => row }, null, null, null, null);
}

test('the endpoint simulates the resume the service returns, not an empty shell', async () => {
  const result = await controllerFor(RESUME_ROW).atsSimulate({ user: { userId: 'u1' } }, 'r1');

  // The defect's signature: work history missing from the recruiter view.
  assert.match(result.recruiterView, /City Hospital/, 'experience reaches the simulator');
  assert.match(result.recruiterView, /State University/, 'education reaches the simulator');
  assert.match(result.recruiterView, /Critical-care nurse/, 'summary reaches the simulator');
});

test('a resume with real content scores higher than the same resume stripped', async () => {
  const full = await controllerFor(RESUME_ROW).atsSimulate({ user: { userId: 'u1' } }, 'r1');
  const stripped = await controllerFor({
    ...RESUME_ROW,
    summary: '',
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    achievements: [],
    licenses: [],
    publications: [],
  }).atsSimulate({ user: { userId: 'u1' } }, 'r1');

  assert.ok(
    full.confidence > stripped.confidence,
    `content must affect the score (full ${full.confidence} vs stripped ${stripped.confidence})`,
  );
});

test('a resume read through `sections` would be indistinguishable from an empty one', async () => {
  // Pins WHY the old code was wrong: wrapping the same content in `sections`
  // (the shape the controller used to expect) produces the stripped result,
  // because no such field exists on a real row.
  const wrapped = await controllerFor({
    id: 'r1',
    title: RESUME_ROW.title,
    contact: RESUME_ROW.contact,
    skills: RESUME_ROW.skills,
    sections: { summary: RESUME_ROW.summary, experience: RESUME_ROW.experience, education: RESUME_ROW.education },
  }).atsSimulate({ user: { userId: 'u1' } }, 'r1');

  assert.doesNotMatch(wrapped.recruiterView, /City Hospital/);
});

test('profession sections survive into the recruiter view (R-077 content)', () => {
  const result = simulateAts(RESUME_ROW);
  assert.match(result.recruiterView, /RN-99887/, 'licence number is load-bearing for licensed roles');
  assert.match(result.recruiterView, /ICU staffing ratios/, 'publications survive');
  assert.match(result.recruiterView, /Nurse of the Year 2023/, 'achievements survive');
  assert.match(result.recruiterView, /Sepsis pathway rollout/, 'projects survive');
  assert.match(result.recruiterView, /ACLS/, 'certifications survive');

  const labels = result.fields.map((f) => f.label);
  for (const label of ['Project #1', 'Certification #1', 'License #1', 'Publication #1', 'Achievements']) {
    assert.ok(labels.includes(label), `${label} is reported as a parsed field`);
  }
});
