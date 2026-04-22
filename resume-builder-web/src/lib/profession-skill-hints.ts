/**
 * Profession-keyed skill suggestions for the Career Navigator.
 *
 * Used for two things:
 *  1. The placeholder in the "skills you already have" textarea.
 *  2. A row of clickable chips below the textarea so users can add
 *     profession-appropriate skills in one tap instead of typing
 *     "HTML, CSS, JavaScript" when they're a doctor.
 *
 * Keep each list at ~10 items so the chip row doesn't wrap into three
 * lines. Entries are ordered with the most common / highest-signal
 * items first — the chip row is visually scanned left-to-right.
 */

export const PROFESSION_SKILL_HINTS: Record<string, string[]> = {
  'information-technology': [
    'TypeScript', 'React', 'Node.js', 'Python', 'AWS', 'Docker', 'Kubernetes', 'SQL', 'System Design', 'CI/CD',
  ],
  'engineering': [
    'SolidWorks', 'AutoCAD', 'ANSYS', 'GD&T', 'FMEA', 'MATLAB', 'Six Sigma', 'Project Management', 'Product Design', 'DFM',
  ],
  'healthcare': [
    'Patient Assessment', 'Clinical Diagnosis', 'Critical Care', 'EMR Systems', 'Infection Control',
    'Clinical Documentation', 'Patient Counselling', 'ACLS', 'BLS', 'Triage',
  ],
  'finance': [
    'Financial Modelling', 'Valuation', 'Advanced Excel', 'Power BI', 'SQL', 'IFRS', 'Variance Analysis',
    'FP&A', 'Budgeting', 'Forecasting',
  ],
  'legal': [
    'Contract Drafting', 'Due Diligence', 'Legal Research', 'Compliance', 'Litigation', 'M&A',
    'Corporate Governance', 'Dispute Resolution', 'Manupatra', 'Client Advisory',
  ],
  'education': [
    'Curriculum Design', 'Lesson Planning', 'Differentiated Instruction', 'Classroom Management',
    'Formative Assessment', 'Student Mentoring', 'Educational Technology', 'Parent Communication',
    'Academic Counselling', 'Google Classroom',
  ],
  'sales-marketing': [
    'B2B Sales', 'Account Management', 'Channel Management', 'Salesforce', 'Territory Planning',
    'Negotiation', 'Forecasting', 'Pricing Strategy', 'Cold Outreach', 'Relationship Building',
  ],
  'business-management': [
    'Program Management', 'Process Improvement', 'OKR Planning', 'Stakeholder Management',
    'Change Management', 'Business Strategy', 'KPI Reporting', 'Executive Communication',
    'Vendor Governance', 'Tableau',
  ],
  'creative-design': [
    'Figma', 'Adobe Illustrator', 'Adobe Photoshop', 'UX Research', 'Wireframing', 'Prototyping',
    'Design Systems', 'Typography', 'User Testing', 'Brand Identity',
  ],
  'human-resources': [
    'Talent Acquisition', 'Employee Relations', 'Performance Management', 'HRIS', 'Compensation & Benefits',
    'Learning & Development', 'HR Policy', 'Onboarding', 'Workforce Planning', 'Workday',
  ],
  'science-research': [
    'Experimental Design', 'Data Analysis', 'Python', 'R', 'Statistical Methods', 'Peer Review',
    'Grant Writing', 'Lab Techniques', 'Scientific Writing', 'LaTeX',
  ],
  'manufacturing-supply-chain': [
    'Lean Manufacturing', 'Six Sigma', 'Supply Chain Planning', 'Inventory Management', 'SAP',
    'Procurement', 'Vendor Management', 'Quality Control', 'ISO 9001', 'Kaizen',
  ],
  'hospitality-tourism': [
    'Guest Relations', 'Front Office Operations', 'Event Planning', 'F&B Management',
    'Revenue Management', 'Opera PMS', 'Tour Planning', 'Vendor Coordination', 'Upselling', 'POS Systems',
  ],
  'construction-real-estate': [
    'Project Management', 'AutoCAD', 'BIM / Revit', 'Site Supervision', 'Cost Estimation',
    'Contract Management', 'Quality Assurance', 'Primavera P6', 'Safety Compliance', 'RERA',
  ],
  'government-public-sector': [
    'Policy Analysis', 'Public Administration', 'Stakeholder Engagement', 'Program Evaluation',
    'Regulatory Compliance', 'Grant Writing', 'Project Management', 'Public Speaking',
    'Budget Management', 'Committee Coordination',
  ],
  'media-communications': [
    'Copywriting', 'Editing', 'Content Strategy', 'Social Media', 'SEO', 'Adobe Creative Suite',
    'Video Production', 'Public Relations', 'CMS (WordPress)', 'Analytics',
  ],
  'retail-ecommerce': [
    'Category Management', 'Merchandising', 'Inventory Planning', 'Shopify', 'Amazon Seller Central',
    'Pricing Strategy', 'Visual Merchandising', 'Customer Experience', 'POS Systems', 'Demand Forecasting',
  ],
  'logistics-transport': [
    'Supply Chain Management', 'Fleet Management', 'Route Optimisation', 'Warehouse Operations',
    'SAP', 'Inventory Control', 'Vendor Management', 'Customs Documentation', 'INCOTERMS', '3PL Coordination',
  ],
  'agriculture-environment': [
    'Sustainable Agriculture', 'Soil Science', 'Irrigation Management', 'GIS', 'Crop Planning',
    'Environmental Impact Assessment', 'Agronomy', 'Remote Sensing', 'Field Research', 'Pest Management',
  ],
  'non-profit-social-impact': [
    'Program Management', 'Grant Writing', 'Fundraising', 'Community Outreach', 'Volunteer Coordination',
    'Monitoring & Evaluation', 'Donor Relations', 'Impact Measurement', 'Public Speaking', 'Advocacy',
  ],
};

const DEFAULT_HINTS = [
  'Project Management', 'Communication', 'Problem Solving', 'Leadership',
  'Stakeholder Management', 'Analytical Thinking', 'Collaboration', 'Planning',
];

export function getSkillHintsForIndustry(industryId?: string | null): string[] {
  if (!industryId) return DEFAULT_HINTS;
  return PROFESSION_SKILL_HINTS[industryId] ?? DEFAULT_HINTS;
}

/** Join the first N hints with comma into a sample placeholder string. */
export function buildSkillsPlaceholder(industryId?: string | null, limit = 5): string {
  const sample = getSkillHintsForIndustry(industryId).slice(0, limit).join(', ');
  return sample ? `e.g. ${sample}` : 'e.g. list your key skills, one per line';
}
