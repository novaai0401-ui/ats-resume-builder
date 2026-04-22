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

const samplesByIndustry: Record<string, ResumeImportResult> = {
  'information-technology': itSample,
  'engineering': engineeringSample,
  'healthcare': healthcareSample,
  'finance': financeSample,
  'legal': legalSample,
  'education': educationSample,
  'sales-marketing': salesSample,
  'business-management': businessSample,
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
