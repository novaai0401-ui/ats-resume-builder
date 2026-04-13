/**
 * Comprehensive resume extraction tests covering all major resume formats
 * and edge cases found in ATS and standard resumes.
 */
const assert = require('node:assert/strict');
const { mapParsedResume, parseResumeText } = require('../dist/index.js');

function mapResume(text) {
  return mapParsedResume(parseResumeText(text));
}

// ============================================================================
// 1) Name extraction — headline continuation should not override name
// ============================================================================
{
  const mapped = mapResume(`
Chandan Kumar
Assistant Vice President - Engineering | Frontend Platforms | Engineering Leadership |
System Design
Phone No: 9307003382 Email Id: cks011992@gmail.com
Address: Pune, MH 411057

PROFESSIONAL SUMMARY
11+ years of experience delivering enterprise-scale software solutions.

WORK EXPERIENCE
AVP Dec 2022 - Present
Citi Corp (Pune)
- Led cross-functional platform delivery
`);

  assert.equal(mapped.contact?.fullName, 'Chandan Kumar', 'Name should be Chandan Kumar, not System Design');
  assert.ok(mapped.contact?.email === 'cks011992@gmail.com');
  assert.ok(mapped.contact?.phone);
  assert.ok((mapped.title || '').toLowerCase().includes('vice president') || (mapped.title || '').toLowerCase().includes('engineering'));
}

// ============================================================================
// 2) Role+DateRange on same line — "AVP Dec 2022 - Present"
// ============================================================================
{
  const mapped = mapResume(`
John Doe
john@example.com

WORK EXPERIENCE
AVP Dec 2022 - Present
Citi Corp (Pune)
- Provide technical and architectural leadership
- Own frontend architecture and delivery
Senior Technology Consultant
Oct 2021 - Dec 2022
Ernst & Young (Pune, Maharashtra)
- Served as frontend technical lead
Senior Software Developer Sep 2020 - Sep 2021
One Network Enterprises
- Led end-to-end frontend architecture
Lead UI Developer Jul 2014 - Aug 2020
Infosys Ltd
- Led frontend engineering for core banking platform
`);

  assert.equal(mapped.experience.length, 4, `Expected 4 experience entries, got ${mapped.experience.length}`);
  const citi = mapped.experience.find((e) => e.company.toLowerCase().includes('citi'));
  assert.ok(citi, 'Should find Citi Corp');
  assert.equal(citi.role, 'AVP');
  assert.equal(citi.startDate, 'Dec 2022');
  assert.equal(citi.endDate, 'Present');
  // Most recent experience should be first (reverse chronological)
  assert.ok(mapped.experience[0].endDate === 'Present' || /present/i.test(mapped.experience[0].endDate));
}

// ============================================================================
// 3) Hobbies section should NOT bleed into certifications
// ============================================================================
{
  const mapped = mapResume(`
Jane Smith
jane@example.com

CERTIFICATIONS
Azure-900
AWS Certified Solutions Architect

Hobbies
Exploring AI through self-learning projects
Playing chess to enhance strategic thinking
Writing technical blogs and tutorials

LANGUAGES
English, Hindi, French
`);

  assert.ok(mapped.certifications.length <= 2, `Expected at most 2 certs, got ${mapped.certifications.length}`);
  assert.ok(mapped.certifications.some((c) => c.name.includes('Azure-900')));
  assert.ok(!mapped.certifications.some((c) => /chess|exploring|writing|blog/i.test(c.name)),
    'Hobbies should not appear as certifications');
}

// ============================================================================
// 4) LANGUAGES section — human languages should NOT appear in skills
// ============================================================================
{
  const mapped = mapResume(`
John Doe
john@example.com

SKILLS
React, Redux, JavaScript, TypeScript, Node.js, Python

LANGUAGES
English, Hindi, French, Spanish
`);

  assert.ok(!mapped.skills.some((s) => /^(english|hindi|french|spanish)$/i.test(s)),
    'Human languages should not be in skills array');
  assert.ok(mapped.skills.some((s) => /react/i.test(s)), 'React should be in skills');
  assert.ok(mapped.skills.some((s) => /javascript/i.test(s)), 'JavaScript should be in skills');
}

// ============================================================================
// 5) Summary should not be truncated mid-word
// ============================================================================
{
  const mapped = mapResume(`
Alex Dev
alex@example.com

PROFESSIONAL SUMMARY
Experienced software engineering leader with over 11 years of hands-on expertise in building enterprise-grade frontend platforms for financial services organizations across multiple geographies including North America, Europe, and Asia Pacific regions, with a strong focus on React-based architectures, performance optimization, micro-frontend adoption strategies, component-driven UI design patterns, and cross-functional team leadership in agile delivery environments. Proven track record of delivering scalable solutions.
`);

  // Summary should not be cut off mid-word
  assert.ok(!mapped.summary.endsWith('expe'), 'Summary should not be truncated mid-word');
  assert.ok(mapped.summary.length <= 600, 'Summary should be at most 600 chars');
  if (mapped.summary.length > 10) {
    const lastChar = mapped.summary[mapped.summary.length - 1];
    assert.ok(lastChar !== '-' && lastChar !== ' ', 'Summary should not end with separator');
  }
}

// ============================================================================
// 6) Standard chronological resume format
// ============================================================================
{
  const mapped = mapResume(`
Sarah Johnson
Software Engineer | Full Stack Development
sarah@example.com | +1-555-123-4567 | San Francisco, CA

Summary
Innovative software engineer with 8 years of experience specializing in full-stack web development.

Skills
JavaScript, TypeScript, React, Angular, Node.js, Python, PostgreSQL, MongoDB, AWS, Docker, Kubernetes

Experience

Senior Software Engineer | Google LLC | Mar 2021 - Present
- Architected microservices handling 10M+ daily requests
- Led migration from monolith to distributed architecture

Software Engineer | Meta Platforms | Jun 2018 - Feb 2021
- Built real-time data processing pipeline
- Mentored 4 junior engineers

Junior Developer | StartupCo | Jan 2016 - May 2018
- Developed full-stack features using React and Node.js

Education
M.S. Computer Science
Stanford University (2014 - 2016)
B.S. Computer Science
UC Berkeley (2010 - 2014)

Certifications
AWS Solutions Architect Professional (2023)
Google Cloud Professional (2022)
`);

  assert.equal(mapped.contact?.fullName, 'Sarah Johnson');
  assert.equal(mapped.experience.length, 3);
  assert.ok(mapped.experience[0].endDate === 'Present' || /present/i.test(mapped.experience[0].endDate));
  assert.ok(mapped.experience.some((e) => e.company.toLowerCase().includes('google')));
  assert.ok(mapped.experience.some((e) => e.company.toLowerCase().includes('meta')));
  assert.ok(mapped.skills.some((s) => /typescript/i.test(s)));
  assert.ok(mapped.education.length >= 2);
  assert.ok(mapped.certifications.length >= 2);
}

// ============================================================================
// 7) Functional/skill-based resume format
// ============================================================================
{
  const mapped = mapResume(`
Michael Brown
michael.brown@email.com | (555) 987-6543

Objective
Results-driven project manager seeking to leverage 10+ years of experience.

Core Competencies
Agile, Scrum, JIRA, Confluence, Risk Management, Budgeting

Professional Experience
Senior Project Manager
Deloitte Consulting (New York, NY)
Jan 2020 - Present
- Managed portfolio of 12 projects valued at $15M
- Implemented agile transformation across 3 departments

Project Manager
IBM Corporation
2016 - 2019
- Led cross-functional teams of 25+ members

Associate Project Manager - Accenture
2013 - 2015
- Coordinated project timelines and resources

Education
MBA, Project Management
NYU Stern School of Business (2012)
B.A. Business Administration
University of Michigan (2010)
`);

  assert.equal(mapped.experience.length, 3);
  assert.ok(mapped.experience.some((e) => /deloitte/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /ibm/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /accenture/i.test(e.company)));
}

// ============================================================================
// 8) Two-column contact header (pipe-separated)
// ============================================================================
{
  const mapped = mapResume(`
Priya Patel
priya@email.com | +91 9876543210 | Bangalore, KA 560001 | https://linkedin.com/in/priyapatel

Profile Summary
Backend engineer with 6 years of experience in microservices architecture.

Technical Skills
Java, Spring Boot, Kafka, Redis, PostgreSQL, Docker, Kubernetes, AWS

Work Experience
Senior Backend Engineer
Amazon Development Centre (Bangalore)
Apr 2022 - Present
- Designed event-driven architecture processing 5M events/hour

Backend Developer
Flipkart (Bangalore)
Jul 2019 - Mar 2022
- Built RESTful APIs serving 100K+ daily active users

Software Engineer
TCS (Chennai)
Jun 2017 - Jun 2019
- Developed microservices for banking domain

Education
B.Tech Computer Science
IIT Bombay (2013 - 2017)

Languages
English, Hindi, Kannada
`);

  assert.equal(mapped.contact?.fullName, 'Priya Patel');
  assert.ok(mapped.contact?.location);
  assert.equal(mapped.experience.length, 3);
  assert.ok(!mapped.skills.some((s) => /^(english|hindi|kannada)$/i.test(s)),
    'Human languages should not be in skills');
}

// ============================================================================
// 9) ATS-exported PDF with page breaks and section spillover
// ============================================================================
{
  const mapped = mapResume(`
Raj Sharma
raj@email.com | Mumbai, MH

Professional Summary
- 10+ years of experience in the IT industry.

Work Experience
AVP Dec 2022 - Present
Citi Corp (Pune)
- Led cross-functional teams
Senior Technology Consultant
Oct 2021 - Dec 2022
Ernst & Young (Pune, Maharashtra)
- Engineered reusable HTML templates
-- 1 of 3 --
Education
B.E: Telecommunication Engineering
Siddaganga Institute, Tumkur, KA
(Jan 2010 - Jun 2014)
Senior Software Developer
One Network Enterprises
- Managed complete development lifecycle
Lead UI Developer
Infosys Ltd
- Directed end-to-end UI development
Sep 2020 - Sep 2021
Jul 2014 - Aug 2020
-- 2 of 3 --
Achievements
Spearheaded the Speedboat Project
`);

  assert.equal(mapped.experience.length, 4, `Expected 4 experience entries, got ${mapped.experience.length}`);
  assert.ok(mapped.experience.some((e) => /citi/i.test(e.company)), 'Should find Citi Corp');
  assert.ok(mapped.experience.some((e) => /ernst/i.test(e.company)), 'Should find Ernst & Young');
  assert.ok(mapped.experience.some((e) => /one network/i.test(e.company)), 'Should find One Network');
  assert.ok(mapped.experience.some((e) => /infosys/i.test(e.company)), 'Should find Infosys');
  const citi = mapped.experience.find((e) => /citi/i.test(e.company));
  assert.ok(citi.endDate === 'Present' || /present/i.test(citi.endDate), 'Citi should be current');
}

// ============================================================================
// 10) European/International CV format
// ============================================================================
{
  const mapped = mapResume(`
Dr. Anna Mueller
anna.mueller@email.de | +49 170 1234567 | Berlin, Germany
LinkedIn: https://linkedin.com/in/annamueller

Career Summary
Senior data scientist with expertise in NLP and computer vision.

Work History
Lead Data Scientist - SAP SE | 2021 - Present
- Led team of 8 data scientists building ML models
Data Scientist | Siemens AG | 2018 - 2021
- Developed predictive maintenance models
Research Associate | Fraunhofer Institute | 2015 - 2018
- Published 5 papers in peer-reviewed journals

Education
Ph.D. Computer Science - Technical University of Munich (2015)
M.Sc. Machine Learning - ETH Zurich (2012)

Certifications
TensorFlow Developer Certificate (2022)

Languages
German, English, French
`);

  assert.equal(mapped.experience.length, 3);
  assert.ok(mapped.experience.some((e) => /sap/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /siemens/i.test(e.company)));
  assert.ok(mapped.education.length >= 2);
  assert.ok(!mapped.skills.some((s) => /^(german|french)$/i.test(s)));
}

// ============================================================================
// 11) Fresher/entry-level resume with minimal experience
// ============================================================================
{
  const mapped = mapResume(`
Amit Verma
amit.verma@email.com | +91 9123456789

Objective
Recent B.Tech graduate seeking entry-level software developer position.

Education
B.Tech Computer Science and Engineering
VIT University, Vellore (2019 - 2023)
CGPA: 8.5/10

Projects
E-Commerce Platform (2023)
- Built full-stack e-commerce application using MERN stack
- Implemented payment gateway integration

Chat Application (2022)
- Developed real-time chat app using WebSocket and React

Skills
C++, Java, Python, JavaScript, React, Node.js, MongoDB, Git

Certifications
AWS Cloud Practitioner (2023)

Hobbies
Competitive programming, Open source contributions
`);

  assert.ok(mapped.education.length >= 1);
  assert.ok(mapped.skills.length >= 3);
  assert.ok(mapped.certifications.length === 1);
  assert.ok(!mapped.certifications.some((c) => /competitive|open source/i.test(c.name)),
    'Hobbies should not be certifications');
}

// ============================================================================
// 12) Resume with "Innovation & POCs" sub-section inside experience
// ============================================================================
{
  const mapped = mapResume(`
Test User
test@example.com

Work Experience
AVP Dec 2022 - Present
Citi Corp (Pune)
- Provide technical leadership
- Own frontend architecture

Innovation & POCs
- Built a GenAI POC using Python
- Developed a Jira integration POC

Senior Technology Consultant Oct 2021 - Dec 2022
Ernst & Young (Pune, Maharashtra)
- Served as frontend technical lead
`);

  // Innovation & POCs should be part of the experience, not a separate section
  assert.ok(mapped.experience.length >= 2, `Expected at least 2 experience entries, got ${mapped.experience.length}`);
  assert.ok(mapped.experience.some((e) => /citi/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /ernst/i.test(e.company)));
}

// ============================================================================
// 13) Resume with company name on separate line (multi-line format)
// ============================================================================
{
  const mapped = mapResume(`
Jane Developer
jane@company.com

Professional Experience

Senior Engineer
Tech Corp Inc.
Jan 2022 - Present
- Led backend architecture redesign
- Reduced API response time by 40%

Software Developer
Digital Solutions Ltd.
Jun 2019 - Dec 2021
- Built microservices platform
- Implemented CI/CD pipeline

Junior Developer
Startup Labs
Feb 2017 - May 2019
- Developed RESTful APIs
`);

  assert.equal(mapped.experience.length, 3);
  assert.ok(mapped.experience.some((e) => /tech corp/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /digital solutions/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /startup labs/i.test(e.company)));
}

// ============================================================================
// 14) Resume with mixed date formats
// ============================================================================
{
  const mapped = mapResume(`
Test Person
test@test.com

Experience
Lead Developer - Company A | January 2023 - Present
- Led development team
Senior Developer - Company B | 03/2020 - 12/2022
- Built core platform
Developer - Company C | 2017 - 2019
- Developed features
`);

  assert.equal(mapped.experience.length, 3);
  // All should have dates
  for (const exp of mapped.experience) {
    assert.ok(exp.startDate, `${exp.role} at ${exp.company} should have startDate`);
  }
}

// ============================================================================
// 15) Multiple roles at the same company
// ============================================================================
{
  const mapped = mapResume(`
Test User
test@example.com

Work Experience
Google LLC
Staff Engineer | Mar 2023 - Present
- Designed distributed data pipeline
Senior Engineer | Jan 2021 - Feb 2023
- Led migration to cloud-native architecture
Software Engineer | Jun 2018 - Dec 2020
- Built microservices for search infrastructure

Microsoft Corporation
Software Engineer II | 2015 - 2018
- Developed features for Azure platform
`);

  const googleRoles = mapped.experience.filter((e) => /google/i.test(e.company));
  assert.ok(googleRoles.length >= 2, 'Should have multiple roles at Google');
  assert.ok(mapped.experience.some((e) => /microsoft/i.test(e.company)));
}

// ============================================================================
// 16) Resume with TECHNICAL SKILLS and SOFT SKILLS as separate labeled lines
// ============================================================================
{
  const mapped = mapResume(`
Test User
test@example.com

SKILLS
TECHNICAL SKILLS: HTML5, CSS3, JavaScript, ReactJS, Redux, NodeJS, MongoDB
SOFT SKILLS: Communication, Teamwork, Leadership, Problem-solving

Work Experience
Developer - Some Corp | 2020 - Present
- Built web applications
`);

  assert.ok(mapped.skills.some((s) => /react/i.test(s)), 'Should have React in skills');
  assert.ok(mapped.skills.some((s) => /javascript/i.test(s)), 'Should have JavaScript in skills');
}

// ============================================================================
// 17) Resume with "Company (Location)" format (ATS common pattern)
// ============================================================================
{
  const mapped = mapResume(`
Test User
test@example.com

Professional Experience
Software Architect
Amazon Web Services (Seattle, WA)
Jun 2021 - Present
- Designed serverless architecture patterns
- Led team of 12 engineers

Senior Developer
Netflix (Los Gatos, CA)
Jan 2018 - May 2021
- Built video streaming optimization engine

Developer
Uber Technologies (San Francisco, CA)
Jul 2015 - Dec 2017
- Developed ride-matching algorithms
`);

  assert.equal(mapped.experience.length, 3);
  assert.ok(mapped.experience.some((e) => /amazon/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /netflix/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /uber/i.test(e.company)));
}

// ============================================================================
// 18) ALL-CAPS name should be normalized to Title Case
// ============================================================================
{
  const mapped = mapResume(`
JOHN DOE
john@email.com

Experience
Developer - Acme Corp | 2020 - Present
- Built features
`);

  assert.equal(mapped.contact?.fullName, 'John Doe', 'ALL-CAPS name should be title-cased');
}

// ============================================================================
// 19) Fresher resume with no experience section
// ============================================================================
{
  const mapped = mapResume(`
Rahul Singh
rahul@gmail.com

Objective
Fresh graduate seeking entry-level position.

Education
B.Tech Computer Science
IIT Delhi (2019 - 2023)

Skills
C++, Java, Python

Projects
Online Shopping Portal (2023)
- Built e-commerce platform

Certifications
Oracle Java SE 11 Developer (2023)
`);

  assert.equal(mapped.experience.length, 0, 'Fresher should have no experience');
  assert.equal(mapped.roleLevel, 'FRESHER', 'Should be FRESHER level');
  assert.ok(mapped.education.length >= 1);
  assert.ok(mapped.skills.length >= 2);
}

// ============================================================================
// 20) Short ALL-CAPS company abbreviations (TCS, IBM, HCL)
// ============================================================================
{
  const mapped = mapResume(`
Amit Sharma
amit@email.com

Work Experience
Senior Software Engineer
TCS (Chennai)
Jun 2016 - Mar 2020
- Developed microservices for banking domain

Developer
IBM (Bangalore)
Jan 2013 - May 2016
- Built enterprise applications
`);

  assert.ok(mapped.experience.some((e) => /tcs/i.test(e.company)), 'Should find TCS');
  assert.ok(mapped.experience.some((e) => /ibm/i.test(e.company)), 'Should find IBM');
}

// ============================================================================
// 21) Resume with "Role at Company" keyword format
// ============================================================================
{
  const mapped = mapResume(`
Test User
test@email.com

Experience
Senior Engineer at Amazon | 2021 - Present
- Built microservices
Engineer at Facebook | 2018 - 2021
- Developed features
`);

  assert.equal(mapped.experience.length, 2);
  assert.ok(mapped.experience.some((e) => /amazon/i.test(e.company)));
  assert.ok(mapped.experience.some((e) => /facebook/i.test(e.company)));
}

// ============================================================================
// 22) Volunteer/Hobbies/Interests sections should not create experience
// ============================================================================
{
  const mapped = mapResume(`
Jane Smith
jane@email.com

Experience
Product Manager - Google LLC | 2020 - Present
- Launched 3 products

Volunteer Experience
Mentor at Code for America

Interests
Rock climbing, Photography

Languages
English, Mandarin, Spanish
`);

  assert.equal(mapped.experience.length, 1, 'Only 1 real experience');
  assert.ok(!mapped.skills.some((s) => /^(english|mandarin|spanish)$/i.test(s)),
    'Human languages not in skills');
}

console.log('comprehensive resume extraction tests passed');
