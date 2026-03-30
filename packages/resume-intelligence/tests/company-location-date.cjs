'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { parseResumeText } = require('../dist/resume-parser.js');
const { mapParsedResume } = require('../dist/field-mapper.js');

// ─── Test: Company (Location) (DateRange) format ────────────────────────────

describe('Company (Location) (DateRange) resume format', () => {
  const RESUME_TEXT = `SEEMA ALMAS YUNUS SHAIKH
Technical Lead | Frontend Architect | Aspiring Solution Architect
Mobile: 9172780700 E-mail: Seemaalmasshaikh@gmail.com Address: Pune, IN
PROFESSIONAL SUMMARY
Technical Lead with 11+ years of experience delivering frontend-heavy enterprise applications.
TECHNICAL SKILLS
HTML5 CSS3 JavaScript(ES6+) ReactJS Redux NodeJS MongoDB
WORK EXPERIENCE
Assistant Vice President
Citi Corp (Pune, India) (Dec 2022 - Present)
Owned frontend technical leadership for enterprise UI platforms.
Led React and Redux framework upgrades.
Achievements:
Initiated and delivered a React-Redux modernization program.
Senior Technology Consultant
Ernst & Young (Pune, Maharashtra) (Oct 2021 - Nov 2022)
Led UI-centric projects with responsibility for technical design.
Achievements:
Successfully delivered multiple zero-defect UI projects.
Senior Software Engineer
One Network Enterprises (Pune, Maharashtra) (Sep 2020 - Sep 2021)
Developed and optimized UI components for supply-chain enterprise applications.
Achievements:
Delivered performant and reliable UI solutions within tight project timelines.
Lead UI Developer
Infosys Limited (Pune) (Aug 2017 - Aug 2020)
Led end-to-end UI development for the Speedboat project.
Achievements:
Successfully delivered the Speedboat project with stable functionality.
Associate Software Engineer
The Digital Group Infotech Pvt. Ltd (Pune) (Apr 2014 - Jul 2017)
Contributed to frontend and backend development.
Achievements:
Improved application usability through consistent enhancements.
EDUCATION
B.E: Computer Science and Engineering (2008-07 - 2012-07)
Babasaheb Naik college of engineering`;

  it('extracts all 5 experience entries', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    assert.equal(result.experience.length, 5, `Expected 5 entries, got ${result.experience.length}`);
  });

  it('extracts correct company names without location artifacts', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    const companies = result.experience.map((e) => e.company);
    assert.ok(companies.includes('Citi Corp'), `Missing Citi Corp, got: ${companies.join(', ')}`);
    assert.ok(companies.includes('Ernst & Young'), `Missing Ernst & Young, got: ${companies.join(', ')}`);
    assert.ok(companies.includes('One Network Enterprises'), `Missing One Network Enterprises, got: ${companies.join(', ')}`);
    assert.ok(companies.includes('Infosys Limited'), `Missing Infosys Limited, got: ${companies.join(', ')}`);
    assert.ok(
      companies.some((c) => c.includes('Digital Group')),
      `Missing Digital Group, got: ${companies.join(', ')}`,
    );
    // No location artifacts in company names
    for (const company of companies) {
      assert.ok(!company.includes('(Pune'), `Company "${company}" contains location artifact`);
      assert.ok(!company.includes('India)'), `Company "${company}" contains location artifact`);
    }
  });

  it('extracts correct date ranges', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    const citiCorp = result.experience.find((e) => e.company === 'Citi Corp');
    assert.ok(citiCorp, 'Citi Corp entry not found');
    assert.equal(citiCorp.startDate, 'Dec 2022');
    assert.equal(citiCorp.endDate, 'Present');

    const ey = result.experience.find((e) => e.company === 'Ernst & Young');
    assert.ok(ey, 'Ernst & Young entry not found');
    assert.equal(ey.startDate, 'Oct 2021');
    assert.equal(ey.endDate, 'Nov 2022');

    const infosys = result.experience.find((e) => e.company === 'Infosys Limited');
    assert.ok(infosys, 'Infosys entry not found');
    assert.equal(infosys.startDate, 'Aug 2017');
    assert.equal(infosys.endDate, 'Aug 2020');

    const digital = result.experience.find((e) => e.company.includes('Digital Group'));
    assert.ok(digital, 'Digital Group entry not found');
    assert.equal(digital.startDate, 'Apr 2014');
    assert.equal(digital.endDate, 'Jul 2017');
  });

  it('extracts correct role titles', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    const roles = result.experience.map((e) => e.role);
    assert.ok(roles.includes('Assistant Vice President'), `Missing AVP, got: ${roles.join(', ')}`);
    assert.ok(roles.includes('Senior Technology Consultant'), `Missing STC, got: ${roles.join(', ')}`);
    assert.ok(roles.includes('Senior Software Engineer'), `Missing SSE, got: ${roles.join(', ')}`);
    assert.ok(roles.includes('Lead UI Developer'), `Missing LUD, got: ${roles.join(', ')}`);
    assert.ok(roles.includes('Associate Software Engineer'), `Missing ASE, got: ${roles.join(', ')}`);
  });

  it('each entry has highlights', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    for (const entry of result.experience) {
      assert.ok(
        entry.highlights.length > 0,
        `${entry.role} @ ${entry.company} has no highlights`,
      );
    }
  });

  it('Achievements: stays in experience section (not split to projects)', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    // The "Achievements:" sub-headings should NOT create a projects section
    const expLines = parsed.sections.experience || [];
    assert.ok(expLines.length >= 15, `Experience section too short: ${expLines.length} lines`);
    // All role titles should be in the experience section lines
    const expText = expLines.join('\n');
    assert.ok(expText.includes('Senior Software Engineer'), 'SSE missing from experience section');
    assert.ok(expText.includes('Lead UI Developer'), 'LUD missing from experience section');
    assert.ok(expText.includes('Associate Software Engineer'), 'ASE missing from experience section');
  });

  it('"Associate Software Engineer" is NOT treated as an education line', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    const ase = result.experience.find((e) => e.role === 'Associate Software Engineer');
    assert.ok(ase, 'Associate Software Engineer entry not found — likely misclassified as education');
    assert.ok(ase.company.includes('Digital Group'), `Wrong company: ${ase.company}`);
  });

  it('signals show correct counts', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    assert.equal(result.signals.roleCount, 5);
    assert.equal(result.signals.distinctCompanyCount, 5);
    assert.equal(result.signals.rolesWithDateCount, 5);
  });

  it('detects correct role level', () => {
    const parsed = parseResumeText(RESUME_TEXT);
    const result = mapParsedResume(parsed);
    assert.equal(result.roleLevel, 'SENIOR');
  });
});

// ─── Test: "projects" word inside bullet text is not split ───────────────────

describe('restructure does not split "projects" from bullet text', () => {
  it('preserves "...UI projects, improving..." as a single line', () => {
    const text = `WORK EXPERIENCE
Senior Technology Consultant
Ernst & Young (Pune, Maharashtra) (Oct 2021 - Nov 2022)
Successfully delivered multiple zero-defect UI projects, improving delivery reliability.
EDUCATION
B.E: Computer Science`;

    const parsed = parseResumeText(text);
    const expLines = parsed.sections.experience || [];
    // The line should NOT be split — "projects" should stay in the experience section
    const hasFullLine = expLines.some((l) => l.includes('zero-defect UI projects'));
    assert.ok(hasFullLine, `"projects" was split out of bullet text. Experience lines: ${JSON.stringify(expLines)}`);
  });
});

// ─── Test: existing formats still work ──────────────────────────────────────

describe('backward compatibility: dash-separated format', () => {
  it('parses "Role - Company - Date" format', () => {
    const text = `WORK EXPERIENCE
Senior Developer - TechCorp Inc - Jan 2020 to Present
Built microservices architecture.
Junior Developer - StartupLabs - Mar 2018 to Dec 2019
Developed React components.
EDUCATION
B.S. Computer Science`;

    const parsed = parseResumeText(text);
    const result = mapParsedResume(parsed);
    assert.ok(result.experience.length >= 2, `Expected >= 2 entries, got ${result.experience.length}`);
  });
});

describe('backward compatibility: comma-separated format', () => {
  it('parses "Role, Company" format', () => {
    const text = `WORK EXPERIENCE
AVP - Full Stack Engineer, Citi Corp
Dec 2022 - Present
Built enterprise platforms.
Software Developer, One Network Enterprises
Sep 2020 - Sep 2021
Developed UI components.
EDUCATION
B.E: Computer Science`;

    const parsed = parseResumeText(text);
    const result = mapParsedResume(parsed);
    assert.ok(result.experience.length >= 2, `Expected >= 2 entries, got ${result.experience.length}`);
  });
});

describe('backward compatibility: education "Associate" degree', () => {
  it('"Associate Degree in CS" is still detected as education', () => {
    const text = `WORK EXPERIENCE
Software Engineer
TechCorp (Jan 2020 - Present)
Built platforms.
EDUCATION
Associate Degree in Computer Science
Community College`;

    const parsed = parseResumeText(text);
    const edLines = parsed.sections.education || [];
    const hasAssociate = edLines.some((l) => /associate/i.test(l));
    assert.ok(hasAssociate, `"Associate Degree" not found in education section: ${JSON.stringify(edLines)}`);
  });
});
