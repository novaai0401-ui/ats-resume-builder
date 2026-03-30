'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { normalizeUploadText } = require('../dist/resume/resume.service.js');
const { parseResumeText, mapParsedResume } = require('resume-intelligence');

describe('restructureResumeText: heading splitting guards', () => {
  it('does NOT split "projects" from "...UI projects, improving..."', () => {
    const input = [
      'WORK EXPERIENCE',
      'Senior Consultant',
      'Ernst & Young (Pune) (Oct 2021 - Nov 2022)',
      'Successfully delivered multiple zero-defect UI projects, improving delivery reliability.',
      'EDUCATION',
      'B.E: Computer Science',
    ].join('\n');

    const normalized = normalizeUploadText(input);
    const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
    // "PROJECTS" should NOT appear as a standalone heading split from the bullet
    const projectsHeading = lines.find((l) => /^PROJECTS$/i.test(l));
    assert.ok(!projectsHeading, `Found unwanted "PROJECTS" heading in: ${lines.join(' | ')}`);
  });

  it('does NOT split "experience" from mid-sentence text', () => {
    const input = [
      'WORK EXPERIENCE',
      'Developer',
      'TechCorp (Jan 2020 - Present)',
      'Leveraged hands-on experience in React and Node.js to build scalable UIs.',
      'EDUCATION',
      'B.S. Computer Science',
    ].join('\n');

    const normalized = normalizeUploadText(input);
    const parsed = parseResumeText(normalized);
    // The word "experience" in "hands-on experience" should not start a new section
    const expLines = parsed.sections.experience || [];
    assert.ok(
      expLines.some((l) => l.includes('hands-on experience') || l.includes('Leveraged')),
      `Bullet about "experience" missing from experience section`,
    );
  });

  it('DOES split genuine section headings like "EDUCATION"', () => {
    const input = [
      'WORK EXPERIENCE',
      'Developer',
      'TechCorp (Jan 2020 - Present)',
      'Built platforms.',
      'EDUCATION',
      'B.E: Computer Science',
    ].join('\n');

    const normalized = normalizeUploadText(input);
    const parsed = parseResumeText(normalized);
    assert.ok(parsed.sections.education, 'EDUCATION section not found');
    assert.ok(parsed.sections.education.length > 0, 'EDUCATION section empty');
  });
});

describe('full pipeline: Company (Location) (DateRange) with Achievements', () => {
  it('extracts all 5 entries from seema-format resume', () => {
    const input = [
      'SEEMA ALMAS YUNUS SHAIKH',
      'Technical Lead | Frontend Architect',
      'Mobile: 9172780700 E-mail: test@test.com',
      'PROFESSIONAL SUMMARY',
      'Technical Lead with 11+ years of experience.',
      'TECHNICAL SKILLS',
      'HTML5 CSS3 JavaScript ReactJS Redux',
      'WORK EXPERIENCE',
      'Assistant Vice President',
      'Citi Corp (Pune, India) (Dec 2022 - Present)',
      'Owned frontend technical leadership for enterprise UI platforms.',
      'Led React and Redux framework upgrades.',
      'Achievements:',
      'Initiated and delivered a React-Redux modernization program.',
      'Senior Technology Consultant',
      'Ernst & Young (Pune, Maharashtra) (Oct 2021 - Nov 2022)',
      'Led UI-centric projects with responsibility for technical design.',
      'Achievements:',
      'Successfully delivered multiple zero-defect UI projects, improving delivery reliability.',
      'Senior Software Engineer',
      'One Network Enterprises (Pune, Maharashtra) (Sep 2020 - Sep 2021)',
      'Developed and optimized UI components for supply-chain enterprise applications.',
      'Achievements:',
      'Delivered performant and reliable UI solutions within tight project timelines.',
      'Lead UI Developer',
      'Infosys Limited (Pune) (Aug 2017 - Aug 2020)',
      'Led end-to-end UI development for the Speedboat project.',
      'Achievements:',
      'Successfully delivered the Speedboat project with stable functionality.',
      'Associate Software Engineer',
      'The Digital Group Infotech Pvt. Ltd (Pune) (Apr 2014 - Jul 2017)',
      'Contributed to frontend and backend development.',
      'Achievements:',
      'Improved application usability and functionality.',
      'EDUCATION',
      'B.E: Computer Science and Engineering (2008-07 - 2012-07)',
      'Babasaheb Naik college of engineering',
      'CERTIFICATIONS',
      'Azure AZ900 (Microsoft - 2022)',
      'ACHIEVEMENTS',
      'Consistently achieved near-perfect on-time delivery.',
    ].join('\n');

    const normalized = normalizeUploadText(input);
    const parsed = parseResumeText(normalized);
    const mapped = mapParsedResume(parsed);

    assert.equal(mapped.experience.length, 5, `Expected 5 entries, got ${mapped.experience.length}`);

    // Verify each entry
    const entries = mapped.experience;
    const citiCorp = entries.find((e) => e.company === 'Citi Corp');
    assert.ok(citiCorp, 'Citi Corp not found');
    assert.equal(citiCorp.role, 'Assistant Vice President');
    assert.equal(citiCorp.startDate, 'Dec 2022');
    assert.equal(citiCorp.endDate, 'Present');

    const ey = entries.find((e) => e.company === 'Ernst & Young');
    assert.ok(ey, 'Ernst & Young not found');
    assert.equal(ey.role, 'Senior Technology Consultant');

    const one = entries.find((e) => e.company === 'One Network Enterprises');
    assert.ok(one, 'One Network Enterprises not found');
    assert.equal(one.role, 'Senior Software Engineer');

    const infosys = entries.find((e) => e.company === 'Infosys Limited');
    assert.ok(infosys, 'Infosys Limited not found');
    assert.equal(infosys.role, 'Lead UI Developer');

    const digital = entries.find((e) => e.company.includes('Digital Group'));
    assert.ok(digital, 'Digital Group not found');
    assert.equal(digital.role, 'Associate Software Engineer');

    // Signals
    assert.equal(mapped.signals.roleCount, 5);
    assert.equal(mapped.signals.distinctCompanyCount, 5);
    assert.equal(mapped.signals.rolesWithDateCount, 5);
  });
});
