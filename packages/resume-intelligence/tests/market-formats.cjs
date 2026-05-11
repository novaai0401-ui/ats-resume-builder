// Market-sweep regression suite: synthetic resumes representing common
// templates / exports seen in the wild (LinkedIn PDF, Indeed builder,
// Naukri, MS Word "Modern", Canva two-column, LaTeX Awesome-CV, etc.).
// Each fixture exercises a different shape that pdf-parse or mammoth tends
// to produce. Any failure means the extractor regressed on a format that
// was previously verified to work.
const assert = require('node:assert/strict');
const intel = require('../dist/index.js');

const FIXTURES = [
  {
    id: 'linkedin-export',
    description: 'LinkedIn PDF export — Role @ Company, Dates on next line',
    expectedCount: 3,
    expectedCompanies: ['acme', 'globex', 'initech'],
    text: `Jane Doe
Senior Software Engineer at Acme Corporation
San Francisco, CA · 500+ connections

Contact
www.linkedin.com/in/janedoe
jane@example.com

About
Backend engineer with 8+ years of experience building distributed systems.

Experience
Senior Software Engineer
Acme Corporation
Jan 2022 - Present · 2 yrs 5 mos
San Francisco, CA
- Led platform team of 6 engineers.
- Migrated monolith to microservices.

Staff Engineer
Globex
Mar 2019 - Dec 2021 · 2 yrs 10 mos
Remote
- Built billing platform serving 5M users.

Backend Engineer
Initech
Aug 2016 - Feb 2019 · 2 yrs 7 mos
- Owned payment processing service.

Education
Stanford University
M.S., Computer Science, 2014 - 2016

Skills
Python · Go · Kubernetes · Postgres
`,
  },

  {
    id: 'indeed-builder',
    description: 'Indeed Resume Builder — "Role | Company | City, ST" style',
    expectedCount: 2,
    expectedCompanies: ['rocketship', 'fintech'],
    text: `Sam Patel
sam.patel@example.com | (555) 123-4567 | Austin, TX

Professional Summary
Frontend engineer focused on accessibility and performance.

Work Experience
Senior Frontend Engineer | Rocketship Inc | Austin, TX
05/2021 to Present
- Shipped redesign that improved Lighthouse score from 56 to 94.
- Established the design-system contribution model.

Frontend Engineer | FinTech Co | Remote
01/2018 to 04/2021
- Built React component library used by 12 product teams.
- Reduced bundle size by 38% via code splitting.

Skills
React, TypeScript, Webpack, Jest, Cypress

Education
B.S. Computer Science, University of Texas at Austin, 2017
`,
  },

  {
    id: 'naukri-india',
    description: 'Naukri.com India — caps headings, role-dash-company',
    expectedCount: 3,
    expectedCompanies: ['tcs', 'wipro', 'infosys'],
    text: `RAHUL SHARMA
rahul.sharma@example.com | +91 98765 43210 | Bangalore

CAREER OBJECTIVE
Seeking a senior backend role focusing on cloud-native systems.

WORK EXPERIENCE

Senior Software Engineer - TCS
07/2021 - Present
Bangalore, KA
- Architected microservices migration for banking client.
- Led team of 8 engineers across two timezones.

Software Engineer - Wipro
06/2018 - 06/2021
Pune, MH
- Built Spring Boot APIs serving 200k QPS.
- Implemented Kafka-based event streaming.

Associate Engineer - Infosys
07/2016 - 05/2018
Mysuru, KA
- Delivered modules for retail banking product.

EDUCATION
B.E., Computer Science, RV College of Engineering, 2016
`,
  },

  {
    id: 'ms-word-modern',
    description: 'MS Word "Modern" template — italic dates, role on same line as company via comma',
    expectedCount: 2,
    expectedCompanies: ['contoso', 'fabrikam'],
    text: `Alex Kim
alex@example.com  |  555-555-0123

EXPERIENCE

PRODUCT MANAGER, Contoso
March 2020 – Present
- Launched 4 products generating $12M ARR.
- Drove pricing experiments across 18 markets.

SENIOR PRODUCT MANAGER, Fabrikam
June 2017 – February 2020
- Owned consumer mobile app with 8M MAU.

EDUCATION
MBA, Harvard Business School, 2017
`,
  },

  {
    id: 'canva-two-column',
    description: 'Canva creative two-column — headings styled differently, dates right-aligned with em-dash',
    expectedCount: 2,
    expectedCompanies: ['pixel', 'monolith'],
    text: `Priya Nair
priya@example.com
+44 7700 900123
London, UK

PROFILE
Designer-developer hybrid passionate about motion.

EMPLOYMENT

UX Engineer  —  Pixel Studio
May 2021 – Present
- Built design tokens pipeline integrated with Figma.

Front-End Developer  —  Monolith Co.
Aug 2018 – April 2021
- Migrated jQuery codebase to React.

SKILLS
Figma, React, Three.js, GLSL, Motion design

EDUCATION
BA Interactive Media, Goldsmiths, 2018
`,
  },

  {
    id: 'latex-awesome-cv',
    description: 'LaTeX Awesome-CV style — section markers, dates in italics, role pipe location',
    expectedCount: 3,
    expectedCompanies: ['google', 'meta', 'startup'],
    text: `Dr. Maya Chen
maya.chen@example.com · maya.dev · github.com/mayachen

EXPERIENCE
Google | Mountain View, CA
Staff Research Engineer
July 2020 - Present
- Led PaLM serving infra serving 100k QPS.
- Authored 4 papers on LLM efficiency.

Meta | Menlo Park, CA
Senior Research Engineer
March 2017 - June 2020
- Built distributed training framework adopted by 12 teams.

Quantum Startup | Berkeley, CA
Founding Engineer
Aug 2015 - February 2017
- First engineer; built initial ML platform.

EDUCATION
Stanford University
Ph.D., Computer Science | 2015
`,
  },

  {
    id: 'functional-resume',
    description: 'Functional resume — skills-first, employment history at the bottom in compact form',
    expectedCount: 3,
    expectedCompanies: ['alpha', 'beta', 'gamma'],
    text: `Jordan Lee
jordan@example.com  |  555-0145

PROFESSIONAL SUMMARY
Versatile engineer with strengths in mentoring and platform building.

CORE COMPETENCIES
- Team leadership
- Distributed systems
- Customer empathy

KEY ACHIEVEMENTS
- Reduced infra costs by 47% across two organizations.
- Mentored 14 engineers into staff-level roles.

EMPLOYMENT HISTORY
Alpha Industries, Senior Engineer, 2020 - Present
Beta Labs, Software Engineer, 2017 - 2020
Gamma Co., Junior Engineer, 2015 - 2017

EDUCATION
MIT, B.S. Computer Science, 2015
`,
  },

  {
    id: 'right-aligned-tabbed-dates',
    description: 'Right-aligned dates via multiple spaces (PDF rendering), role then company',
    expectedCount: 2,
    expectedCompanies: ['novacorp', 'apex'],
    text: `Casey Brown
casey@example.com

Work Experience

Senior DevOps Engineer                                 Jan 2022 - Present
NovaCorp Holdings, Seattle, WA
- Designed Kubernetes platform handling 800 microservices.
- Slashed incident response time by 65%.

Site Reliability Engineer                              Feb 2019 - Dec 2021
Apex Systems, Seattle, WA
- Maintained 99.99% uptime across 30 services.
- Implemented chaos engineering practice.

Skills
AWS, Terraform, Kubernetes, Prometheus
`,
  },

  {
    id: 'em-dash-role-company-date',
    description: 'Em-dash separators throughout: "Role — Company — Dates"',
    expectedCount: 2,
    expectedCompanies: ['cipher', 'helix'],
    text: `Riley Park
riley@example.com

EXPERIENCE
Engineering Manager — Cipher Labs — Jan 2022 – Present
- Manage 15 engineers across 3 squads.
- Owned platform OKRs across two quarters.

Lead Engineer — Helix Bio — Mar 2019 – Dec 2021
- Built genomics pipeline reducing analysis time 8x.
`,
  },

  {
    id: 'startup-founder-multi-role',
    description: 'Founder role with parenthesised secondary title; concurrent advisor',
    expectedCount: 2,
    expectedCompanies: ['nimbus', 'cohort'],
    text: `Taylor Quinn
taylor@example.com

WORK EXPERIENCE
Co-Founder & CTO
Nimbus AI (San Francisco, CA)
March 2022 - Present
- Built and scaled the engineering team from 0 to 24.
- Architected the core training infrastructure.

Director of Engineering
Cohort, Inc. (Remote)
April 2018 - February 2022
- Led 35-person engineering org spanning four time zones.
`,
  },

  {
    id: 'icon-bullets',
    description: 'Non-standard bullet characters: ▪, ▸, ►, ●',
    expectedCount: 1,
    expectedCompanies: ['stellar'],
    text: `Morgan Rivers
morgan@example.com

Experience

Senior Engineer
Stellar Systems | 2020 - Present
▪ Designed event-driven architecture using Kafka.
▸ Cut p99 latency from 1.2s to 230ms.
► Authored RFCs adopted by 9 teams.
● Mentored 6 mid-level engineers into senior roles.
`,
  },

  {
    id: 'role-on-same-line-as-date-pipe',
    description: '"Role | Date" with company on previous line — already worked but tested with new prose-like description',
    expectedCount: 2,
    expectedCompanies: ['vector', 'matrix'],
    text: `Chris Lee
chris@example.com

WORK EXPERIENCE
Vector Robotics
Senior Robotics Engineer | Jan 2022 - Present
Spearheaded autonomous navigation stack delivering safer worksites.
- Designed SLAM pipeline running at 200Hz on edge hardware.
- Authored safety case accepted by certification bodies.

Matrix Mobility
Robotics Engineer | June 2018 - December 2021
Built sensor-fusion stack for indoor robots.
- Reduced calibration time by 40% via auto-tuning.
`,
  },

  {
    id: 'iso-dates',
    description: 'ISO YYYY-MM dates throughout',
    expectedCount: 2,
    expectedCompanies: ['atlas', 'beacon'],
    text: `Devon Chen
devon@example.com

Work Experience

Atlas Logistics
Lead Engineer
2022-03 - Present
- Built routing engine handling 4M shipments/day.

Beacon Health
Senior Engineer
2019-01 - 2022-02
- Owned patient-data pipeline.
`,
  },

  {
    id: 'colon-suffixed-headings',
    description: 'Section headings end with colon: "Experience:", "Education:"',
    expectedCount: 2,
    expectedCompanies: ['orbital', 'helios'],
    text: `Pat Singh
pat@example.com

Experience:

Senior Engineer
Orbital Dynamics
2021 - Present
- Built physics simulation pipeline for satellite operators.

Engineer
Helios Solar
2018 - 2021
- Optimised inverter firmware reducing energy loss 12%.

Education:
B.Tech ECE, IIT Bombay, 2018
`,
  },

  {
    id: 'concise-one-line-entries',
    description: 'Very compact entries — single line "Role, Company, Dates"',
    expectedCount: 3,
    expectedCompanies: ['parallax', 'tessera', 'lithos'],
    text: `Avery Holt
avery@example.com

PROFESSIONAL EXPERIENCE
Software Engineer, Parallax Labs, Jan 2022 - Present
Software Engineer, Tessera Inc, Feb 2019 - Dec 2021
Junior Software Engineer, Lithos Software, Aug 2017 - Jan 2019

EDUCATION
B.Sc. Computer Science, Georgia Tech, 2017
`,
  },

  {
    id: 'role-at-company-pattern',
    description: 'Bare "Role at Company" without pipes/dashes',
    expectedCount: 2,
    expectedCompanies: ['lumen', 'astro'],
    text: `Skyler Wong
skyler@example.com

Experience
Software Engineer at Lumen Networks
2020 - Present
- Built backend services in Go.

Software Engineer at Astro Corp
2017 - 2020
- Owned client SDK in Python.
`,
  },

  {
    id: 'concurrent-roles-same-company',
    description: 'Multiple roles under one company (promotions)',
    expectedCount: 2,
    expectedCompanies: ['zenith'],
    text: `Quinn Adams
quinn@example.com

Work Experience

Zenith Aerospace
Principal Engineer
March 2022 - Present
- Lead architect for next-gen flight control system.

Senior Engineer
Jan 2019 - February 2022
- Owned hardware-in-the-loop simulator.
`,
  },

  {
    id: 'date-then-role-company',
    description: 'Date on top line, then Role @ Company',
    expectedCount: 2,
    expectedCompanies: ['nimbus', 'cipher'],
    text: `Logan Park
logan@example.com

EXPERIENCE
2022 - Present
Engineering Manager @ Nimbus Cloud
- Manage 4 squads delivering platform services.

2019 - 2022
Senior Engineer @ Cipher Defense
- Built secure messaging system used by 2M users.
`,
  },
];

for (const fixture of FIXTURES) {
  const parsed = intel.parseResumeText(intel.normalizeText(fixture.text));
  const mapped = intel.mapParsedResume(parsed);
  const exp = mapped.experience || [];
  const cs = exp.map((e) => (e.company || '').toLowerCase());

  assert.equal(
    exp.length,
    fixture.expectedCount,
    `[${fixture.id}] expected ${fixture.expectedCount} entries, got ${exp.length} — ${fixture.description}`,
  );

  for (const needle of fixture.expectedCompanies) {
    assert.ok(
      cs.some((c) => c.includes(needle)),
      `[${fixture.id}] missing company "${needle}"; got ${JSON.stringify(cs)}`,
    );
  }

  for (const entry of exp) {
    assert.ok(
      (entry.role || '').trim().length > 0,
      `[${fixture.id}] empty role on entry: ${JSON.stringify(entry)}`,
    );
    assert.ok(
      (entry.company || '').trim().length > 0,
      `[${fixture.id}] empty company on entry: ${JSON.stringify(entry)}`,
    );
  }
}

console.log(`market-format tests passed (${FIXTURES.length} layouts)`);
