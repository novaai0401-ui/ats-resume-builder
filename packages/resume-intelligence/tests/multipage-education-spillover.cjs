'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { parseResumeText } = require('../dist/resume-parser.js');
const { mapParsedResume } = require('../dist/field-mapper.js');

// ─── Multi-page PDF: experience entries spill into education section ─────────
//
// In multi-page ATS-exported PDFs, a page break can split the experience
// section such that some entries appear after the EDUCATION heading.
// The education mapper must NOT treat role titles or company names as
// institution names.

describe('multi-page PDF: education does not absorb spillover experience', () => {
  // Simulates the text from a 3-page PDF where page 1 ends mid-experience,
  // then EDUCATION appears, then more experience entries follow.
  const RESUME_TEXT = `WORK EXPERIENCE
AVP Dec 2022 - Present
Citi Corp (Pune)
Provide technical and architectural leadership for enterprise frontend platforms.
Own frontend architecture and delivery for React-based enterprise applications.
EDUCATION
B.E: Telecommunication Engineering
Siddaganga Institute, Tumkur, KA
(Jan 2010 - Jun 2014)
Associate of Science: Science
A.N.S.M College, Aurangabad, BR
(Jan 2007 - May 2010)
High School Diploma
D.A.V Public School, Patna
Senior Technology Consultant
Oct 2021 - Dec 2022
Ernst & Young (Pune, Maharashtra)
Served as frontend technical lead for enterprise financial clients.
Designed configurable React-based UI templates.
Senior Software Developer
Sep 2020 - Sep 2021
One Network Enterprises
Led end-to-end frontend architecture and UX implementation.
Lead UI Developer
Jul 2014 - Aug 2020
Infosys Ltd
Led frontend engineering and UI architecture.`;

  it('education contains only genuine education entries (no role titles)', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    assert.ok(result.education.length <= 3, `Expected <= 3 education entries, got ${result.education.length}`);
    for (const edu of result.education) {
      // No role title should appear as an institution
      assert.ok(
        !/\b(consultant|developer|engineer|lead|manager|architect|specialist)\b/i.test(edu.institution),
        `Institution "${edu.institution}" looks like a role title`,
      );
      // No company should appear as an institution (unless it's actually a school)
      assert.ok(
        !/\b(ernst|young|infosys|one network|citi)\b/i.test(edu.institution),
        `Institution "${edu.institution}" looks like a company`,
      );
    }
  });

  it('education entries have correct data', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    const be = result.education.find((e) => /telecommunication/i.test(e.degree));
    assert.ok(be, 'B.E Telecommunication not found');
    assert.ok(be.institution.includes('Siddaganga'), `Wrong institution: ${be.institution}`);

    const asc = result.education.find((e) => /associate.*science/i.test(e.degree));
    assert.ok(asc, 'Associate of Science not found');

    const hs = result.education.find((e) => /high school/i.test(e.degree));
    assert.ok(hs, 'High School Diploma not found');
  });

  it('experience entries recover spillover from education section', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    // The spillover experience entries should be recovered by buildExperienceSource
    const companies = result.experience.map((e) => e.company);
    assert.ok(
      companies.some((c) => /ernst/i.test(c)),
      `Ernst & Young not found in experience: ${companies.join(', ')}`,
    );
    assert.ok(
      companies.some((c) => /one network/i.test(c)),
      `One Network not found in experience: ${companies.join(', ')}`,
    );
    assert.ok(
      companies.some((c) => /infosys/i.test(c)),
      `Infosys not found in experience: ${companies.join(', ')}`,
    );
  });

  it('"Associate of Science" is NOT treated as a role title', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    // "Associate of Science" should be education, not experience
    const hasAssociateEdu = result.education.some((e) => /associate.*science/i.test(e.degree));
    assert.ok(hasAssociateEdu, '"Associate of Science" missing from education');
    const hasAssociateExp = result.experience.some((e) => /associate.*science/i.test(e.role));
    assert.ok(!hasAssociateExp, '"Associate of Science" should not be in experience');
  });
});

// ─── Institution-before-degree format ────────────────────────────────────────
//
// Some resumes list the institution name on one line, then the degree on the
// next line. The mapper must merge them into a single education block.

describe('education: institution line followed by degree line', () => {
  const RESUME_TEXT = `EDUCATION
Babasaheb Naik college of engineering Pusad, Amravati University, Maharashtra
B.E: Computer Science and Engineering
(2008-07 - 2012-07)`;

  it('produces a single education entry with both institution and degree', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    assert.equal(result.education.length, 1, `Expected 1 education entry, got ${result.education.length}`);
    const edu = result.education[0];
    assert.ok(/babasaheb/i.test(edu.institution), `Wrong institution: ${edu.institution}`);
    assert.ok(/computer science/i.test(edu.degree), `Wrong degree: ${edu.degree}`);
    assert.equal(edu.startDate, '2008-07');
    assert.equal(edu.endDate, '2012-07');
  });
});
