// Test all 3 resume formats: ATS PDF, regular PDF, DOCX
const { normalizeUploadText } = require('../dist/resume/resume.service.js');
const { parseResumeText, mapParsedResume } = require('../../packages/resume-intelligence/dist/index.js');

function testFormat(label, text) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`FORMAT: ${label}`);
  console.log('='.repeat(80));

  const normalized = normalizeUploadText(text);
  const parsed = parseResumeText(normalized);
  const result = mapParsedResume(parsed);

  console.log('\nSections:', Object.keys(parsed.sections));
  Object.entries(parsed.sections).forEach(([k, v]) => {
    console.log(`  ${k}: ${v.length} lines`);
  });

  console.log('\nContact:', JSON.stringify(result.contact, null, 2));
  console.log('Title:', result.title);
  console.log('Summary:', (result.summary || '').substring(0, 120) + '...');
  console.log('Skills (' + result.skills.length + '):', result.skills.slice(0, 10));
  console.log('\nExperience (' + result.experience.length + '):');
  result.experience.forEach(e => console.log(`  ${e.role} @ ${e.company} (${e.startDate} - ${e.endDate}) [${e.highlights.length} highlights]`));
  console.log('\nEducation (' + result.education.length + '):');
  result.education.forEach(e => console.log(`  ${e.degree} @ ${e.institution} (${e.startDate} - ${e.endDate})`));
  console.log('RoleLevel:', result.roleLevel);

  // Validate
  const errors = [];
  if (!result.contact.fullName) errors.push('MISSING: fullName');
  if (!result.contact.email) errors.push('MISSING: email');
  if (!result.contact.phone) errors.push('MISSING: phone');
  if (result.experience.length < 4) errors.push(`TOO FEW experiences: ${result.experience.length} (expected 4+)`);
  if (result.experience.length > 6) errors.push(`TOO MANY experiences: ${result.experience.length} (expected ~4-5)`);
  if (result.education.length !== 3) errors.push(`WRONG education count: ${result.education.length} (expected 3)`);

  // Check for garbage in experience
  result.experience.forEach(e => {
    if (/gmail\.com|email|mobile/i.test(e.company)) errors.push(`GARBAGE company: ${e.company}`);
    if (/gmail\.com|email|mobile/i.test(e.role)) errors.push(`GARBAGE role: ${e.role}`);
    if (!e.company || e.company.length < 3) errors.push(`BAD company: "${e.company}" for role "${e.role}"`);
    if (e.company === 'Full Stack Engineering | Frontend Strategist') errors.push('Title line parsed as experience');
  });

  // Check skills have technical skills
  const hasHtml = result.skills.some(s => /html/i.test(s));
  const hasReact = result.skills.some(s => /react/i.test(s));
  if (!hasHtml && !hasReact) errors.push('MISSING technical skills (no HTML or React found)');

  if (errors.length) {
    console.log('\n*** ERRORS ***');
    errors.forEach(e => console.log(`  - ${e}`));
  } else {
    console.log('\n*** ALL CHECKS PASSED ***');
  }

  return { result, errors, normalized };
}

// ============================================================================
// FORMAT 1: ATS PDF (multi-column, already fixed)
// ============================================================================
const atsText = `SOFT SKILLS

TECHNICAL SKILLS
Chandan Kumar
Tech Lead | AVP - Full Stack Engineering | Frontend Strategist
Mobile No: 9307003382 Email Id: cks011992@gmail.com
Address: Pune, MH 411057
Date of Birth: 01-01-1992
LinkedIn: https://www.linkedin.com/in/chandankumar007
Accomplished technology leader with 10+ years of experience driving product innovation, scalable system design, and high-performing engineering teams in the nancial services sector.

PROFESSIONAL SUMMARY
- 10+ years of experience in the IT industry with a strong track record
- Hands-on expertise in ReactJS, Redux, NodeJS, MongoDB, PolymerJS

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
Leading cross-functional teams (10+ members)
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

// ============================================================================
// FORMAT 2: Regular PDF (CHANDAN KUMAR.pdf - standard layout, not multi-column)
// pdf-parse extracts text top-to-bottom but with standard formatting
// ============================================================================
const regularPdfText = `Chandan Kumar
Tech Lead | AVP - Full Stack Engineering | Frontend Strategist
Mobile No: 9307003382 Email Id: cks011992@gmail.com
Address: Pune, MH 411057
Date of Birth: 01-01-1992
LinkedIn: https://www.linkedin.com/in/chandankumar007

Accomplished technology leader with 10+ years of experience driving product innovation, scalable system design, and high-performing
engineering teams in the nancial services sector. As an Assistant Vice President, I've led cross-functional squads through successful
delivery of React and Node-based enterprise platforms, modernized legacy systems, and aligned digital initiatives with business
strategy. I bring deep expertise in frontend and backend development, Agile methodologies, and stakeholder collaboration - all focused
on operational excellence, user experience, and measurable business outcomes.
I thrive on mentoring teams, building scalable architectures, and creating value through the strategic use of technology

Professional Summary
- 10+ years of experience in the IT industry with a strong track record of delivering
high-ROI software solutions for enterprise clients in the nancial sector.
- Hands-on expertise in ReactJS, Redux, NodeJS, MongoDB, PolymerJS, and full-stack
architecture - used to modernize legacy platforms and increase performance by up to 35%.
- Led cross-functional teams of 10+ developers across multiple geographies to deliver complex, client-facing applications on time and under budget.
- Successfully aligned technology initiatives with business goals, resulting in improved stakeholder satisfaction
- Blended Agile and Waterfall methodologies to improve delivery velocity and reduce release cycle time by 25%.
- Acted as a mentor and technical architect, upskilling teams and reducing onboarding time by 40%
- Adept at identifying high-impact tech opportunities to drive operational eciency

Work Experience

AVP
Citi Corp (Pune)
Dec 2022 - Present
Leading cross-functional teams (10+ members) to deliver enterprise-grade applications while driving customer-centric innovation,
performance optimization, and strategic alignment with business goals.
- Led a team of 10+ engineers to deliver high-performance frontend modules using ReactJS and NodeJS, improving system performance by 35%
- Coached junior developers and fostered a culture of innovation and continuous learning, reducing defect rates by 30%
- Partnered with Product Owners to redene UI workows, enhancing usability and customer satisfaction
- Acted as a bridge between stakeholders and developers, translating business goals into technical requirements
- Championed code reviews, architecture discussions, and cross-team syncs to align project delivery across verticals
- Delivered consistent Agile sprint results and helped reduce release cycle time by 25%
- Spearheaded a UI/UX modernization initiative that increased engagement and system adoption
- Reduced post-deployment defects to <2% through proactive testing, reusable component libraries, and dev mentorship

Senior Technology Consultant
Ernst & Young (Pune, Maharashtra)
Oct 2021 - Dec 2022
Led UX transformation and enterprise-grade frontend development using React and congurable HTML templates, enabling
scalable, high-performance nancial applications and improving developer velocity.
- Engineered a reusable HTML template system using React & HTML5, reducing frontend development effort by 60%
- Standardized UI best practices across teams, resulting in a 30% decrease in bugs and faster release cycles
- Led UX design optimization efforts, increasing end-user engagement by 25%
- Created developer-friendly documentation that improved onboarding speed by 40%
- Partnered directly with clients and product managers to gather requirements

Senior Software Developer
One Network Enterprises
Sep 2020 - Sep 2021
Led end-to-end UX implementation and frontend architecture using ReactJS, while mentoring the development team
- Managed complete development lifecycle from UX planning to deployment
- Designed enterprise-grade UX mockups and visual ows, resulting in a 30% increase in user task completion rate
- Delivered data-intensive visual dashboards using ReactJS and D3
- Developed scalable ReactJS components with reusable architecture, improving dev eciency and reducing rework by 40%
- Proposed and implemented UX enhancements that reduced support queries by 25%
- Mentored junior developers on frontend architecture and project design patterns

Lead UI Developer
Infosys Ltd
Jul 2014 - Aug 2020
Led frontend development and architectural decisions for FINACLE UI, while mentoring a 9-member team, driving component
reusability, and delivering a seamless banking experience through scalable UI frameworks.
- Directed the end-to-end UI development for FINACLE, Infosys' agship banking solution
- Authored solution design and implementation documents for one-pager UI framework
- Collaborated with Product Owners to translate evolving business needs into rened UI/UX workows
- Oversaw frontend component development using PolymerJS, JavaScript, and HTML5
- Managed functional requirement breakdowns and assigned tasks to a 9-member frontend engineering team
- Provided mentorship and hands-on training in PolymerJS, resulting in 40% improvement in code quality
- Implemented standardized code review protocols, reducing UI defect leakage by 35%

Technical Skills
HTML5, CSS3, JavaScript, ReactJS, Redux, NodeJS, MongoDB, Polymer JS, Mobx, NextJS, Python, Flutter

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
Spearheaded the Speedboat Project with a 9-member team, delivering the MVP 2 weeks ahead of schedule with <2% post-release defects.
Received the prestigious 'Rising Star' award twice for consistently delivering high-impact IT solutions.

Languages
English, Hindi

Hobbies
Competitive chess playing, demonstrating strategic thinking and problem-solving skills.`;

// ============================================================================
// FORMAT 3: DOCX (mammoth converts to structured text with headings)
// This simulates what convertDocxHtmlToStructuredText produces from mammoth HTML
// ============================================================================
const docxText = `CHANDAN KUMAR
TECH LEAD | AVP - FULL STACK ENGINEERING | FRONTEND STRATEGIST
Mobile No: 9307003382 Email Id: cks011992@gmail.com
Address: Pune, MH 411057
Date of Birth: 01-01-1992
LinkedIn: https://www.linkedin.com/in/chandankumar007

Accomplished technology leader with 10+ years of experience driving product innovation, scalable system design, and high-performing engineering teams in the nancial services sector. As an Assistant Vice President, I've led cross-functional squads through successful delivery of React and Node-based enterprise platforms, modernized legacy systems, and aligned digital initiatives with business strategy. I bring deep expertise in frontend and backend development, Agile methodologies, and stakeholder collaboration - all focused on operational excellence, user experience, and measurable business outcomes.
I thrive on mentoring teams, building scalable architectures, and creating value through the strategic use of technology

PROFESSIONAL SUMMARY
- 10+ years of experience in the IT industry with a strong track record of delivering high-ROI software solutions for enterprise clients in the nancial sector.
- Hands-on expertise in ReactJS, Redux, NodeJS, MongoDB, PolymerJS, and full-stack architecture - used to modernize legacy platforms and increase performance by up to 35%.
- Led cross-functional teams of 10+ developers across multiple geographies to deliver complex, client-facing applications on time and under budget.
- Successfully aligned technology initiatives with business goals, resulting in improved stakeholder satisfaction and measurable outcomes like 20% reduction in support tickets and 15% increase in user engagement.
- Blended Agile and Waterfall methodologies to improve delivery velocity and reduce release cycle time by 25%.
- Acted as a mentor and technical architect, upskilling teams and reducing onboarding time by 40% via documentation, reusable components, and streamlined processes.
- Adept at identifying high-impact tech opportunities to drive operational eciency, customer retention, and long-term cost savings.

WORK EXPERIENCE
AVP
Citi Corp (Pune)
Dec 2022 - Present
Leading cross-functional teams (10+ members) to deliver enterprise-grade applications while driving customer-centric innovation, performance optimization, and strategic alignment with business goals.
- Led a team of 10+ engineers to deliver high-performance frontend modules using ReactJS and NodeJS, improving system performance by 35%
- Coached junior developers and fostered a culture of innovation and continuous learning, reducing defect rates by 30%
- Partnered with Product Owners to redene UI workows, enhancing usability and customer satisfaction
- Acted as a bridge between stakeholders and developers, translating business goals into technical requirements
- Championed code reviews, architecture discussions, and cross-team syncs to align project delivery across verticals
- Delivered consistent Agile sprint results and helped reduce release cycle time by 25%
- Spearheaded a UI/UX modernization initiative that increased engagement and system adoption across multiple departments
- Reduced post-deployment defects to <2% through proactive testing, reusable component libraries, and dev mentorship
- Recognized by leadership for driving a culture of ownership, collaboration, and engineering excellence

SENIOR TECHNOLOGY CONSULTANT
Ernst & Young (Pune, Maharashtra)
Oct 2021 - Dec 2022
Led UX transformation and enterprise-grade frontend development using React and congurable HTML templates, enabling scalable, high-performance nancial applications and improving developer velocity.
- Engineered a reusable HTML template system using React & HTML5, reducing frontend development effort by 60% across
- Standardized UI best practices across teams, resulting in a 30% decrease in bugs and faster release cycles
- Led UX design optimization efforts, increasing end-user engagement by 25% through improved layout and accessibility
- Ensured zero-defect UI delivery in client-facing portals by implementing rigorous testing workows
- Created developer-friendly documentation that improved onboarding speed by 40%
- Partnered directly with clients and product managers to gather requirements and translate them into scalable frontend architecture
- Built and deployed a congurable HTML template engine that cut frontend setup time by 60%

SENIOR SOFTWARE DEVELOPER
One Network Enterprises
Sep 2020 - Sep 2021
Led end-to-end UX implementation and frontend architecture using ReactJS, while mentoring the development team and driving user-centric design improvements for enterprise-grade platforms.
- Managed complete development lifecycle from UX planning to deployment, enhancing platform usability and client satisfaction
- Designed enterprise-grade UX mockups and visual ows, resulting in a 30% increase in user task completion rate
- Delivered data-intensive visual dashboards using ReactJS and D3, enabling clearer decision-making for clients
- Developed scalable ReactJS components with reusable architecture, improving dev eciency and reducing rework by 40%
- Proposed and implemented UX enhancements that reduced support queries by 25% within two release cycles
- Mentored junior developers on frontend architecture and project design patterns, leading to stronger code consistency

LEAD UI DEVELOPER
Infosys Ltd
Jul 2014 - Aug 2020
Led frontend development and architectural decisions for FINACLE UI, while mentoring a 9-member team, driving component reusability, and delivering a seamless banking experience through scalable UI frameworks.
- Directed the end-to-end UI development for FINACLE, Infosys' agship banking solution, ensuring pixel-perfect user
- Authored solution design and implementation documents for one-pager UI framework
- Collaborated with Product Owners to translate evolving business needs into rened UI/UX workows, increasing task eciency by 20%
- Oversaw frontend component development using PolymerJS, JavaScript, and HTML5, ensuring consistency and reusability
- Managed functional requirement breakdowns and assigned tasks to a 9-member frontend engineering team
- Provided mentorship and hands-on training in PolymerJS, resulting in 40% improvement in code quality and reduced review cycles
- Implemented standardized code review protocols, reducing UI defect leakage by 35%
- Fostered cross-team communication to streamline handoffs with backend and QA teams in Agile sprints

TECHNICAL SKILLS
HTML5, CSS3, JavaScript, ReactJS, Redux, NodeJS, MongoDB, Polymer JS, Mobx, NextJS, Python, Flutter

SOFT SKILLS
Communication, Teamwork, Leadership, Problem-solving

EDUCATION
B.E: Telecommunication Engineering
Siddaganga Institute, Tumkur, KA
Jan 2010 - Jun 2014

Associate of Science: Science
A.N.S.M College, Aurangabad, BR
Jan 2007 - May 2010

High School Diploma
D.A.V Public School, Patna
Apr 2006 - Apr 2007

ACHIEVEMENTS
Spearheaded the Speedboat Project with a 9-member team, delivering the MVP 2 weeks ahead of schedule with <2% post-release defects. Demonstrated cross-functional leadership, agile planning, and technical execution across UI and backend layers.
Received the prestigious 'Rising Star' award twice for consistently delivering high-impact IT solutions, driving innovation, and exceeding delivery KPIs across enterprise software projects.

LANGUAGES
English, Hindi

HOBBIES
Competitive chess playing, demonstrating strategic thinking and problem-solving skills.`;

// Run all tests
const r1 = testFormat('ATS PDF (multi-column)', atsText);
const r2 = testFormat('Regular PDF (CHANDAN KUMAR.pdf)', regularPdfText);
const r3 = testFormat('DOCX (CHANDAN KUMAR.docx)', docxText);

console.log('\n\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`ATS PDF:     ${r1.errors.length ? 'FAIL (' + r1.errors.length + ' errors)' : 'PASS'}`);
console.log(`Regular PDF: ${r2.errors.length ? 'FAIL (' + r2.errors.length + ' errors)' : 'PASS'}`);
console.log(`DOCX:        ${r3.errors.length ? 'FAIL (' + r3.errors.length + ' errors)' : 'PASS'}`);
