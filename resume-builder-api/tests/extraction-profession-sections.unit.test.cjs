const assert = require('node:assert/strict');
const test = require('node:test');
const { parseResumeText, mapParsedResume } = require('resume-intelligence');

/**
 * R-077 phase 2 — uploaded resumes with LICENSES / PUBLICATIONS headings
 * map into the first-class sections instead of folding into
 * certifications (licenses) or projects (publications).
 */

const DOCTOR = [
  'Dr Asha Verma',
  'asha.verma@example.com | +91 98765 43210 | Mumbai',
  '',
  'SUMMARY',
  'Physician with 12 years of clinical practice in internal medicine.',
  '',
  'EXPERIENCE',
  'Senior Physician, City General Hospital',
  'Jan 2015 - Present',
  '- Led the internal medicine ward with 40 beds and a team of 12 residents.',
  '',
  'LICENSES & REGISTRATIONS',
  '- Medical Registration — National Medical Commission, Reg No. NMC-12345, valid till 2030',
  '- Maharashtra Medical Council License No. MMC/2014/5678',
  '',
  'PUBLICATIONS',
  '- Sepsis outcomes in Indian ICUs, Indian Journal of Medicine (2024)',
  '- Portable triage device, Indian Patent Office, 2023 patent',
  '',
  'EDUCATION',
  'MBBS, Grant Medical College',
  '2008 - 2013',
].join('\n');

test('licensure lines map to structured LicenseItems (not certifications)', () => {
  const mapped = mapParsedResume(parseResumeText(DOCTOR));
  assert.equal(mapped.licenses.length, 2);
  const [reg, mmc] = mapped.licenses;
  assert.equal(reg.name, 'Medical Registration');
  assert.equal(reg.authority, 'National Medical Commission');
  assert.equal(reg.licenseNumber, 'NMC-12345');
  assert.equal(reg.validTill, '2030');
  assert.equal(mmc.licenseNumber, 'MMC/2014/5678');
  // Not duplicated into certifications.
  assert.ok(!mapped.certifications.some((c) => /NMC-12345|MMC\/2014/.test(JSON.stringify(c))));
});

test('publication + patent lines map to typed PublicationItems (not projects)', () => {
  const mapped = mapParsedResume(parseResumeText(DOCTOR));
  assert.equal(mapped.publications.length, 2);
  const paper = mapped.publications.find((p) => /Sepsis/.test(p.title));
  assert.equal(paper.venue, 'Indian Journal of Medicine');
  assert.equal(paper.year, '2024');
  const patent = mapped.publications.find((p) => p.type === 'patent');
  assert.equal(patent.title, 'Portable triage device');
  assert.ok(!mapped.projects.some((p) => /Sepsis|triage/.test(JSON.stringify(p))));
});

test('a resume WITHOUT those sections yields empty arrays (no false positives)', () => {
  const it = mapParsedResume(parseResumeText([
    'Ravi Kumar', 'ravi@x.io', '', 'SUMMARY', 'Backend engineer building APIs.', '',
    'EXPERIENCE', 'Engineer, Acme', 'Jan 2020 - Present', '- Built services.', '',
    'CERTIFICATIONS', '- AWS Certified Solutions Architect, 2023',
  ].join('\n')));
  assert.deepEqual(it.licenses, []);
  assert.deepEqual(it.publications, []);
  assert.ok(it.certifications.length >= 1, 'certifications still map normally');
});

test('combined "Certifications and Licenses" heading still maps to certifications (mixed content)', () => {
  const it = mapParsedResume(parseResumeText([
    'Ravi Kumar', 'ravi@x.io', '', 'SUMMARY', 'Engineer.', '',
    'CERTIFICATIONS AND LICENSES', '- AWS Certified Developer, 2022',
  ].join('\n')));
  assert.ok(it.certifications.length >= 1);
});
