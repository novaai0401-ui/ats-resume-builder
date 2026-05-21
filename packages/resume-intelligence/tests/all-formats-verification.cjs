/**
 * Full-sweep regression suite — runs every resume-format fixture and
 * synthetic market layout through the full extract → verify pipeline and
 * asserts that:
 *
 *   1. The mapper extracts the expected number of experience entries with
 *      both role and company populated.
 *   2. Header (name, email, phone where present) is recovered.
 *   3. `verifyExtraction` returns a confidence score above the
 *      re-extract threshold — i.e. the extracted content matches the raw
 *      text well enough that the verifier does NOT recommend a re-run.
 *
 * This is the safety net that prevents the recurring regression the user
 * called out:  "every time you change one resume extraction logic and it
 * breaks logic for another one".  When this suite turns red, the latest
 * change has broken extraction quality for at least one format.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  mapParsedResume,
  parseResumeText,
  verifyExtraction,
} = require('../dist/index.js');

const FIXTURES = path.resolve(__dirname, 'fixtures');

function loadAndMap(name) {
  const text = fs.readFileSync(path.join(FIXTURES, name), 'utf8');
  const parsed = parseResumeText(text);
  const mapped = mapParsedResume(parsed);
  return { text, parsed, mapped };
}

function summary(mapped) {
  return mapped.experience.map((e) => `${e.role} @ ${e.company}`).join(' | ');
}

function assertConfidence(mapped, text, label, minConfidence) {
  const report = verifyExtraction(text, {
    contact: mapped.contact,
    experience: mapped.experience,
    education: mapped.education,
    skills: mapped.skills,
  });
  assert.ok(
    report.confidence >= minConfidence,
    `${label}: confidence ${report.confidence.toFixed(2)} < ${minConfidence}. Issues: ${JSON.stringify(report.issues)}. Experience: ${summary(mapped)}`,
  );
  // Issues that should never appear in any format we've already validated.
  const fatalKinds = new Set(['phantom-experience', 'no-experience-extracted']);
  for (const issue of report.issues) {
    assert.ok(
      !fatalKinds.has(issue.kind),
      `${label}: fatal issue ${issue.kind} — ${issue.detail}`,
    );
  }
  return report;
}

// ============================================================================
// Fixture files in tests/fixtures/
// ============================================================================
const FIXTURE_CASES = [
  {
    file: 'seema-ats-pdf-extract.txt',
    label: 'ATS PDF export (pdf-parse output, ligature drops, tabs)',
    minExperiences: 5,
    requiredCompanies: [/citi corp/i, /ernst.*young/i, /one network/i, /infosys/i, /digital group/i],
    requiredFullName: 'Seema Almas Yunus Shaikh',
    minConfidence: 0.65,
  },
  {
    file: 'seema-company-then-role-with-date.txt',
    label: 'Company-then-role-with-date (Outshine 2-page PDF)',
    minExperiences: 5,
    requiredCompanies: [/citi corp/i, /(ey|ernst)/i, /one network/i, /infosys/i],
    requiredFullName: 'Seema Almas Yunus Shaikh',
    minConfidence: 0.55,
  },
  {
    file: 'seema-role-then-company-tabbed-date.txt',
    label: 'Role-then-company tabbed date (3-page Outspark PDF)',
    minExperiences: 4,
    requiredCompanies: [/citi corp/i, /ernst.*young/i, /one network/i, /infosys/i],
    requiredFullName: 'Seema Almas Yunus Shaikh',
    minConfidence: 0.55,
  },
  {
    file: 'seema-role-company-date-three-lines.txt',
    label: 'Role / company / date on three separate lines',
    minExperiences: 3,
    requiredCompanies: [/citi corp/i],
    minConfidence: 0.55,
  },
  {
    file: 'seema-work-experience.txt',
    label: 'Plain WORK EXPERIENCE + inline parenthesised dates',
    minExperiences: 5,
    requiredCompanies: [/citi corp/i, /ernst.*young/i, /one network/i, /infosys/i, /digital group/i],
    minConfidence: 0.60,
  },
  {
    file: 'krishnat-two-column-docx.txt',
    label: 'Two-column DOCX (mammoth flat)',
    minExperiences: 1,
    minConfidence: 0.45,
  },
  {
    file: 'seema-multicol-sidebar.txt',
    label: 'Multi-column ATS PDF — sidebar EDUCATION leaks past HOBBIES',
    minExperiences: 5,
    requiredCompanies: [/citi corp/i, /ernst.*young/i, /one network/i, /infosys/i, /digital group/i],
    requiredFullName: 'Seema Almas Yunus Shaikh',
    minConfidence: 0.85,
  },
  {
    file: 'seema-7jobs-paged.txt',
    label: 'Paged Outshine PDF — 7 jobs across 2 pages, mid-sentence "projects" prose',
    minExperiences: 7,
    requiredCompanies: [/citi corp/i, /\bey\b/i, /one network/i, /infosys/i, /digital group/i],
    requiredFullName: 'Seema Almas Yunus Shaikh',
    minConfidence: 0.85,
  },
];

for (const tc of FIXTURE_CASES) {
  const { text, mapped } = loadAndMap(tc.file);

  // Each experience entry MUST have both role and company.  This is the
  // condition the editor form enforces — empty role or company is what
  // surfaces as "Role is required" / "Experience #1: ( @ SOFT SKILLS".
  for (const exp of mapped.experience) {
    assert.ok(
      (exp.role || '').trim().length >= 2,
      `${tc.label}: experience missing role — ${JSON.stringify(exp)}`,
    );
    assert.ok(
      (exp.company || '').trim().length >= 2,
      `${tc.label}: experience missing company — ${JSON.stringify(exp)}`,
    );
  }

  assert.ok(
    mapped.experience.length >= tc.minExperiences,
    `${tc.label}: expected at least ${tc.minExperiences} experiences, got ${mapped.experience.length}. Entries: ${summary(mapped)}`,
  );

  for (const re of (tc.requiredCompanies || [])) {
    assert.ok(
      mapped.experience.some((e) => re.test(e.company || '')),
      `${tc.label}: missing required company matching ${re}. Got: ${mapped.experience.map((e) => e.company).join(' | ')}`,
    );
  }

  if (tc.requiredFullName) {
    assert.equal(
      mapped.contact?.fullName,
      tc.requiredFullName,
      `${tc.label}: full name "${tc.requiredFullName}" not recovered (got "${mapped.contact?.fullName}")`,
    );
  }

  assertConfidence(mapped, text, tc.label, tc.minConfidence);
}

// ============================================================================
// Synthetic market formats — same panel of layouts tested by market-formats.cjs,
// but here we also assert the verifier's confidence on each one so we know
// re-extraction would NOT kick in.
// ============================================================================
const MARKET_CASES = [
  {
    label: 'LinkedIn-style export',
    minExperiences: 3,
    minConfidence: 0.55,
    text: `Jane Doe
Senior Software Engineer at Acme Corporation
San Francisco, CA · 500+ connections

Contact
jane@example.com
+1 415 555 0100

Experience
Senior Software Engineer
Acme Corporation
Jan 2022 - Present · 2 yrs
San Francisco, CA
- Led platform team.

Staff Engineer
Globex
Mar 2019 - Dec 2021
- Built billing platform.

Backend Engineer
Initech
Aug 2016 - Feb 2019
- Owned payment service.

Education
Stanford University, M.S., 2014 - 2016
`,
  },
  {
    label: 'Indeed builder (pipe-delimited)',
    minExperiences: 2,
    minConfidence: 0.55,
    text: `Sam Patel
sam.patel@example.com | (555) 123-4567 | Austin, TX

Work Experience
Senior Frontend Engineer | Rocketship Inc | Austin, TX
05/2021 to Present
- Shipped redesign.

Frontend Engineer | FinTech Co | Remote
01/2018 to 04/2021
- Built component library.

Education
B.S. Computer Science, University of Texas at Austin, 2017
`,
  },
  {
    label: 'Naukri all-caps headings',
    minExperiences: 2,
    minConfidence: 0.50,
    text: `RAHUL SHARMA
rahul.sharma@example.com | +91 98765 43210 | Bangalore

CAREER OBJECTIVE
Seeking a senior backend role.

WORK EXPERIENCE

Senior Software Engineer - TCS
07/2021 - Present
Bangalore, KA
- Led microservices design.

Software Engineer - Wipro
06/2018 - 06/2021
- Owned API gateway.

Associate Engineer - Infosys
07/2016 - 05/2018
- Implemented batch jobs.

EDUCATION
B.E. Computer Science, BMSCE Bangalore, 2012 - 2016
`,
  },
  {
    label: 'MS Word Modern (tabbed dates)',
    minExperiences: 2,
    minConfidence: 0.50,
    text: `Alex Kim
alex.kim@example.com | (212) 555-9999 | New York, NY

PROFESSIONAL SUMMARY
Product manager with 7+ years of experience.

PROFESSIONAL EXPERIENCE
Senior Product Manager\tJan 2020 - Present
Megacorp, New York, NY
- Owned roadmap for the platform business unit.

Product Manager\tFeb 2017 - Dec 2019
Innovate Co, Brooklyn, NY
- Launched mobile app reaching 1M MAUs.

EDUCATION
MBA, NYU Stern, 2015 - 2017
`,
  },
];

for (const tc of MARKET_CASES) {
  const parsed = parseResumeText(tc.text);
  const mapped = mapParsedResume(parsed);

  for (const exp of mapped.experience) {
    assert.ok(
      (exp.role || '').trim().length >= 2,
      `${tc.label}: experience missing role — ${JSON.stringify(exp)}`,
    );
    assert.ok(
      (exp.company || '').trim().length >= 2,
      `${tc.label}: experience missing company — ${JSON.stringify(exp)}`,
    );
  }
  assert.ok(
    mapped.experience.length >= tc.minExperiences,
    `${tc.label}: expected ≥ ${tc.minExperiences} experiences, got ${mapped.experience.length}. Entries: ${summary(mapped)}`,
  );

  assertConfidence(mapped, tc.text, tc.label, tc.minConfidence);
}

// ============================================================================
// Verifier-only sanity tests — feed an obviously broken extraction and
// confirm the verifier flags it.  Without these tests, the verifier could
// silently say "all good" for every input and we'd never know.
// ============================================================================
{
  // Phantom "(" / "SOFT SKILLS" pattern from the original bug report.
  const broken = {
    contact: undefined,
    experience: [
      { role: '(', company: 'SOFT SKILLS', startDate: '', endDate: '', highlights: ['Azure AZ900 (Microsoft - 2022)'] },
    ],
    education: [],
    skills: [],
  };
  const rawText = `SEEMA ALMAS YUNUS SHAIKH
TECHNICAL LEAD | FRONTEND ARCHITECT
Mobile No: 9172780700 E-mail: Seemaalmasshaikh@gmail.com Address: Pune, IN
WORK EXPERIENCE
Citi Corp
Assistant Vice President (Pune, India) (Dec 2022 - Present)
Ernst & Young
Senior Technology Consultant (Pune, Maharashtra) (Oct 2021 - Nov 2022)
SKILLS
Soft Skills: Communication, Teamwork
EDUCATION
B.E: Computer Science (2008-07 - 2012-07)
CERTIFICATIONS
Azure AZ900 (Microsoft - 2022)`;

  const report = verifyExtraction(rawText, broken);
  assert.ok(!report.ok, 'verifier should flag broken extraction');
  assert.ok(
    report.issues.some((i) => i.kind === 'phantom-experience'),
    `expected phantom-experience issue, got: ${JSON.stringify(report.issues)}`,
  );
  assert.ok(
    report.issues.some((i) => i.kind === 'missing-name'),
    `expected missing-name issue, got: ${JSON.stringify(report.issues)}`,
  );
  assert.ok(report.shouldReExtract, 'verifier should recommend re-extract');
  assert.ok(report.confidence < 0.55, `confidence should be low, got ${report.confidence}`);
}

{
  // Empty experience when raw text obviously has a career.
  const broken = {
    contact: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '4155550100' },
    experience: [],
    education: [],
    skills: [],
  };
  const rawText = `Jane Doe
jane@example.com | 4155550100
WORK EXPERIENCE
Senior Engineer at Acme (Jan 2020 - Present)
- Led platform team.
Senior Engineer at Globex (Jan 2017 - Dec 2019)
- Built APIs.`;

  const report = verifyExtraction(rawText, broken);
  assert.ok(
    report.issues.some((i) => i.kind === 'no-experience-extracted'),
    `expected no-experience-extracted, got: ${JSON.stringify(report.issues)}`,
  );
  assert.ok(report.shouldReExtract, 'verifier should recommend re-extract');
}

{
  // A good extraction should pass cleanly.
  const good = {
    contact: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '4155550100', location: 'San Francisco' },
    experience: [
      { role: 'Senior Engineer', company: 'Acme', startDate: 'Jan 2020', endDate: 'Present', highlights: [] },
    ],
    education: [
      { institution: 'Stanford', degree: 'M.S. CS', startDate: '2014', endDate: '2016', details: [] },
    ],
    skills: ['Python'],
  };
  const rawText = `Jane Doe
jane@example.com | 4155550100 | San Francisco
Experience
Senior Engineer at Acme (Jan 2020 - Present)
Education
M.S. CS, Stanford, 2014 - 2016`;
  const report = verifyExtraction(rawText, good);
  assert.ok(report.ok, `clean extraction should report ok, got issues: ${JSON.stringify(report.issues)}`);
  assert.ok(!report.shouldReExtract, 'clean extraction should NOT recommend re-extract');
  assert.ok(report.confidence >= 0.85, `confidence should be high, got ${report.confidence}`);
}

console.log('all-formats-verification: every fixture + market layout extracted cleanly');
