// Test the actual mammoth HTML → structured text → parse pipeline
const { convertDocxHtmlToStructuredText, normalizeUploadText } = require('../dist/resume/resume.service.js');
const { parseResumeText, mapParsedResume } = require('../../packages/resume-intelligence/dist/index.js');

// Simulate what mammoth.convertToHtml() produces for a typical DOCX resume
// Bold text in paragraphs, list items, heading tags, etc.
const mammothHtml = `
<p><strong>Chandan Kumar</strong></p>
<p><strong>Tech Lead | AVP - Full Stack Engineering | Frontend Strategist</strong></p>
<p>Mobile No: 9307003382 Email Id: cks011992@gmail.com</p>
<p>Address: Pune, MH 411057</p>
<p>Date of Birth: 01-01-1992</p>
<p>LinkedIn: <a href='https://www.linkedin.com/in/chandankumar007'>https://www.linkedin.com/in/chandankumar007</a></p>
<p>Accomplished technology leader with 10+ years of experience driving product innovation, scalable system design, and high-performing engineering teams in the financial services sector. As an Assistant Vice President, I've led cross-functional squads through successful delivery of React and Node-based enterprise platforms.</p>
<p>I thrive on mentoring teams, building scalable architectures, and creating value through the strategic use of technology</p>
<p><strong>Professional Summary</strong></p>
<ul>
<li>10+ years of experience in the IT industry with a strong track record of delivering high-ROI software solutions for enterprise clients in the financial sector.</li>
<li>Hands-on expertise in ReactJS, Redux, NodeJS, MongoDB, PolymerJS, and full-stack architecture - used to modernize legacy platforms and increase performance by up to 35%.</li>
<li>Led cross-functional teams of 10+ developers across multiple geographies to deliver complex, client-facing applications on time and under budget.</li>
<li>Successfully aligned technology initiatives with business goals, resulting in improved stakeholder satisfaction</li>
<li>Blended Agile and Waterfall methodologies to improve delivery velocity and reduce release cycle time by 25%.</li>
<li>Acted as a mentor and technical architect, upskilling teams and reducing onboarding time by 40%</li>
</ul>
<p><strong>Work Experience</strong></p>
<p><strong>AVP</strong></p>
<p><strong>Citi Corp (Pune)</strong></p>
<p>Dec 2022 - Present</p>
<p>Leading cross-functional teams (10+ members) to deliver enterprise-grade applications while driving customer-centric innovation, performance optimization, and strategic alignment with business goals.</p>
<ul>
<li>Led a team of 10+ engineers to deliver high-performance frontend modules using ReactJS and NodeJS, improving system performance by 35%</li>
<li>Coached junior developers and fostered a culture of innovation and continuous learning, reducing defect rates by 30%</li>
<li>Partnered with Product Owners to redefine UI workflows, enhancing usability and customer satisfaction</li>
<li>Acted as a bridge between stakeholders and developers, translating business goals into technical requirements</li>
<li>Championed code reviews, architecture discussions, and cross-team syncs to align project delivery across verticals</li>
<li>Delivered consistent Agile sprint results and helped reduce release cycle time by 25%</li>
<li>Spearheaded a UI/UX modernization initiative that increased engagement and system adoption</li>
<li>Reduced post-deployment defects to &lt;2% through proactive testing, reusable component libraries, and dev mentorship</li>
</ul>
<p><strong>Senior Technology Consultant</strong></p>
<p><strong>Ernst &amp; Young (Pune, Maharashtra)</strong></p>
<p>Oct 2021 - Dec 2022</p>
<p>Led UX transformation and enterprise-grade frontend development using React and configurable HTML templates, enabling scalable, high-performance financial applications and improving developer velocity.</p>
<ul>
<li>Engineered a reusable HTML template system using React &amp; HTML5, reducing frontend development effort by 60%</li>
<li>Standardized UI best practices across teams, resulting in a 30% decrease in bugs and faster release cycles</li>
<li>Led UX design optimization efforts, increasing end-user engagement by 25%</li>
<li>Created developer-friendly documentation that improved onboarding speed by 40%</li>
<li>Partnered directly with clients and product managers to gather requirements</li>
</ul>
<p><strong>Senior Software Developer</strong></p>
<p><strong>One Network Enterprises</strong></p>
<p>Sep 2020 - Sep 2021</p>
<p>Led end-to-end UX implementation and frontend architecture using ReactJS, while mentoring the development team</p>
<ul>
<li>Managed complete development lifecycle from UX planning to deployment</li>
<li>Designed enterprise-grade UX mockups and visual flows, resulting in a 30% increase in user task completion rate</li>
<li>Delivered data-intensive visual dashboards using ReactJS and D3</li>
<li>Developed scalable ReactJS components with reusable architecture, improving dev efficiency and reducing rework by 40%</li>
<li>Proposed and implemented UX enhancements that reduced support queries by 25%</li>
</ul>
<p><strong>Lead UI Developer</strong></p>
<p><strong>Infosys Ltd</strong></p>
<p>Jul 2014 - Aug 2020</p>
<p>Led frontend development and architectural decisions for FINACLE UI, while mentoring a 9-member team</p>
<ul>
<li>Directed the end-to-end UI development for FINACLE, Infosys' flagship banking solution</li>
<li>Authored solution design and implementation documents for one-pager UI framework</li>
<li>Collaborated with Product Owners to translate evolving business needs into refined UI/UX workflows</li>
<li>Oversaw frontend component development using PolymerJS, JavaScript, and HTML5</li>
<li>Managed functional requirement breakdowns and assigned tasks to a 9-member frontend engineering team</li>
<li>Provided mentorship and hands-on training in PolymerJS, resulting in 40% improvement in code quality</li>
<li>Implemented standardized code review protocols, reducing UI defect leakage by 35%</li>
</ul>
<p><strong>Technical Skills</strong></p>
<p>HTML5, CSS3, JavaScript, ReactJS, Redux, NodeJS, MongoDB, Polymer JS, Mobx, NextJS, Python, Flutter</p>
<p><strong>Soft Skills</strong></p>
<p>Communication, Teamwork, Leadership, Problem-solving</p>
<p><strong>Education</strong></p>
<p><strong>B.E: Telecommunication Engineering</strong></p>
<p>Siddaganga Institute, Tumkur, KA</p>
<p>Jan 2010 - Jun 2014</p>
<p><strong>Associate of Science: Science</strong></p>
<p>A.N.S.M College, Aurangabad, BR</p>
<p>Jan 2007 - May 2010</p>
<p><strong>High School Diploma</strong></p>
<p>D.A.V Public School, Patna</p>
<p>Apr 2006 - Apr 2007</p>
<p><strong>Achievements</strong></p>
<p>Spearheaded the Speedboat Project with a 9-member team, delivering the MVP 2 weeks ahead of schedule</p>
<p>Received the prestigious 'Rising Star' award twice for consistently delivering high-impact IT solutions</p>
<p><strong>Languages</strong></p>
<p>English, Hindi</p>
<p><strong>Hobbies</strong></p>
<p>Competitive chess playing, demonstrating strategic thinking and problem-solving skills.</p>
`;

console.log('=== Step 1: mammoth HTML → Structured Text ===');
const structuredText = convertDocxHtmlToStructuredText(mammothHtml);
console.log(structuredText);

console.log('\n=== Step 2: normalizeUploadText ===');
const normalized = normalizeUploadText(structuredText);

console.log('\n=== Step 3: parseResumeText + mapParsedResume ===');
const parsed = parseResumeText(normalized);
const result = mapParsedResume(parsed);

console.log('Sections:', Object.keys(parsed.sections));
Object.entries(parsed.sections).forEach(([k, v]) => {
  console.log(`  ${k}: ${v.length} lines`);
});

console.log('\nContact:', JSON.stringify(result.contact, null, 2));
console.log('Title:', result.title);
console.log('Summary:', (result.summary || '').substring(0, 120) + '...');
console.log('Skills (' + result.skills.length + '):', result.skills);
console.log('\nExperience (' + result.experience.length + '):');
result.experience.forEach(e => console.log(`  ${e.role} @ ${e.company} (${e.startDate} - ${e.endDate}) [${e.highlights.length} hl]`));
console.log('\nEducation (' + result.education.length + '):');
result.education.forEach(e => console.log(`  ${e.degree} @ ${e.institution} (${e.startDate} - ${e.endDate})`));
console.log('RoleLevel:', result.roleLevel);

// Validation
const errors = [];
if (result.contact.fullName !== 'CHANDAN KUMAR' && result.contact.fullName !== 'Chandan Kumar') errors.push(`Bad name: ${result.contact.fullName}`);
if (!result.contact.email) errors.push('MISSING: email');
if (!result.contact.phone) errors.push('MISSING: phone');
if (result.experience.length < 4) errors.push(`TOO FEW experiences: ${result.experience.length}`);
if (result.experience.length > 5) errors.push(`TOO MANY experiences: ${result.experience.length}`);
if (result.education.length < 3) errors.push(`TOO FEW education: ${result.education.length}`);
if (result.education.length > 4) errors.push(`TOO MANY education: ${result.education.length}`);
result.experience.forEach(e => {
  if (/gmail|email|mobile|full stack engineering/i.test(e.company)) errors.push(`GARBAGE company: ${e.company}`);
  if (!e.startDate) errors.push(`Missing startDate for ${e.role}`);
});
const hasReact = result.skills.some(s => /react/i.test(s));
if (!hasReact) errors.push('Missing ReactJS in skills');

if (errors.length) {
  console.log('\n*** ERRORS ***');
  errors.forEach(e => console.log(`  - ${e}`));
  process.exit(1);
} else {
  console.log('\n*** ALL CHECKS PASSED ***');
}
