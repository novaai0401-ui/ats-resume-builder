import type { ResumeImportResult } from 'resume-builder-shared';

/**
 * Profession-specific sample resumes used by the dashboard preview when the
 * user hasn't selected a saved resume yet. Having a doctor's preview show
 * "Senior Frontend Engineer" with TypeScript/React was the single biggest
 * "this app wasn't built for me" signal a non-IT user hit.
 *
 * For each industry id listed in resume-builder-shared's
 * PROFESSION_INDUSTRIES catalog we provide a realistic sample. Industries
 * without an entry fall back to the generic "professional" sample — still
 * better than showing a frontend engineer resume. When you expand this, keep
 * the sample shape identical to the previous IT sample so downstream
 * rendering stays unchanged.
 */

const itSample: ResumeImportResult = {
  title: 'Aarav Mehta - Senior Frontend Engineer',
  contact: {
    fullName: 'Aarav Mehta',
    email: 'aarav.mehta@example.com',
    phone: '+91 98765 43210',
    location: 'Bengaluru, India',
    links: ['linkedin.com/in/aaravmehta', 'github.com/aaravmehta'],
  },
  summary:
    'Senior Frontend Engineer with 8+ years building high-performance web applications and design systems used by distributed product teams.',
  skills: ['TypeScript', 'React', 'Next.js', 'Accessibility', 'Performance Optimization', 'Testing', 'Node.js', 'GraphQL'],
  technicalSkills: ['TypeScript', 'React', 'Next.js', 'Node.js', 'GraphQL', 'Jest', 'Playwright'],
  softSkills: ['Mentoring', 'Cross-functional Collaboration', 'Product Thinking'],
  languages: ['English', 'Hindi'],
  experience: [
    {
      company: 'Nimbus Labs', role: 'Senior Frontend Engineer',
      startDate: '2021-04', endDate: 'Present',
      highlights: [
        'Built a reusable UI platform that reduced feature delivery time by 35%.',
        'Improved Core Web Vitals across customer dashboards and lifted conversion by 14%.',
        'Led migration to TypeScript and standardized testing practices for 20+ engineers.',
      ],
    },
    {
      company: 'BlueOrbit Technologies', role: 'Frontend Engineer',
      startDate: '2017-01', endDate: '2021-03',
      highlights: [
        'Developed modular React interfaces for enterprise reporting and analytics workflows.',
        'Implemented accessibility fixes to meet WCAG AA compliance across product surfaces.',
        'Partnered with product and design to launch template-based onboarding experiences.',
      ],
    },
  ],
  education: [{
    institution: 'National Institute of Technology',
    degree: 'B.Tech in Computer Science',
    startDate: '2012-07', endDate: '2016-05',
    details: ['Focused on software engineering, distributed systems, and web technologies.'],
  }],
  projects: [{
    name: 'Resume Signal Analyzer', role: 'Creator',
    startDate: '2024-02', endDate: '2024-09',
    highlights: [
      'Created a parser pipeline for extracting structured resume signals from uploaded documents.',
      'Implemented scoring explanations to guide users on ATS-improving edits.',
    ],
  }],
  certifications: [{ name: 'Google Professional Cloud Developer', issuer: 'Google Cloud', date: '2023-08' }],
};

const healthcareSample: ResumeImportResult = {
  title: 'Dr. Ananya Iyer - Consultant Physician',
  contact: {
    fullName: 'Dr. Ananya Iyer',
    email: 'ananya.iyer@example.com',
    phone: '+91 98200 43120',
    location: 'Mumbai, India',
    links: ['linkedin.com/in/dr-ananya-iyer'],
  },
  summary:
    'MBBS, MD (Internal Medicine) with 9+ years of experience in tertiary-care hospitals across inpatient care, critical-care management, and clinical teaching.',
  skills: [
    'Patient Assessment', 'Clinical Diagnosis', 'Critical Care', 'Electronic Medical Records (EMR)',
    'Infection Control', 'Chronic Disease Management', 'Emergency Stabilisation', 'Clinical Documentation',
  ],
  technicalSkills: ['EMR Systems', 'ACLS Protocols', 'Point-of-Care Ultrasound', 'Ventilator Management'],
  softSkills: ['Patient Counselling', 'Team Leadership', 'Case Presentation', 'Empathy'],
  languages: ['English', 'Hindi', 'Marathi'],
  experience: [
    {
      company: 'Kokilaben Dhirubhai Ambani Hospital', role: 'Consultant Physician, Internal Medicine',
      startDate: '2021-06', endDate: 'Present',
      highlights: [
        'Managed average daily caseload of 35+ inpatients across general wards and HDU.',
        'Led infection-control audit that reduced hospital-acquired infection rate by 22% over 18 months.',
        'Mentored 12 junior residents and presented 6 grand-round cases to departmental faculty.',
      ],
    },
    {
      company: 'AIIMS Delhi', role: 'Senior Resident, Internal Medicine',
      startDate: '2018-07', endDate: '2021-05',
      highlights: [
        'Handled 200+ emergency admissions per month; led ICU handovers and bedside rounds.',
        'Co-authored a peer-reviewed paper on sepsis management in resource-limited settings.',
      ],
    },
  ],
  education: [
    { institution: 'AIIMS Delhi', degree: 'MD (Internal Medicine)', startDate: '2015-08', endDate: '2018-06', details: ['Thesis on early sepsis biomarkers.'] },
    { institution: 'Grant Medical College, Mumbai', degree: 'MBBS', startDate: '2009-08', endDate: '2015-07' },
  ],
  projects: [],
  certifications: [
    { name: 'Advanced Cardiac Life Support (ACLS)', issuer: 'American Heart Association', date: '2023-05' },
    { name: 'Basic Life Support (BLS) Instructor', issuer: 'Indian Society of Anaesthesiologists', date: '2022-10' },
  ],
};

const engineeringSample: ResumeImportResult = {
  title: 'Rohit Deshmukh - Senior Mechanical Design Engineer',
  contact: {
    fullName: 'Rohit Deshmukh',
    email: 'rohit.deshmukh@example.com',
    phone: '+91 98403 72650',
    location: 'Pune, India',
    links: ['linkedin.com/in/rohit-deshmukh-me'],
  },
  summary:
    'Senior Mechanical Design Engineer with 10+ years in automotive and heavy-industry design, product validation, and supplier qualification.',
  skills: [
    'SolidWorks', 'CATIA V5', 'ANSYS', 'GD&T', 'Failure Mode & Effects Analysis (FMEA)',
    'Design for Manufacturing (DFM)', 'Root-Cause Analysis', 'Supplier Quality',
  ],
  technicalSkills: ['SolidWorks', 'CATIA V5', 'ANSYS Mechanical', 'AutoCAD', 'MATLAB'],
  softSkills: ['Cross-functional Project Management', 'Supplier Negotiation', 'Technical Writing'],
  languages: ['English', 'Hindi', 'Marathi'],
  experience: [
    {
      company: 'Tata Motors', role: 'Senior Design Engineer, Powertrain',
      startDate: '2020-03', endDate: 'Present',
      highlights: [
        'Led redesign of transmission housing that cut manufacturing cost by 12% per unit.',
        'Drove FMEA reviews across 3 product lines, closing 40+ high-severity risks before release.',
        'Qualified 4 new tier-2 suppliers and reduced single-source dependency by 35%.',
      ],
    },
    {
      company: 'Bajaj Auto', role: 'Design Engineer',
      startDate: '2014-07', endDate: '2020-02',
      highlights: [
        'Delivered CAD models and GD&T drawings for 9 production sub-assemblies on 2 flagship models.',
        'Reduced prototype-to-validation cycle by 20% through standardised DFM checklists.',
      ],
    },
  ],
  education: [
    { institution: 'College of Engineering, Pune', degree: 'B.E. Mechanical Engineering', startDate: '2010-07', endDate: '2014-06' },
  ],
  projects: [],
  certifications: [{ name: 'Six Sigma Green Belt', issuer: 'ASQ', date: '2022-04' }],
};

const financeSample: ResumeImportResult = {
  title: 'Priya Kapoor - Senior Financial Analyst',
  contact: {
    fullName: 'Priya Kapoor',
    email: 'priya.kapoor@example.com',
    phone: '+91 99803 22145',
    location: 'Gurgaon, India',
    links: ['linkedin.com/in/priya-kapoor-finance'],
  },
  summary:
    'CA & MBA-qualified Senior Financial Analyst with 7+ years across corporate finance, FP&A, and buy-side equity research in financial-services firms.',
  skills: [
    'Financial Modelling', 'Valuation (DCF / Comparable / Precedent)', 'Variance Analysis', 'Budgeting & Forecasting',
    'SQL', 'Advanced Excel', 'Power BI', 'IFRS & Ind AS',
  ],
  technicalSkills: ['Advanced Excel', 'Power BI', 'SQL', 'Bloomberg Terminal', 'Tally ERP'],
  softSkills: ['Stakeholder Communication', 'Executive Reporting', 'Cross-team Coordination'],
  languages: ['English', 'Hindi'],
  experience: [
    {
      company: 'HDFC Bank', role: 'Senior Financial Analyst, FP&A',
      startDate: '2021-08', endDate: 'Present',
      highlights: [
        'Owned the monthly P&L close for a 1,800 Cr business line and reduced close cycle from 9 to 5 business days.',
        'Built rolling 18-month forecast model adopted as board-level reporting standard.',
        'Surfaced 42 Cr of annualised cost savings through spend-category deep-dives.',
      ],
    },
    {
      company: 'ICICI Securities', role: 'Equity Research Associate',
      startDate: '2017-06', endDate: '2021-07',
      highlights: [
        'Covered 14 listed mid-cap companies across BFSI and consumer-staples sectors.',
        'Published quarterly results notes within 4 hours of earnings release for institutional clients.',
      ],
    },
  ],
  education: [
    { institution: 'IIM Lucknow', degree: 'MBA (Finance)', startDate: '2015-06', endDate: '2017-04' },
    { institution: 'Institute of Chartered Accountants of India', degree: 'Chartered Accountant', startDate: '2011-05', endDate: '2015-05' },
  ],
  projects: [],
  certifications: [{ name: 'CFA Level II', issuer: 'CFA Institute', date: '2020-08' }],
};

const legalSample: ResumeImportResult = {
  title: 'Vikram Nair - Senior Associate, Corporate Law',
  contact: {
    fullName: 'Vikram Nair',
    email: 'vikram.nair@example.com',
    phone: '+91 98190 55431',
    location: 'New Delhi, India',
    links: ['linkedin.com/in/vikram-nair-law'],
  },
  summary:
    'Senior Associate with 8 years of corporate and M&A practice across private-equity, cross-border transactions, and regulatory compliance.',
  skills: [
    'Contract Drafting & Negotiation', 'Due Diligence', 'M&A Transactions', 'Corporate Governance',
    'Regulatory Compliance (SEBI / RBI / FEMA)', 'Legal Research', 'Dispute Resolution',
  ],
  technicalSkills: ['Manupatra', 'SCC Online', 'Westlaw India', 'Microsoft 365'],
  softSkills: ['Client Advisory', 'Negotiation', 'Written Advocacy', 'Mentorship'],
  languages: ['English', 'Hindi', 'Malayalam'],
  experience: [
    {
      company: 'Cyril Amarchand Mangaldas', role: 'Senior Associate, Corporate',
      startDate: '2021-09', endDate: 'Present',
      highlights: [
        'Led due-diligence workstreams on 6 PE transactions with aggregate deal value above 3,200 Cr.',
        'Drafted and negotiated shareholders agreements and SPAs for cross-border acquisitions.',
        'Advised a listed FMCG client on SEBI takeover-code compliance for a strategic stake sale.',
      ],
    },
    {
      company: 'Khaitan & Co.', role: 'Associate',
      startDate: '2017-08', endDate: '2021-08',
      highlights: [
        'Drafted opinions on FEMA and FDI-policy questions for inbound investors.',
        'Represented clients before the NCLT in two insolvency resolution proceedings.',
      ],
    },
  ],
  education: [
    { institution: 'National Law School of India University, Bangalore', degree: 'B.A. LL.B (Hons.)', startDate: '2012-07', endDate: '2017-05' },
  ],
  projects: [],
  certifications: [{ name: 'Enrolled Advocate, Bar Council of India', issuer: 'Bar Council of Delhi', date: '2017-09' }],
};

const educationSample: ResumeImportResult = {
  title: 'Meera Krishnan - High School Mathematics Teacher',
  contact: {
    fullName: 'Meera Krishnan',
    email: 'meera.krishnan@example.com',
    phone: '+91 90427 18855',
    location: 'Chennai, India',
    links: ['linkedin.com/in/meera-krishnan-edu'],
  },
  summary:
    'CBSE-certified Mathematics teacher with 11+ years of classroom experience, curriculum design, and demonstrable student outcomes across Grades 9-12.',
  skills: [
    'Curriculum Design', 'Lesson Planning', 'Differentiated Instruction', 'Formative Assessment',
    'Classroom Management', 'Educational Technology Integration', 'Parent Communication', 'Academic Mentoring',
  ],
  technicalSkills: ['GeoGebra', 'Google Classroom', 'Desmos', 'Interactive Whiteboard'],
  softSkills: ['Patience', 'Empathy', 'Conflict Resolution', 'Collaboration'],
  languages: ['English', 'Tamil', 'Hindi'],
  experience: [
    {
      company: 'DAV Public School, Chennai', role: 'Senior Mathematics Teacher, Grades 11-12',
      startDate: '2019-06', endDate: 'Present',
      highlights: [
        'Led 3 sections of Grade 12 Mathematics with a 97% pass rate and 62% distinction rate in CBSE boards.',
        'Designed a remedial-learning framework that lifted Grade 10 foundation scores by 18 percentile points.',
        'Coordinated annual school-level Mathematics Olympiad; 14 students qualified for regional rounds.',
      ],
    },
    {
      company: 'Chettinad Vidyashram', role: 'Mathematics Teacher, Grades 9-10',
      startDate: '2013-06', endDate: '2019-05',
      highlights: [
        'Taught 5 sections across Grades 9 and 10 with a cumulative pass rate of 98%.',
        'Co-created digital lesson packs adopted across the Mathematics department.',
      ],
    },
  ],
  education: [
    { institution: 'Regional Institute of Education, Mysore', degree: 'M.Ed.', startDate: '2011-08', endDate: '2013-05' },
    { institution: 'University of Madras', degree: 'M.Sc. Mathematics', startDate: '2009-08', endDate: '2011-05' },
  ],
  projects: [],
  certifications: [{ name: 'CBSE Centre of Excellence — Mentor Teacher', issuer: 'CBSE', date: '2022-11' }],
};

const salesSample: ResumeImportResult = {
  title: 'Karan Malhotra - Regional Sales Manager',
  contact: {
    fullName: 'Karan Malhotra',
    email: 'karan.malhotra@example.com',
    phone: '+91 98995 44120',
    location: 'Gurgaon, India',
    links: ['linkedin.com/in/karan-malhotra-sales'],
  },
  summary:
    'Regional Sales Manager with 10+ years in B2B and channel sales, consistently exceeding quota across FMCG and consumer-electronics verticals.',
  skills: [
    'B2B Sales', 'Channel Management', 'Account Management', 'Territory Planning',
    'Pricing Strategy', 'Forecasting', 'CRM (Salesforce / Zoho)', 'Negotiation',
  ],
  technicalSkills: ['Salesforce', 'Zoho CRM', 'Microsoft Power BI', 'Advanced Excel'],
  softSkills: ['Customer Relationship', 'Team Leadership', 'Presentation', 'Conflict Resolution'],
  languages: ['English', 'Hindi', 'Punjabi'],
  experience: [
    {
      company: 'Samsung India', role: 'Regional Sales Manager, North',
      startDate: '2020-01', endDate: 'Present',
      highlights: [
        'Led a 22-person sales team covering Delhi NCR; delivered 118% of revenue target in FY24.',
        'Onboarded 40+ new channel partners and increased active dealer coverage by 31%.',
        'Turned around an underperforming cluster, lifting quarterly growth from -6% to +14% YoY.',
      ],
    },
    {
      company: 'Hindustan Unilever', role: 'Area Sales Manager',
      startDate: '2014-05', endDate: '2019-12',
      highlights: [
        'Managed 180 Cr territory across 11 distributors; consistently in top 3 by quota attainment.',
        'Launched a rural-outreach pilot that added 2,300 net new retail outlets in 9 months.',
      ],
    },
  ],
  education: [
    { institution: 'MDI Gurgaon', degree: 'MBA (Marketing)', startDate: '2012-06', endDate: '2014-04' },
    { institution: 'SRCC, University of Delhi', degree: 'B.Com (Hons.)', startDate: '2008-07', endDate: '2011-05' },
  ],
  projects: [],
  certifications: [{ name: 'HubSpot Sales Software Certification', issuer: 'HubSpot Academy', date: '2023-02' }],
};

const businessSample: ResumeImportResult = {
  title: 'Neha Agarwal - Senior Business Operations Manager',
  contact: {
    fullName: 'Neha Agarwal',
    email: 'neha.agarwal@example.com',
    phone: '+91 88809 61120',
    location: 'Bengaluru, India',
    links: ['linkedin.com/in/neha-agarwal-ops'],
  },
  summary:
    'Business Operations Manager with 9+ years in process design, cross-functional program management, and post-merger integration at high-growth companies.',
  skills: [
    'Program Management', 'Process Improvement', 'Stakeholder Management', 'Business Case Development',
    'Change Management', 'Vendor Governance', 'OKR Planning', 'KPI Reporting',
  ],
  technicalSkills: ['Jira', 'Confluence', 'Tableau', 'Looker', 'Advanced Excel'],
  softSkills: ['Executive Communication', 'Facilitation', 'Strategic Thinking', 'Coaching'],
  languages: ['English', 'Hindi'],
  experience: [
    {
      company: 'Flipkart', role: 'Senior Business Operations Manager',
      startDate: '2022-02', endDate: 'Present',
      highlights: [
        'Drove a seller-onboarding overhaul that cut time-to-first-sale from 11 days to 3.',
        'Stood up the quarterly OKR rhythm for a 600-person business unit and improved goal-completion from 64% to 82%.',
        'Led post-acquisition integration of a logistics subsidiary across 4 functional workstreams.',
      ],
    },
    {
      company: 'Bain & Company', role: 'Senior Associate Consultant',
      startDate: '2016-08', endDate: '2022-01',
      highlights: [
        'Delivered 9 strategy engagements for BFSI and consumer clients across India and Southeast Asia.',
        'Built diagnostic toolkits reused across 20+ engagements by the practice.',
      ],
    },
  ],
  education: [
    { institution: 'IIM Ahmedabad', degree: 'PGP (Management)', startDate: '2014-07', endDate: '2016-04' },
    { institution: 'IIT Delhi', degree: 'B.Tech. Electrical Engineering', startDate: '2008-07', endDate: '2012-06' },
  ],
  projects: [],
  certifications: [{ name: 'PMP', issuer: 'Project Management Institute', date: '2023-03' }],
};

const creativeSample: ResumeImportResult = {
  title: 'Sara Pinto - Senior Product Designer',
  contact: {
    fullName: 'Sara Pinto',
    email: 'sara.pinto@example.com',
    phone: '+91 98765 11240',
    location: 'Bengaluru, India',
    links: ['linkedin.com/in/sara-pinto-design', 'sarapinto.design', 'dribbble.com/sarapinto'],
  },
  summary:
    'Senior Product Designer with 8+ years shipping consumer and SaaS products end-to-end — UX research, interaction design, and design-system stewardship.',
  skills: [
    'UX Research', 'Interaction Design', 'Design Systems', 'Wireframing', 'Prototyping',
    'Usability Testing', 'Information Architecture', 'Accessibility', 'Visual Design', 'Design Ops',
  ],
  technicalSkills: ['Figma', 'FigJam', 'Adobe XD', 'Adobe Illustrator', 'Adobe Photoshop', 'Principle', 'Maze'],
  softSkills: ['Cross-functional Collaboration', 'Design Critique', 'Stakeholder Communication', 'Mentoring'],
  languages: ['English', 'Hindi', 'Konkani'],
  experience: [
    {
      company: 'Swiggy', role: 'Senior Product Designer, Growth',
      startDate: '2021-04', endDate: 'Present',
      highlights: [
        'Led the redesign of the onboarding funnel; lifted day-1 activation by 18%.',
        'Stood up a 240-component design system used by 60+ designers and engineers.',
        'Ran 12 generative research studies that informed the FY24 roadmap.',
      ],
    },
    {
      company: 'Freshworks', role: 'Product Designer',
      startDate: '2017-01', endDate: '2021-03',
      highlights: [
        'Owned end-to-end design for 3 product surfaces in the customer-support suite.',
        'Partnered with engineering on accessibility upgrades to reach WCAG AA across the suite.',
      ],
    },
  ],
  education: [{
    institution: 'National Institute of Design, Ahmedabad',
    degree: 'M.Des. Interaction Design',
    startDate: '2014-07', endDate: '2016-05',
  }],
  projects: [],
  certifications: [{ name: 'Nielsen Norman Group UX Certification', issuer: 'NN/g', date: '2022-09' }],
};

const hrSample: ResumeImportResult = {
  title: 'Kavya Reddy - Senior HR Business Partner',
  contact: {
    fullName: 'Kavya Reddy',
    email: 'kavya.reddy@example.com',
    phone: '+91 98842 55119',
    location: 'Hyderabad, India',
    links: ['linkedin.com/in/kavya-reddy-hr'],
  },
  summary:
    'Senior HRBP with 9+ years partnering with engineering and product leaders on org design, performance management, and talent strategy at high-growth tech companies.',
  skills: [
    'HR Business Partnering', 'Org Design', 'Performance Management', 'Talent Reviews',
    'Employee Relations', 'Compensation Benchmarking', 'Workforce Planning', 'Change Management',
    'DEI Programs', 'HR Analytics',
  ],
  technicalSkills: ['Workday', 'BambooHR', 'Greenhouse', 'Lattice', 'Advanced Excel', 'Tableau'],
  softSkills: ['Coaching', 'Conflict Resolution', 'Executive Communication', 'Influence Without Authority'],
  languages: ['English', 'Telugu', 'Hindi'],
  experience: [
    {
      company: 'Razorpay', role: 'Senior HR Business Partner — Engineering',
      startDate: '2021-08', endDate: 'Present',
      highlights: [
        'Partnered with 6 engineering directors covering a 480-person org through 2 reorgs.',
        'Drove a calibration framework that lifted manager confidence in performance ratings from 58% to 84%.',
        'Reduced regrettable attrition in the platform org by 31% via structured stay interviews.',
      ],
    },
    {
      company: 'Infosys', role: 'HR Generalist',
      startDate: '2014-06', endDate: '2021-07',
      highlights: [
        'Owned HR operations for a 1,200-person delivery unit — onboarding, ER, and policy roll-outs.',
        'Led campus hiring across 8 colleges; converted 220 graduate offers in FY20.',
      ],
    },
  ],
  education: [
    { institution: 'XLRI Jamshedpur', degree: 'PGDM (Human Resources)', startDate: '2012-06', endDate: '2014-04' },
    { institution: 'Osmania University', degree: 'B.Com.', startDate: '2008-07', endDate: '2011-05' },
  ],
  projects: [],
  certifications: [{ name: 'SHRM Senior Certified Professional (SHRM-SCP)', issuer: 'SHRM', date: '2023-04' }],
};

const scienceSample: ResumeImportResult = {
  title: 'Dr. Arjun Banerjee - Research Scientist (Computational Biology)',
  contact: {
    fullName: 'Dr. Arjun Banerjee',
    email: 'arjun.banerjee@example.com',
    phone: '+91 98305 33102',
    location: 'Kolkata, India',
    links: ['linkedin.com/in/arjun-banerjee-research', 'orcid.org/0000-0002-1234-5678'],
  },
  summary:
    'Research Scientist with PhD in Computational Biology and 7+ years applying ML to genomics — 14 peer-reviewed publications and 2 funded grants.',
  skills: [
    'Experimental Design', 'Statistical Modelling', 'Genomics Data Analysis', 'Machine Learning',
    'Bioinformatics Pipelines', 'Grant Writing', 'Peer Review', 'Scientific Writing',
    'Collaborative Research', 'Reproducible Research',
  ],
  technicalSkills: ['Python', 'R', 'Bash', 'Snakemake', 'Nextflow', 'PyTorch', 'AWS', 'LaTeX'],
  softSkills: ['Mentorship', 'Conference Presentation', 'Cross-disciplinary Collaboration'],
  languages: ['English', 'Bengali', 'Hindi'],
  experience: [
    {
      company: 'CSIR — Indian Institute of Chemical Biology', role: 'Research Scientist',
      startDate: '2020-06', endDate: 'Present',
      highlights: [
        'Lead PI on a 1.4 Cr DBT-funded project on transcriptomic biomarkers for early cancer detection.',
        'Authored 9 peer-reviewed papers (3 first-author) in Bioinformatics, NAR, and PLOS Comp Bio.',
        'Mentored 5 PhD students and 8 research interns through full project lifecycle.',
      ],
    },
    {
      company: 'EMBL-EBI, Cambridge UK', role: 'Postdoctoral Researcher',
      startDate: '2017-10', endDate: '2020-05',
      highlights: [
        'Developed a deep-learning model for variant effect prediction adopted in 4 downstream studies.',
        'Open-sourced reproducible Snakemake pipelines used by 12 collaborating labs.',
      ],
    },
  ],
  education: [
    { institution: 'University of Cambridge', degree: 'PhD, Computational Biology', startDate: '2013-10', endDate: '2017-09' },
    { institution: 'IIT Kharagpur', degree: 'M.Sc., Biotechnology', startDate: '2011-07', endDate: '2013-05' },
  ],
  projects: [],
  certifications: [{ name: 'Cold Spring Harbor — Statistical Methods for Functional Genomics', issuer: 'CSHL', date: '2019-08' }],
};

const manufacturingSample: ResumeImportResult = {
  title: 'Suresh Patil - Plant Operations Manager',
  contact: {
    fullName: 'Suresh Patil',
    email: 'suresh.patil@example.com',
    phone: '+91 98221 47730',
    location: 'Pune, India',
    links: ['linkedin.com/in/suresh-patil-ops'],
  },
  summary:
    'Plant Operations Manager with 12+ years driving lean transformation, supplier quality, and EHS compliance in automotive and industrial-products manufacturing.',
  skills: [
    'Lean Manufacturing', 'Six Sigma', 'Production Planning', 'Supplier Quality Management',
    'Inventory Optimization', 'OEE Improvement', 'EHS Compliance', 'Capex Planning',
    'Vendor Negotiation', 'Continuous Improvement',
  ],
  technicalSkills: ['SAP S/4HANA', 'Minitab', 'AutoCAD', 'MS Project', 'Power BI'],
  softSkills: ['Plant Floor Leadership', 'Cross-functional Coordination', 'Change Management'],
  languages: ['English', 'Hindi', 'Marathi'],
  experience: [
    {
      company: 'Cummins India', role: 'Plant Operations Manager',
      startDate: '2020-05', endDate: 'Present',
      highlights: [
        'Lifted plant OEE from 68% to 81% via TPM and bottleneck redesign across 3 production lines.',
        'Cut working-capital tied to raw-material inventory by 22 Cr through Kanban replenishment.',
        'Achieved 730 days zero-LTI through behaviour-based safety programme covering 540 operators.',
      ],
    },
    {
      company: 'Bharat Forge', role: 'Senior Production Engineer',
      startDate: '2012-07', endDate: '2020-04',
      highlights: [
        'Led 9 Six Sigma projects with 14 Cr cumulative savings.',
        'Qualified 11 new tier-2 suppliers and reduced single-source risk by 40%.',
      ],
    },
  ],
  education: [
    { institution: 'COEP Pune', degree: 'B.E. Mechanical Engineering', startDate: '2008-07', endDate: '2012-06' },
  ],
  projects: [],
  certifications: [
    { name: 'Six Sigma Black Belt', issuer: 'ASQ', date: '2021-06' },
    { name: 'Certified Production & Inventory Management (CPIM)', issuer: 'APICS', date: '2019-04' },
  ],
};

const hospitalitySample: ResumeImportResult = {
  title: 'Aditi Sharma - Front Office Manager (Luxury Hotels)',
  contact: {
    fullName: 'Aditi Sharma',
    email: 'aditi.sharma@example.com',
    phone: '+91 98212 67841',
    location: 'Mumbai, India',
    links: ['linkedin.com/in/aditi-sharma-hospitality'],
  },
  summary:
    'Hotel Front Office Manager with 9+ years in 5-star and luxury-segment properties — guest experience, revenue management, and large-team operations.',
  skills: [
    'Guest Relations', 'Front Office Operations', 'Revenue Management', 'Upselling',
    'Team Leadership', 'Crisis Handling', 'Loyalty Programs', 'Vendor Coordination',
    'Banquet Coordination', 'VIP & Concierge Services',
  ],
  technicalSkills: ['Opera PMS', 'Micros POS', 'IDS Next', 'Microsoft Office'],
  softSkills: ['Guest Empathy', 'Conflict Resolution', 'Composure Under Pressure', 'Multilingual Communication'],
  languages: ['English', 'Hindi', 'French'],
  experience: [
    {
      company: 'Taj Mahal Palace, Mumbai', role: 'Front Office Manager',
      startDate: '2021-05', endDate: 'Present',
      highlights: [
        'Led a 42-person front-office team with consistent guest-satisfaction scores above 9.2/10.',
        'Drove a personalised-arrival program that lifted suite upsell revenue by 27% year-over-year.',
        'Coordinated front-office for 18 large MICE events, including a 600-pax international summit.',
      ],
    },
    {
      company: 'The Oberoi, Gurgaon', role: 'Assistant Front Office Manager',
      startDate: '2015-09', endDate: '2021-04',
      highlights: [
        'Trained 60+ associates on Forbes 5-star service standards with measurable mystery-audit gains.',
        'Owned VIP movements for state visits and CXO long-stays through dedicated service tracks.',
      ],
    },
  ],
  education: [{
    institution: 'Institute of Hotel Management, Aurangabad',
    degree: 'B.Sc. Hospitality and Hotel Administration',
    startDate: '2011-07', endDate: '2014-05',
  }],
  projects: [],
  certifications: [{ name: 'Forbes Travel Guide Service Excellence', issuer: 'Forbes Travel Guide', date: '2022-08' }],
};

const constructionSample: ResumeImportResult = {
  title: 'Rahul Khanna - Senior Project Engineer (Construction)',
  contact: {
    fullName: 'Rahul Khanna',
    email: 'rahul.khanna@example.com',
    phone: '+91 99113 28401',
    location: 'New Delhi, India',
    links: ['linkedin.com/in/rahul-khanna-construction'],
  },
  summary:
    'Senior Project Engineer with 11+ years delivering high-rise residential and commercial real-estate projects on time and within 3% of budget.',
  skills: [
    'Project Planning & Scheduling', 'Site Supervision', 'Quantity Estimation', 'Contract Management',
    'Quality Assurance', 'EHS Compliance', 'Vendor Management', 'BIM Coordination',
    'RERA Compliance', 'Cost Control',
  ],
  technicalSkills: ['Primavera P6', 'AutoCAD', 'Revit (BIM)', 'MS Project', 'STAAD.Pro'],
  softSkills: ['Stakeholder Management', 'Negotiation', 'Site Leadership'],
  languages: ['English', 'Hindi', 'Punjabi'],
  experience: [
    {
      company: 'DLF Limited', role: 'Senior Project Engineer',
      startDate: '2020-04', endDate: 'Present',
      highlights: [
        'Delivered 1.4M sq ft commercial tower handover 6 weeks ahead of contractual milestone.',
        'Negotiated revised supply contracts that absorbed 18% steel-price hike with only 2% project-cost impact.',
        'Implemented digital QA/QC checklists that cut rework on finishing trades by 23%.',
      ],
    },
    {
      company: 'L&T Construction', role: 'Project Engineer',
      startDate: '2013-07', endDate: '2020-03',
      highlights: [
        'Owned site execution for two 30-storey residential towers in Mumbai.',
        'Coordinated 14 vendor packages across MEP and façade scopes.',
      ],
    },
  ],
  education: [
    { institution: 'Delhi Technological University', degree: 'B.Tech. Civil Engineering', startDate: '2009-07', endDate: '2013-06' },
  ],
  projects: [],
  certifications: [
    { name: 'PMP', issuer: 'Project Management Institute', date: '2022-02' },
    { name: 'NEBOSH IGC', issuer: 'NEBOSH', date: '2020-09' },
  ],
};

const governmentSample: ResumeImportResult = {
  title: 'Ananya Joshi - Senior Policy Analyst',
  contact: {
    fullName: 'Ananya Joshi',
    email: 'ananya.joshi@example.com',
    phone: '+91 98115 22043',
    location: 'New Delhi, India',
    links: ['linkedin.com/in/ananya-joshi-policy'],
  },
  summary:
    'Policy Analyst with 8+ years across central-government think tanks and a development-finance institution — research, stakeholder consultations, and evidence-based recommendations on digital and financial-inclusion policy.',
  skills: [
    'Policy Research', 'Stakeholder Engagement', 'Quantitative Analysis', 'Public Speaking',
    'Program Evaluation', 'Regulatory Analysis', 'Grant Writing', 'Cross-ministry Coordination',
    'Memo Drafting', 'Committee Facilitation',
  ],
  technicalSkills: ['Stata', 'R', 'Advanced Excel', 'Tableau', 'GIS (QGIS)'],
  softSkills: ['Diplomacy', 'Concise Writing', 'Briefing Senior Officials'],
  languages: ['English', 'Hindi', 'Marathi'],
  experience: [
    {
      company: 'NITI Aayog', role: 'Senior Policy Analyst — Digital Public Infrastructure',
      startDate: '2021-07', endDate: 'Present',
      highlights: [
        'Co-authored a national-level paper on DPI for financial inclusion that informed a 1,200 Cr budget proposal.',
        'Coordinated 22 stakeholder consultations with state governments, regulators, and industry bodies.',
        'Briefed Joint Secretary-level officials on quarterly policy progress.',
      ],
    },
    {
      company: 'NABARD', role: 'Research Officer',
      startDate: '2015-08', endDate: '2021-06',
      highlights: [
        'Led impact-evaluation studies of two priority-sector lending programmes covering 12 states.',
        'Built a state-level dashboard tracking 18 inclusion indicators that became the unit standard.',
      ],
    },
  ],
  education: [
    { institution: 'London School of Economics', degree: 'MSc Public Policy & Administration', startDate: '2013-09', endDate: '2014-09' },
    { institution: 'St. Stephen’s College, Delhi', degree: 'B.A. (Hons.) Economics', startDate: '2010-07', endDate: '2013-05' },
  ],
  projects: [],
  certifications: [{ name: 'Harvard Kennedy School Executive Education — Leadership in Public Policy', issuer: 'HKS', date: '2023-03' }],
};

const mediaSample: ResumeImportResult = {
  title: 'Ishaan Verma - Senior Content & Social Media Manager',
  contact: {
    fullName: 'Ishaan Verma',
    email: 'ishaan.verma@example.com',
    phone: '+91 99102 71880',
    location: 'Mumbai, India',
    links: ['linkedin.com/in/ishaan-verma-media', 'twitter.com/ishaanverma'],
  },
  summary:
    'Content & Social Media Manager with 8+ years owning brand storytelling, editorial calendars, and data-led growth across consumer and B2B brands.',
  skills: [
    'Content Strategy', 'Editorial Calendars', 'Social Media Management', 'Copywriting',
    'SEO', 'Influencer Partnerships', 'Brand Voice Development', 'Analytics & Reporting',
    'Public Relations', 'Crisis Communications',
  ],
  technicalSkills: ['Hootsuite', 'Sprout Social', 'Google Analytics 4', 'WordPress', 'Adobe Premiere Pro', 'Canva'],
  softSkills: ['Storytelling', 'Cross-functional Collaboration', 'Editorial Judgement'],
  languages: ['English', 'Hindi', 'Urdu'],
  experience: [
    {
      company: 'Zomato', role: 'Senior Social Media Manager',
      startDate: '2021-09', endDate: 'Present',
      highlights: [
        'Grew Instagram and X engagement by 64% YoY through a distinct, witty brand voice.',
        'Owned a 12-person editorial pod covering daily content, campaigns, and CXO ghost-writing.',
        'Defused 3 reputational incidents with under-2-hour response playbooks.',
      ],
    },
    {
      company: 'The Hindu', role: 'Digital Editor',
      startDate: '2015-06', endDate: '2021-08',
      highlights: [
        'Led a SEO content overhaul that lifted organic sessions by 41% across the politics desk.',
        'Mentored 9 reporters on long-form digital storytelling and multimedia formats.',
      ],
    },
  ],
  education: [{
    institution: 'Asian College of Journalism, Chennai',
    degree: 'PG Diploma in Journalism',
    startDate: '2013-08', endDate: '2014-05',
  }],
  projects: [],
  certifications: [{ name: 'Google Analytics 4 Certified', issuer: 'Google', date: '2023-05' }],
};

const retailSample: ResumeImportResult = {
  title: 'Priyanka Bhatia - Senior Category Manager (E-commerce)',
  contact: {
    fullName: 'Priyanka Bhatia',
    email: 'priyanka.bhatia@example.com',
    phone: '+91 99203 41782',
    location: 'Bengaluru, India',
    links: ['linkedin.com/in/priyanka-bhatia-retail'],
  },
  summary:
    'Category Manager with 9+ years across online marketplaces and modern trade — assortment planning, pricing strategy, and seller-led GMV growth.',
  skills: [
    'Category Management', 'Assortment Planning', 'Pricing Strategy', 'Demand Forecasting',
    'Vendor Negotiation', 'Visual Merchandising', 'Promotion Planning', 'P&L Ownership',
    'Customer Experience', 'Marketplace Operations',
  ],
  technicalSkills: ['Amazon Seller Central', 'Shopify', 'SAP MM', 'Tableau', 'Advanced Excel'],
  softSkills: ['Negotiation', 'Stakeholder Management', 'Cross-functional Collaboration'],
  languages: ['English', 'Hindi'],
  experience: [
    {
      company: 'Flipkart', role: 'Senior Category Manager — Home & Kitchen',
      startDate: '2021-02', endDate: 'Present',
      highlights: [
        'Owned 480 Cr GMV category with 28% YoY growth across 2 consecutive financial years.',
        'Led pricing-engine roll-out that lifted contribution margin by 1.6 pp without hurting velocity.',
        'Onboarded 60+ private-label sellers; private-label SKUs now drive 22% of category GMV.',
      ],
    },
    {
      company: 'Reliance Retail', role: 'Buyer / Merchandiser',
      startDate: '2014-07', endDate: '2021-01',
      highlights: [
        'Managed assortment for 120 stores across 4 cities; cut markdowns by 18% via tighter buying.',
        'Negotiated annual contracts with 35 vendors covering 4,200 SKUs.',
      ],
    },
  ],
  education: [
    { institution: 'NMIMS Mumbai', degree: 'MBA (Marketing)', startDate: '2012-06', endDate: '2014-04' },
    { institution: 'Lady Shri Ram College for Women', degree: 'B.Com. (Hons.)', startDate: '2008-07', endDate: '2011-05' },
  ],
  projects: [],
  certifications: [{ name: 'Certified Supply Chain Professional (CSCP)', issuer: 'APICS', date: '2022-09' }],
};

const logisticsSample: ResumeImportResult = {
  title: 'Manish Bansal - Senior Logistics & Fleet Manager',
  contact: {
    fullName: 'Manish Bansal',
    email: 'manish.bansal@example.com',
    phone: '+91 99206 88321',
    location: 'Gurgaon, India',
    links: ['linkedin.com/in/manish-bansal-logistics'],
  },
  summary:
    'Logistics Manager with 10+ years across road freight, last-mile, and import-export — fleet utilisation, route optimisation, and 3PL governance.',
  skills: [
    'Fleet Management', 'Route Optimisation', '3PL Governance', 'Warehouse Operations',
    'Inventory Control', 'Customs Documentation', 'INCOTERMS', 'Vendor SLAs',
    'Cost-per-Delivery Optimisation', 'Last-mile Operations',
  ],
  technicalSkills: ['SAP TM', 'Oracle WMS', 'Tableau', 'Advanced Excel', 'Power BI'],
  softSkills: ['Vendor Negotiation', 'Crisis Handling', 'Field Team Leadership'],
  languages: ['English', 'Hindi', 'Punjabi'],
  experience: [
    {
      company: 'Delhivery', role: 'Senior Manager, Mid-Mile Logistics',
      startDate: '2021-03', endDate: 'Present',
      highlights: [
        'Owned 1,200-vehicle mid-mile network across North India; lifted on-time arrival from 88% to 96%.',
        'Cut cost per parcel by 11% through hub redesign and load-factor improvements.',
        'Stood up control-tower dashboards reused by 5 regional ops leads.',
      ],
    },
    {
      company: 'Maersk', role: 'Logistics Coordinator',
      startDate: '2013-08', endDate: '2021-02',
      highlights: [
        'Coordinated import-export documentation for 600+ FCL shipments per month.',
        'Resolved customs holds with average TAT under 36 hours through proactive vendor coordination.',
      ],
    },
  ],
  education: [{
    institution: 'Symbiosis Institute of Operations Management',
    degree: 'MBA (Operations & Supply Chain)',
    startDate: '2011-06', endDate: '2013-04',
  }],
  projects: [],
  certifications: [{ name: 'Certified in Logistics, Transportation and Distribution (CLTD)', issuer: 'APICS', date: '2022-11' }],
};

const agricultureSample: ResumeImportResult = {
  title: 'Dr. Lakshmi Nair - Senior Agronomist & Sustainability Lead',
  contact: {
    fullName: 'Dr. Lakshmi Nair',
    email: 'lakshmi.nair@example.com',
    phone: '+91 94470 21188',
    location: 'Kochi, India',
    links: ['linkedin.com/in/lakshmi-nair-agronomy'],
  },
  summary:
    'Senior Agronomist and Sustainability Lead with 10+ years applying climate-smart agriculture, soil-health science, and remote sensing to smallholder farming programmes across South India.',
  skills: [
    'Sustainable Agriculture', 'Soil Health Management', 'Climate-smart Agriculture', 'Crop Planning',
    'Irrigation Management', 'Pest & Disease Management', 'Farmer Training', 'Impact Measurement',
    'Field Trials', 'Carbon & Water Footprint Analysis',
  ],
  technicalSkills: ['QGIS', 'ArcGIS', 'R', 'Python', 'Remote Sensing (Sentinel / Landsat)', 'AquaCrop'],
  softSkills: ['Community Engagement', 'Multilingual Field Communication', 'Stakeholder Coordination'],
  languages: ['English', 'Malayalam', 'Tamil', 'Hindi'],
  experience: [
    {
      company: 'ITC Agri-Business Division', role: 'Senior Agronomist & Sustainability Lead',
      startDate: '2020-06', endDate: 'Present',
      highlights: [
        'Designed climate-smart paddy package adopted across 18,000 farmers; cut water use 28% and lifted yield 12%.',
        'Led soil-health card programme covering 240 villages; trained 60 field officers and 1,500 lead farmers.',
        'Implemented satellite-based crop monitoring that reduced pest-outbreak losses by 19% on flagship farms.',
      ],
    },
    {
      company: 'M.S. Swaminathan Research Foundation', role: 'Research Associate',
      startDate: '2013-09', endDate: '2020-05',
      highlights: [
        'Co-led 4 multi-year field trials on intercropping and biofortified varieties in Tamil Nadu and Kerala.',
        'Co-authored 7 peer-reviewed papers on smallholder resilience to climate variability.',
      ],
    },
  ],
  education: [
    { institution: 'Kerala Agricultural University', degree: 'PhD, Agronomy', startDate: '2010-08', endDate: '2013-08' },
    { institution: 'Tamil Nadu Agricultural University', degree: 'M.Sc. (Ag.) Agronomy', startDate: '2008-07', endDate: '2010-06' },
  ],
  projects: [],
  certifications: [{ name: 'Climate-Smart Agriculture (FAO e-learning)', issuer: 'FAO', date: '2022-07' }],
};

const nonprofitSample: ResumeImportResult = {
  title: 'Tanvi Saxena - Senior Program Manager (Education Non-profit)',
  contact: {
    fullName: 'Tanvi Saxena',
    email: 'tanvi.saxena@example.com',
    phone: '+91 99007 28110',
    location: 'Bengaluru, India',
    links: ['linkedin.com/in/tanvi-saxena-impact'],
  },
  summary:
    'Senior Program Manager with 9+ years scaling education and livelihoods programmes for Indian and international NGOs — fundraising, monitoring & evaluation, and government partnerships.',
  skills: [
    'Program Management', 'Grant Writing', 'Donor Relations', 'Monitoring & Evaluation',
    'Community Outreach', 'Volunteer Coordination', 'Government Partnerships', 'Impact Measurement',
    'Theory of Change', 'Budget Stewardship',
  ],
  technicalSkills: ['Salesforce Nonprofit Cloud', 'KoBoToolbox', 'Power BI', 'Advanced Excel'],
  softSkills: ['Empathic Listening', 'Multilingual Communication', 'Cross-sector Facilitation'],
  languages: ['English', 'Hindi', 'Kannada'],
  experience: [
    {
      company: 'Pratham Education Foundation', role: 'Senior Program Manager — Karnataka',
      startDate: '2021-01', endDate: 'Present',
      highlights: [
        'Scaled Teaching-at-the-Right-Level programme to 1,800 government schools impacting 240,000 children.',
        'Raised 11 Cr in 18 months through structured donor pipelines and 4 new institutional partnerships.',
        'Built outcome dashboards tracking learning gains across 3 districts; adopted as national M&E template.',
      ],
    },
    {
      company: 'CARE India', role: 'Program Officer',
      startDate: '2014-08', endDate: '2020-12',
      highlights: [
        'Managed a 4 Cr women-livelihoods portfolio across 6 blocks of Bihar.',
        'Wrote 3 successful concept notes that secured multi-year support from Ford Foundation and DFID.',
      ],
    },
  ],
  education: [
    { institution: 'Tata Institute of Social Sciences', degree: 'MA, Social Work (Development Practice)', startDate: '2012-06', endDate: '2014-05' },
    { institution: 'University of Delhi', degree: 'B.A. (Hons.) Sociology', startDate: '2008-07', endDate: '2011-05' },
  ],
  projects: [],
  certifications: [{ name: 'Project DPro Foundation', issuer: 'PM4NGOs', date: '2022-04' }],
};

const aiSample: ResumeImportResult = {
  title: 'Aditya Rao - Senior AI Engineer (Agentic Systems)',
  contact: {
    fullName: 'Aditya Rao',
    email: 'aditya.rao@example.com',
    phone: '+91 99002 33812',
    location: 'Bengaluru, India',
    links: ['linkedin.com/in/aditya-rao-ai', 'github.com/adityarao-ai', 'huggingface.co/adityarao'],
  },
  summary:
    'Senior AI Engineer with 7+ years building production LLM and agentic systems — RAG pipelines, multi-tool agents, and evaluation harnesses serving 5M+ monthly requests.',
  skills: [
    'LLM Application Development', 'Retrieval-Augmented Generation (RAG)', 'Agentic Workflows',
    'Prompt Engineering', 'Vector Databases', 'LLM Evaluation', 'Fine-tuning (LoRA / QLoRA)',
    'MLOps', 'Tool Use & Function Calling', 'Guardrails & Safety',
  ],
  technicalSkills: [
    'Python', 'PyTorch', 'LangChain', 'LangGraph', 'LlamaIndex', 'OpenAI API', 'Anthropic Claude API',
    'pgvector', 'Pinecone', 'Weaviate', 'Hugging Face Transformers', 'Ray', 'FastAPI', 'AWS Bedrock',
  ],
  softSkills: ['Technical Leadership', 'Cross-functional Collaboration', 'Mentoring', 'Stakeholder Communication'],
  languages: ['English', 'Hindi', 'Kannada'],
  experience: [
    {
      company: 'Nimbus AI Labs', role: 'Senior AI Engineer, Agentic Systems',
      startDate: '2022-08', endDate: 'Present',
      highlights: [
        'Designed a multi-agent customer-support system (planner + tool-use + critique loop) that resolved 38% of tickets without human escalation.',
        'Built a RAG pipeline over 1.2M internal documents with hybrid BM25+dense retrieval; lifted answer faithfulness from 71% to 92% on internal eval set.',
        'Established an LLM-as-judge evaluation harness covering 14 task families; cut regression detection time from 3 days to 25 minutes.',
        'Reduced inference cost 41% via prompt caching, smaller routing models, and selective LoRA fine-tunes.',
      ],
    },
    {
      company: 'BlueOrbit Data', role: 'Machine Learning Engineer',
      startDate: '2018-07', endDate: '2022-07',
      highlights: [
        'Shipped 6 production ML models for fraud, ranking, and recommendation across 3 product surfaces.',
        'Owned the feature store and online model-serving stack on Kubernetes; sustained p99 latency under 80ms at 25K RPS.',
        'Mentored 4 junior MLEs and led the team’s migration from TensorFlow 1.x to PyTorch.',
      ],
    },
  ],
  education: [
    { institution: 'IIT Madras', degree: 'M.Tech, Computer Science (ML specialization)', startDate: '2016-07', endDate: '2018-05' },
    { institution: 'BITS Pilani', degree: 'B.E., Computer Science', startDate: '2012-08', endDate: '2016-05' },
  ],
  projects: [
    {
      name: 'OpenAgentBench', role: 'Creator',
      startDate: '2024-01', endDate: '2024-09',
      highlights: [
        'Open-source benchmark for multi-step tool-using agents with 22 tasks across coding, web, and analysis.',
        'Reproducible eval harness compares Claude, GPT, and open-weight models on success rate and cost.',
      ],
    },
  ],
  certifications: [
    { name: 'AWS Certified Machine Learning — Specialty', issuer: 'AWS', date: '2023-11' },
    { name: 'DeepLearning.AI Generative AI with LLMs', issuer: 'DeepLearning.AI', date: '2023-06' },
  ],
};

const samplesByIndustry: Record<string, ResumeImportResult> = {
  'information-technology': itSample,
  'ai-machine-learning': aiSample,
  'engineering': engineeringSample,
  'healthcare': healthcareSample,
  'finance': financeSample,
  'legal': legalSample,
  'education': educationSample,
  'sales-marketing': salesSample,
  'business-management': businessSample,
  'creative-design': creativeSample,
  'human-resources': hrSample,
  'science-research': scienceSample,
  'manufacturing-supply-chain': manufacturingSample,
  'hospitality-tourism': hospitalitySample,
  'construction-real-estate': constructionSample,
  'government-public-sector': governmentSample,
  'media-communications': mediaSample,
  'retail-ecommerce': retailSample,
  'logistics-transport': logisticsSample,
  'agriculture-environment': agricultureSample,
  'non-profit-social-impact': nonprofitSample,
};

/**
 * Look up a sample resume for the given profession id. Returns the IT sample
 * as a fallback so downstream rendering always has something to display.
 * The dashboard also falls back to this when the user hasn't picked a
 * profession yet.
 */
export function getSampleResumeForIndustry(industryId?: string | null): ResumeImportResult {
  if (!industryId) return itSample;
  return samplesByIndustry[industryId] ?? itSample;
}

/**
 * Back-compat export. Existing imports keep working while consumers migrate
 * to the profession-aware selector above.
 */
export const sampleResumeData: ResumeImportResult = itSample;
