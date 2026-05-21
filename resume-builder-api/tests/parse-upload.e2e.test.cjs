const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ResumeService } = require('../dist/resume/resume.service.js');

function createService() {
  return new ResumeService({});
}

function resolveFixturePath() {
  const candidates = [
    '/mnt/data/chandankumar_26Apr_12.pdf',
    'D:/chandankumar_26Apr_12.pdf',
    path.resolve(__dirname, '../../chandankumar_26Apr_12.pdf'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function resolveImpactFixturePath() {
  const fixtureName = 'resume-cmmd1j4ei0001bninaqk7xr1k.pdf';
  const localFixture = path.resolve(__dirname, 'fixtures', fixtureName);
  if (fs.existsSync(localFixture)) return localFixture;

  const externalCandidates = [
    `/mnt/data/${fixtureName}`,
    `D:/${fixtureName}`,
  ];
  for (const candidate of externalCandidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      fs.copyFileSync(candidate, localFixture);
    } catch {
      // Best-effort copy; parse directly from external path if local copy is not possible.
    }
    if (fs.existsSync(localFixture)) return localFixture;
    return candidate;
  }
  return '';
}

test('POST /resumes/parse-upload contract maps fixture resume to 4 experiences', async (t) => {
  const fixture = resolveFixturePath();
  if (!fixture) {
    // The chandankumar_26Apr_12.pdf fixture is developer-local (lives at
    // /mnt/data/ or D:/ on the maintainer's laptop, not checked into the
    // repo).  When it's not present — e.g. CI or a fresh clone — skip
    // rather than fail so the rest of the suite can still gate merges.
    t.skip('chandankumar_26Apr_12.pdf fixture not available in this environment');
    return;
  }
  const service = createService();
  const result = await service.parseResumeUpload({
    originalname: 'chandankumar_26Apr_12.pdf',
    mimetype: 'application/pdf',
    buffer: fs.readFileSync(fixture),
  });

  assert.equal(result.fileName, 'chandankumar_26Apr_12.pdf');
  assert.equal(result.parsed.contact.fullName, 'Chandan Kumar');
  assert.notEqual((result.parsed.title || '').toLowerCase(), 'soft skills');
  assert.equal(result.parsed.experience.length, 4);
  const companies = result.parsed.experience.map((item) => item.company.toLowerCase());
  assert.ok(companies.some((name) => name.includes('citi')));
  assert.ok(companies.some((name) => name.includes('ernst')));
  assert.ok(companies.some((name) => name.includes('one network')));
  assert.ok(companies.some((name) => name.includes('infosys')));
  assert.equal(result.parsed.experience[0].company.toLowerCase().includes('citi'), true);
  assert.equal(result.parsed.experience[0].role.toLowerCase().includes('avp'), true);
  assert.equal(result.parsed.experience[0].startDate, '2022-12');
  assert.equal(result.parsed.experience[0].endDate, 'Present');
});

test('POST /resumes/parse-upload regression: simple text upload still maps experience', async () => {
  const service = createService();
  const simpleResume = `
Alex Rivera
Senior Software Engineer
Email: alex@example.com
Phone: +1 555 102 0044

Professional Summary
Platform engineer delivering reliable backend systems.

Work Experience
Senior Software Engineer
Acme Corp
- Improved API latency by 30%
Jan 2021 - Present

Education
B.E Computer Science
State University
2014 - 2018
`;
  const result = await service.parseResumeUpload({
    originalname: 'simple.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from(simpleResume, 'utf8'),
  });

  assert.ok(result.parsed.experience.length >= 1);
  assert.ok(result.parsed.experience.some((item) => item.company.toLowerCase().includes('acme')));
  assert.ok(result.parsed.experience.some((item) => item.role.toLowerCase().includes('engineer')));
  assert.ok(result.parsed.experience.some((item) => item.highlights.join(' ').toLowerCase().includes('latency')));
});

test('POST /resumes/parse-upload regression: impact prefixes are normalized and do not inflate experiences', async () => {
  const service = createService();
  const fixture = resolveImpactFixturePath();

  const result = fixture
    ? await service.parseResumeUpload({
      originalname: path.basename(fixture),
      mimetype: 'application/pdf',
      buffer: fs.readFileSync(fixture),
    })
    : await service.parseResumeUpload({
      originalname: 'impact-regression.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from(`
Jane Doe
Professional Summary
Engineering leader focused on measurable outcomes.

Experience
AVP
Citi Corp (Pune)
Impact: Led cross-functional teams to deliver enterprise-grade applications.
Achievement: Improved release quality through CI guardrails.
Dec 2022 - Present

Senior Technology Consultant
Ernst & Young (Pune, Maharashtra)
Result: Engineered reusable template architecture for resume exports.
Highlights: Reduced frontend effort by 60% across teams.
Oct 2021 - Dec 2022

Senior Software Developer
One Network Enterprises
Accomplishment: Managed complete development lifecycle from UX planning to deployment.
Impact: Improved production reliability with better observability.
Sep 2020 - Sep 2021

Lead UI Developer
Infosys Ltd
Impact: Directed end-to-end UI delivery for FINACLE.
Impact: Standardized coding patterns for maintainability.
Jul 2014 - Aug 2020
      `, 'utf8'),
    });

  assert.ok(result.parsed.experience.length >= 1, 'Expected at least one mapped experience entry.');
  assert.ok(
    result.parsed.experience.length <= 5,
    `Expected <= 5 experience entries after normalization, got ${result.parsed.experience.length}.`,
  );
  for (const item of result.parsed.experience) {
    for (const highlight of item.highlights || []) {
      assert.ok(
        !/^\s*(?:[-*•·]+)?\s*(impact|achievement|result|highlights?|accomplishment)\s*:/i.test(String(highlight || '')),
        `Highlight should not keep legacy prefix: "${highlight}"`,
      );
    }
  }
});

test('POST /resumes/parse-upload regression: ATS-exported PDF text round-trips correctly', async () => {
  const service = createService();
  const atsResumeText = `
Chandan Kumar
cks011992@gmail.com | +91-9307003382 | Pune, MH 411057 | https://www.linkedin.com/in/chandankumar007

SUMMARY
10+ years of experience in the IT industry with expertise in full-stack development, agile planning, and driving innovation across enterprise platforms.

SKILLS
JavaScript, React, Node.js, TypeScript, Angular, HTML, CSS, AWS, Docker, Git, Agile methodologies, CI/CD, MongoDB, PostgreSQL, Redis, Microservices, REST APIs, GraphQL, Kubernetes

EXPERIENCE
AVP - Full Stack Engineer, Citi Corp
Dec 2022 - Present
Led cross-functional teams to deliver enterprise-grade applications
Architected scalable microservices using Node.js and React
Improved release quality through CI guardrails

Senior Technology Consultant, Ernst & Young
Oct 2021 - Dec 2022
Engineered reusable template architecture for resume exports
Reduced frontend effort by 60% across teams

Senior Software Developer, One Network Enterprises
Sep 2020 - Sep 2021
Managed complete development lifecycle from UX planning to deployment
Improved production reliability with better observability

Lead UI Developer, Infosys Ltd
Jul 2014 - Aug 2020
Directed end-to-end UI delivery for FINACLE
Standardized coding patterns for maintainability

EDUCATION
Master of Computer Applications
Savitribai Phule Pune University
2012 - 2014

Bachelor of Computer Applications
University of Pune
2009 - 2012

CERTIFICATIONS
AWS Certified Solutions Architect
Amazon Web Services | 2023
`;

  const result = await service.parseResumeUpload({
    originalname: 'ats-export.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from(atsResumeText, 'utf8'),
  });

  // Contact
  assert.equal(result.parsed.contact.fullName, 'Chandan Kumar');
  assert.equal(result.parsed.contact.email, 'cks011992@gmail.com');

  // Experience: 4 entries with correct role/company splits
  assert.equal(result.parsed.experience.length, 4, `Expected 4 experiences, got ${result.parsed.experience.length}`);
  const companies = result.parsed.experience.map((item) => item.company.toLowerCase());
  assert.ok(companies.some((c) => c.includes('citi')), 'Missing Citi Corp');
  assert.ok(companies.some((c) => c.includes('ernst')), 'Missing Ernst & Young');
  assert.ok(companies.some((c) => c.includes('one network')), 'Missing One Network');
  assert.ok(companies.some((c) => c.includes('infosys')), 'Missing Infosys');

  // AVP entry should have correct role (not truncated to just "AVP")
  const citi = result.parsed.experience.find((item) => item.company.toLowerCase().includes('citi'));
  assert.ok(citi.role.toLowerCase().includes('avp') || citi.role.toLowerCase().includes('full stack'),
    `Citi role should contain AVP or Full Stack: "${citi.role}"`);
  assert.ok(citi.startDate, 'Citi should have a start date');
  assert.ok(citi.endDate, 'Citi should have an end date');
  assert.ok(citi.highlights.length >= 1, 'Citi should have highlights');

  // Skills: should extract most items (not just 3)
  assert.ok(result.parsed.skills.length >= 10, `Expected >= 10 skills, got ${result.parsed.skills.length}`);

  // Education
  assert.ok(result.parsed.education.length >= 2, `Expected >= 2 education, got ${result.parsed.education.length}`);

  // Certifications
  assert.ok(result.parsed.certifications.length >= 1, `Expected >= 1 certifications, got ${result.parsed.certifications.length}`);

  // Role level should NOT be FRESHER
  assert.notEqual(result.parsed.roleLevel, 'FRESHER', 'Role level should not be FRESHER for 10+ years exp');
});

test('POST /resumes/parse-upload regression: contact extracted even when first line is title not name', async () => {
  const service = createService();
  const atsResumeText = `
Tech Lead / AVP - Full Stack Engineering / Frontend Strategist
cks011992@gmail.com | 9307003382 | Pune, MH 411057 | https://www.linkedin.com/in/chandankumar007

SUMMARY
10+ years of experience in the IT industry.

SKILLS
JavaScript, React, Node.js, TypeScript, Angular, CSS, AWS, Docker

EXPERIENCE
AVP, Citi Corp
Dec 2022 - Present
Led cross-functional teams to deliver enterprise-grade applications
Architected scalable microservices using Node.js and React

Senior Technology Consultant, Ernst & Young
Oct 2021 - Dec 2022
Engineered reusable template architecture
Reduced frontend effort by 60%

EDUCATION
Master of Computer Applications
SPPU
Jan 2012 - Jan 2014
`;

  const result = await service.parseResumeUpload({
    originalname: 'ats-title-header.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from(atsResumeText, 'utf8'),
  });

  // Contact must be populated with email/phone even when name is not recognized
  assert.ok(result.parsed.contact, 'Contact must exist');
  assert.equal(result.parsed.contact.email, 'cks011992@gmail.com', 'Email must be extracted');
  assert.ok(result.parsed.contact.phone && result.parsed.contact.phone.includes('9307003382'), 'Phone must be extracted');

  // Experience must still parse correctly
  assert.ok(result.parsed.experience.length >= 2, `Expected >= 2 experiences, got ${result.parsed.experience.length}`);
  assert.ok(result.parsed.experience.some((e) => e.company.toLowerCase().includes('citi')), 'Missing Citi Corp');

  // Skills
  assert.ok(result.parsed.skills.length >= 5, `Expected >= 5 skills, got ${result.parsed.skills.length}`);

  // Education with abbreviation institution
  assert.ok(result.parsed.education.length >= 1, `Expected >= 1 education, got ${result.parsed.education.length}`);
  assert.ok(result.parsed.education.some((e) => e.institution.includes('SPPU')), 'SPPU should be recognized as institution');
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 6: Multi-column PDF (sidebar skills + main content)
// Simulates what pdf-parse produces from a resume with a skills sidebar
// ──────────────────────────────────────────────────────────────────────────────
test('POST /resumes/parse-upload regression: multi-column PDF with sidebar skills parses correctly', async () => {
  const service = createService();
  const multiColumnText = `SOFT SKILLS

TECHNICAL SKILLS
Chandan Kumar
Tech Lead | AVP - Full Stack Engineering | Frontend Strategist
Mobile No: 9307003382 Email Id: cks011992@gmail.com
Address: Pune, MH 411057
Date of Birth: 01-01-1992
LinkedIn: https://www.linkedin.com/in/chandankumar007
Accomplished technology leader with 10+ years of experience driving product innovation, scalable system design, and high-performing engineering teams.

PROFESSIONAL SUMMARY
- 10+ years of experience in the IT industry
- Hands-on expertise in ReactJS, Redux, NodeJS, MongoDB

WORK EXPERIENCE
Communication
Teamwork
Leadership
Problem-solving
HTML5
CSS3
JavaScript
ReactJS
Redux
NodeJS
MongoDB
Polymer JS
Mobx
NextJS
Python
Flutter
AVP
Citi Corp (Pune)
Leading cross-functional teams (10+ members) to deliver enterprise-grade applications
- Led a team of 10+ engineers
- Partnered with Product Owners
Senior Technology Consultant
Ernst & Young (Pune, Maharashtra)
Led UX transformation
- Engineered a reusable HTML template system

PROJECTS
- Standardized UI best practices
Dec 2022 - Present
Oct 2021 - Dec 2022

-- 1 of 3 --

EDUCATION
B.E: Telecommunication Engineering
Siddaganga Institute, Tumkur, KA
(Jan 2010 - Jun 2014)
Associate of Science: Science
A.N.S.M College, Aurangabad, BR
(Jan 2007 - May 2010)
High School Diploma
D.A.V Public School, Patna
(Apr 2006 - Apr 2007)
Senior Software Developer
One Network Enterprises
Led end-to-end UX implementation
- Managed complete development lifecycle
Lead UI Developer
Infosys Ltd
Led frontend development for FINACLE UI

EXPERIENCE
across modules
Sep 2020 - Sep 2021
Jul 2014 - Aug 2020

-- 2 of 3 --

ACHIEVEMENTS
Spearheaded the Speedboat Project

LANGUAGES
English, Hindi

-- 3 of 3 --`;

  const result = await service.parseResumeUpload({
    originalname: 'multi-column.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from(multiColumnText, 'utf8'),
  });

  // Contact: name, email, phone extracted correctly
  assert.equal(result.parsed.contact.fullName, 'Chandan Kumar');
  assert.equal(result.parsed.contact.email, 'cks011992@gmail.com');
  assert.ok(result.parsed.contact.phone && result.parsed.contact.phone.includes('9307003382'));

  // Experience: 4 entries with correct companies (NOT title/contact as experience)
  assert.equal(result.parsed.experience.length, 4, `Expected 4 experiences, got ${result.parsed.experience.length}: ${JSON.stringify(result.parsed.experience.map(e => e.role + ' @ ' + e.company))}`);
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('citi')), 'Missing Citi Corp');
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('ernst')), 'Missing Ernst & Young');
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('one network')), 'Missing One Network');
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('infosys')), 'Missing Infosys');

  // No garbage experience entries (title or contact info)
  result.parsed.experience.forEach(e => {
    assert.ok(!/gmail|email|mobile/i.test(e.company), `Garbage company: ${e.company}`);
    assert.ok(!/gmail|email|mobile/i.test(e.role), `Garbage role: ${e.role}`);
    assert.ok(e.company !== 'Full Stack Engineering | Frontend Strategist', 'Title line parsed as company');
  });

  // Dates: AVP should be Dec 2022 - Present, not education dates
  const citi = result.parsed.experience.find(e => e.company.toLowerCase().includes('citi'));
  assert.ok(citi.startDate && citi.startDate.includes('2022'), `Citi startDate should be 2022, got: ${citi.startDate}`);
  assert.ok(citi.endDate && citi.endDate.includes('Present'), `Citi endDate should be Present, got: ${citi.endDate}`);

  // Skills: should include sidebar technical skills (HTML5, CSS3, ReactJS, etc.)
  assert.ok(result.parsed.skills.some(s => /html/i.test(s)), 'Missing HTML5 in skills');
  assert.ok(result.parsed.skills.some(s => /react/i.test(s)), 'Missing ReactJS in skills');
  assert.ok(result.parsed.skills.some(s => /node/i.test(s)), 'Missing NodeJS in skills');

  // Education: exactly 3 entries (no experience leaking into education)
  assert.equal(result.parsed.education.length, 3, `Expected 3 education entries, got ${result.parsed.education.length}: ${JSON.stringify(result.parsed.education.map(e => e.degree + ' @ ' + e.institution))}`);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 7: DOCX-extracted text (mammoth HTML → structured text)
// Simulates what mammoth + convertDocxHtmlToStructuredText produces
// ──────────────────────────────────────────────────────────────────────────────
test('POST /resumes/parse-upload regression: DOCX-extracted text parses all fields correctly', async () => {
  const service = createService();
  // Simulates convertDocxHtmlToStructuredText output: headings and bold roles UPPERCASED
  const docxText = `CHANDAN KUMAR
TECH LEAD | AVP - FULL STACK ENGINEERING | FRONTEND STRATEGIST
Mobile No: 9307003382 Email Id: cks011992@gmail.com
Address: Pune, MH 411057
LinkedIn: https://www.linkedin.com/in/chandankumar007
Accomplished technology leader with 10+ years of experience driving product innovation.

PROFESSIONAL SUMMARY
- 10+ years of experience in the IT industry
- Hands-on expertise in ReactJS, Redux, NodeJS, MongoDB, PolymerJS

WORK EXPERIENCE
AVP
CITI CORP (PUNE)
Dec 2022 - Present
Leading cross-functional teams (10+ members)
- Led a team of 10+ engineers
- Coached junior developers

SENIOR TECHNOLOGY CONSULTANT
Ernst & Young (Pune, Maharashtra)
Oct 2021 - Dec 2022
Led UX transformation
- Engineered a reusable HTML template system

SENIOR SOFTWARE DEVELOPER
ONE NETWORK ENTERPRISES
Sep 2020 - Sep 2021
Led end-to-end UX implementation
- Managed complete development lifecycle

LEAD UI DEVELOPER
INFOSYS LTD
Jul 2014 - Aug 2020
Led frontend development for FINACLE UI
- Directed end-to-end UI development

TECHNICAL SKILLS
HTML5, CSS3, JavaScript, ReactJS, Redux, NodeJS, MongoDB, Polymer JS, Mobx, NextJS, Python, Flutter

SOFT SKILLS
Communication, Teamwork, Leadership, Problem-solving

EDUCATION
B.E: Telecommunication Engineering
Siddaganga Institute, Tumkur, KA
Jan 2010 - Jun 2014

ASSOCIATE OF SCIENCE: SCIENCE
A.N.S.M College, Aurangabad, BR
Jan 2007 - May 2010

HIGH SCHOOL DIPLOMA
D.A.V Public School, Patna
Apr 2006 - Apr 2007

ACHIEVEMENTS
Spearheaded the Speedboat Project

LANGUAGES
English, Hindi`;

  const result = await service.parseResumeUpload({
    originalname: 'CHANDAN_KUMAR.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from(docxText, 'utf8'),
  });

  // Contact
  assert.ok(result.parsed.contact.fullName, 'fullName must be extracted');
  assert.equal(result.parsed.contact.email, 'cks011992@gmail.com');
  assert.ok(result.parsed.contact.phone && result.parsed.contact.phone.includes('9307003382'));

  // Experience: 4 entries with correct companies
  assert.equal(result.parsed.experience.length, 4, `Expected 4 experiences, got ${result.parsed.experience.length}: ${JSON.stringify(result.parsed.experience.map(e => e.role + ' @ ' + e.company))}`);
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('citi')), 'Missing Citi Corp');
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('ernst')), 'Missing Ernst & Young');
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('one network')), 'Missing One Network');
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('infosys')), 'Missing Infosys');

  // All experiences should have dates
  result.parsed.experience.forEach(e => {
    assert.ok(e.startDate, `Missing startDate for ${e.role} @ ${e.company}`);
  });

  // Skills
  assert.ok(result.parsed.skills.some(s => /react/i.test(s)), 'Missing ReactJS in skills');
  assert.ok(result.parsed.skills.some(s => /html/i.test(s)), 'Missing HTML5 in skills');
  assert.ok(result.parsed.skills.length >= 10, `Expected >= 10 skills, got ${result.parsed.skills.length}`);

  // Education: 3 entries
  assert.equal(result.parsed.education.length, 3, `Expected 3 education, got ${result.parsed.education.length}`);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 8: Standard PDF text (non-multi-column, well-structured)
// Simulates what pdf-parse produces from a standard single-column PDF
// ──────────────────────────────────────────────────────────────────────────────
test('POST /resumes/parse-upload regression: standard PDF text parses all fields correctly', async () => {
  const service = createService();
  const pdfText = `Chandan Kumar
Tech Lead | AVP - Full Stack Engineering | Frontend Strategist
Mobile No: 9307003382 Email Id: cks011992@gmail.com
Address: Pune, MH 411057
LinkedIn: https://www.linkedin.com/in/chandankumar007
Accomplished technology leader with 10+ years of experience.

Professional Summary
- 10+ years of experience in the IT industry
- Hands-on expertise in ReactJS, Redux, NodeJS, MongoDB

Work Experience

AVP
Citi Corp (Pune)
Dec 2022 - Present
Leading cross-functional teams (10+ members)
- Led a team of 10+ engineers
- Partnered with Product Owners

Senior Technology Consultant
Ernst & Young (Pune, Maharashtra)
Oct 2021 - Dec 2022
Led UX transformation
- Engineered a reusable HTML template system

Senior Software Developer
One Network Enterprises
Sep 2020 - Sep 2021
Led end-to-end UX implementation
- Managed complete development lifecycle

Lead UI Developer
Infosys Ltd
Jul 2014 - Aug 2020
Led frontend development for FINACLE UI
- Directed end-to-end UI development

Technical Skills
HTML5, CSS3, JavaScript, ReactJS, Redux, NodeJS, MongoDB, Polymer JS

Soft Skills
Communication, Teamwork, Leadership, Problem-solving

Education
B.E: Telecommunication Engineering
Siddaganga Institute, Tumkur, KA
Jan 2010 - Jun 2014

Associate of Science: Science
A.N.S.M College, Aurangabad, BR
Jan 2007 - May 2010

High School Diploma
D.A.V Public School, Patna
Apr 2006 - Apr 2007

Achievements
Spearheaded the Speedboat Project

Languages
English, Hindi`;

  const result = await service.parseResumeUpload({
    originalname: 'chandankumar.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from(pdfText, 'utf8'),
  });

  // Contact
  assert.equal(result.parsed.contact.fullName, 'Chandan Kumar');
  assert.equal(result.parsed.contact.email, 'cks011992@gmail.com');
  assert.ok(result.parsed.contact.phone && result.parsed.contact.phone.includes('9307003382'));

  // Experience: 4 entries
  assert.equal(result.parsed.experience.length, 4, `Expected 4 experiences, got ${result.parsed.experience.length}`);
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('citi')));
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('ernst')));
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('one network')));
  assert.ok(result.parsed.experience.some(e => e.company.toLowerCase().includes('infosys')));

  // Skills
  assert.ok(result.parsed.skills.some(s => /react/i.test(s)), 'Missing ReactJS');
  assert.ok(result.parsed.skills.length >= 8, `Expected >= 8 skills, got ${result.parsed.skills.length}`);

  // Education: 3 entries
  assert.equal(result.parsed.education.length, 3, `Expected 3 education, got ${result.parsed.education.length}`);
});
