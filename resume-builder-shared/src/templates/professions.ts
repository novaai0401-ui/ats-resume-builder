/**
 * Canonical profession catalog shared across the app.
 *
 * The catalog is used by:
 *  - Dashboard profession selector (filters template catalog)
 *  - Career Navigator (industry + role pickers, target role suggestions)
 *  - Template recommendation engine (maps a role to the best ATS template)
 *
 * Keep this list in a single place so Career Navigator, dashboard, and
 * template metadata never drift apart.
 */

import type { TemplateCatalogId } from './catalog.js';

export type ProfessionRole = {
  id: string;
  label: string;
  keywords?: string[];
};

export type ProfessionIndustry = {
  id: string;
  label: string;
  description?: string;
  /** Templates recommended for this industry, ordered best-first. */
  recommendedTemplates: TemplateCatalogId[];
  roles: ProfessionRole[];
};

export const PROFESSION_INDUSTRIES: readonly ProfessionIndustry[] = [
  {
    id: 'information-technology',
    label: 'Information Technology',
    description: 'Software engineering, cloud, data, security, and platform roles.',
    recommendedTemplates: ['technical', 'modern', 'classic'],
    roles: [
      { id: 'frontend-engineer', label: 'Frontend Engineer', keywords: ['React', 'TypeScript', 'CSS'] },
      { id: 'backend-engineer', label: 'Backend Engineer', keywords: ['Node.js', 'APIs', 'SQL'] },
      { id: 'full-stack-engineer', label: 'Full Stack Engineer', keywords: ['React', 'Node.js', 'REST APIs', 'SQL', 'CI/CD'] },
      { id: 'mobile-engineer', label: 'Mobile Engineer', keywords: ['iOS', 'Android', 'React Native'] },
      { id: 'devops-engineer', label: 'DevOps / Platform Engineer', keywords: ['Kubernetes', 'CI/CD', 'AWS'] },
      { id: 'site-reliability-engineer', label: 'Site Reliability Engineer', keywords: ['Kubernetes', 'Terraform', 'Observability', 'Incident response', 'SLOs'] },
      { id: 'data-engineer', label: 'Data Engineer', keywords: ['Spark', 'Airflow', 'Snowflake'] },
      { id: 'data-scientist', label: 'Data Scientist', keywords: ['Python', 'ML', 'Statistics'] },
      { id: 'machine-learning-engineer', label: 'Machine Learning Engineer', keywords: ['PyTorch', 'TensorFlow', 'MLOps', 'Model deployment', 'Python'] },
      { id: 'ai-engineer', label: 'AI Engineer', keywords: ['LLMs', 'RAG', 'Agents'] },
      { id: 'qa-engineer', label: 'QA / Automation Engineer', keywords: ['Selenium', 'Test automation', 'API testing', 'Cypress', 'Regression testing'] },
      { id: 'security-engineer', label: 'Security Engineer', keywords: ['Threat modeling', 'SIEM', 'Penetration testing', 'OWASP', 'Incident response'] },
      { id: 'solutions-architect', label: 'Solutions Architect', keywords: ['AWS', 'System design', 'Microservices', 'Cloud migration', 'Stakeholder management'] },
      { id: 'engineering-manager', label: 'Engineering Manager', keywords: ['Team leadership', 'Agile delivery', 'Hiring', 'Roadmap planning', 'Mentoring'] },
    ],
  },
  {
    id: 'ai-machine-learning',
    label: 'AI & Machine Learning',
    description:
      'Applied AI, agentic systems, LLM engineering, MLOps, and AI product roles.',
    recommendedTemplates: ['ai-ml-engineer', 'technical', 'modern', 'classic'],
    roles: [
      {
        id: 'ai-engineer',
        label: 'AI Engineer',
        keywords: ['LLMs', 'RAG', 'Prompt Engineering', 'Vector Databases'],
      },
      {
        id: 'agentic-ai-engineer',
        label: 'Agentic AI Engineer',
        keywords: ['Agents', 'Tool Use', 'LangGraph', 'AutoGen', 'Planning'],
      },
      {
        id: 'applied-scientist',
        label: 'Applied Scientist',
        keywords: ['Deep Learning', 'Transformers', 'Research'],
      },
      {
        id: 'machine-learning-engineer',
        label: 'Machine Learning Engineer',
        keywords: ['PyTorch', 'TensorFlow', 'Model Serving'],
      },
      {
        id: 'ml-ops-engineer',
        label: 'MLOps / LLMOps Engineer',
        keywords: ['Kubeflow', 'MLflow', 'Model Monitoring', 'Vector Stores'],
      },
      {
        id: 'data-scientist',
        label: 'Data Scientist',
        keywords: ['Python', 'Statistics', 'Experimentation'],
      },
      {
        id: 'nlp-engineer',
        label: 'NLP Engineer',
        keywords: ['LLMs', 'Embeddings', 'Tokenization', 'Fine-tuning'],
      },
      {
        id: 'computer-vision-engineer',
        label: 'Computer Vision Engineer',
        keywords: ['CNNs', 'Detection', 'Segmentation'],
      },
      {
        id: 'prompt-engineer',
        label: 'Prompt Engineer',
        keywords: ['Prompting', 'Evaluation', 'LLM-as-Judge'],
      },
      {
        id: 'ai-product-manager',
        label: 'AI Product Manager',
        keywords: ['LLM Roadmap', 'Eval Harness', 'User Research'],
      },
      {
        id: 'ai-research-engineer',
        label: 'AI Research Engineer',
        keywords: ['Pretraining', 'Distillation', 'RLHF'],
      },
      {
        id: 'ai-safety-engineer',
        label: 'AI Safety / Alignment Engineer',
        keywords: ['Red-teaming', 'Guardrails', 'Eval'],
      },
    ],
  },
  {
    id: 'engineering',
    label: 'Engineering (Core)',
    description: 'Mechanical, electrical, civil, and industrial engineering.',
    recommendedTemplates: ['technical', 'classic', 'modern'],
    roles: [
      { id: 'mechanical-engineer', label: 'Mechanical Engineer', keywords: ['SolidWorks', 'AutoCAD', 'GD&T', 'FEA', 'Manufacturing processes'] },
      { id: 'electrical-engineer', label: 'Electrical Engineer', keywords: ['Circuit design', 'PLC', 'MATLAB', 'Power systems', 'Schematic capture'] },
      { id: 'civil-engineer', label: 'Civil Engineer', keywords: ['AutoCAD', 'STAAD Pro', 'Site supervision', 'Quantity estimation', 'IS codes'] },
      { id: 'chemical-engineer', label: 'Chemical Engineer', keywords: ['Process design', 'HAZOP', 'Aspen HYSYS', 'P&ID', 'Process safety'] },
      { id: 'industrial-engineer', label: 'Industrial Engineer', keywords: ['Lean manufacturing', 'Six Sigma', 'Time studies', 'Process improvement', 'Kaizen'] },
      { id: 'aerospace-engineer', label: 'Aerospace Engineer', keywords: ['CFD', 'Structural analysis', 'CATIA', 'Avionics', 'DO-178C'] },
      { id: 'automotive-engineer', label: 'Automotive Engineer', keywords: ['CATIA', 'Powertrain', 'DFMEA', 'Vehicle testing', 'BIW'] },
      { id: 'biomedical-engineer', label: 'Biomedical Engineer', keywords: ['Medical devices', 'ISO 13485', 'FDA compliance', 'Biomechanics', 'Verification & validation'] },
      { id: 'petroleum-engineer', label: 'Petroleum Engineer', keywords: ['Reservoir engineering', 'Drilling operations', 'Well testing', 'Production optimization', 'HSE'] },
      { id: 'structural-engineer', label: 'Structural Engineer', keywords: ['ETABS', 'STAAD Pro', 'RCC design', 'Steel design', 'Seismic analysis'] },
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare & Life Sciences',
    description: 'Clinical, nursing, pharmacy, and life-sciences roles.',
    recommendedTemplates: ['healthcare', 'medical-coder', 'classic', 'consultant'],
    roles: [
      { id: 'physician', label: 'Physician / Doctor', keywords: ['Patient care', 'Diagnosis', 'Clinical documentation', 'Treatment planning', 'EMR'] },
      { id: 'registered-nurse', label: 'Registered Nurse', keywords: ['Patient care', 'Medication administration', 'IV therapy', 'Care plans', 'BLS/ACLS'] },
      { id: 'nurse-practitioner', label: 'Nurse Practitioner', keywords: ['Primary care', 'Prescriptive authority', 'Patient assessment', 'Chronic disease management', 'EMR'] },
      { id: 'pharmacist', label: 'Pharmacist', keywords: ['Dispensing', 'Drug interactions', 'Patient counselling', 'Inventory management', 'Pharmacovigilance'] },
      { id: 'physiotherapist', label: 'Physiotherapist', keywords: ['Rehabilitation', 'Manual therapy', 'Exercise prescription', 'Patient assessment', 'Electrotherapy'] },
      { id: 'dentist', label: 'Dentist', keywords: ['Restorative dentistry', 'Root canal treatment', 'Extractions', 'Patient management', 'Radiographs'] },
      { id: 'medical-laboratory-technician', label: 'Medical Lab Technician', keywords: ['Sample processing', 'Hematology', 'Biochemistry', 'Quality control', 'NABL standards'] },
      {
        id: 'medical-coder',
        label: 'Medical Coder / Billing Specialist',
        keywords: ['ICD-10', 'CPT', 'HCPCS', 'CPC', 'Medical Records', 'EHR', 'Claims', 'HIPAA'],
      },
      { id: 'radiology-technician', label: 'Radiology Technician', keywords: ['X-ray', 'CT', 'MRI', 'Patient positioning', 'Radiation safety'] },
      { id: 'healthcare-administrator', label: 'Healthcare Administrator', keywords: ['Hospital operations', 'NABH accreditation', 'Budgeting', 'Staff management', 'Patient experience'] },
      { id: 'clinical-research-associate', label: 'Clinical Research Associate', keywords: ['GCP', 'Site monitoring', 'Clinical trials', 'CRF review', 'Regulatory submissions'] },
      { id: 'public-health-specialist', label: 'Public Health Specialist', keywords: ['Epidemiology', 'Health programs', 'Data analysis', 'Community outreach', 'M&E'] },
    ],
  },
  {
    id: 'finance',
    label: 'Finance & Accounting',
    description: 'Banking, investing, audit, and corporate finance.',
    recommendedTemplates: ['modern', 'consultant', 'classic'],
    roles: [
      { id: 'financial-analyst', label: 'Financial Analyst', keywords: ['Financial modelling', 'Excel', 'Variance analysis', 'Forecasting', 'Valuation'] },
      { id: 'investment-banker', label: 'Investment Banker', keywords: ['M&A', 'DCF valuation', 'Pitch books', 'Due diligence', 'Capital markets'] },
      { id: 'accountant', label: 'Accountant', keywords: ['Tally', 'GST', 'Accounts payable', 'Reconciliation', 'Financial statements'] },
      { id: 'auditor', label: 'Auditor', keywords: ['Statutory audit', 'Internal controls', 'IFRS', 'Risk assessment', 'Audit documentation'] },
      { id: 'chartered-accountant', label: 'Chartered Accountant (CA)', keywords: ['Statutory audit', 'GST', 'Income tax', 'IND AS', 'Financial reporting'] },
      { id: 'tax-consultant', label: 'Tax Consultant', keywords: ['GST', 'Income tax', 'Tax planning', 'Transfer pricing', 'Compliance'] },
      { id: 'risk-analyst', label: 'Risk Analyst', keywords: ['Credit risk', 'Market risk', 'Basel norms', 'Risk modelling', 'Stress testing'] },
      { id: 'credit-analyst', label: 'Credit Analyst', keywords: ['Credit appraisal', 'Financial statement analysis', 'Ratio analysis', 'Loan underwriting', 'CIBIL'] },
      { id: 'portfolio-manager', label: 'Portfolio Manager', keywords: ['Asset allocation', 'Equity research', 'Risk management', 'Performance attribution', 'Client management'] },
      { id: 'cfo', label: 'CFO / Finance Leader', keywords: ['Financial strategy', 'Fundraising', 'Board reporting', 'Treasury', 'Cost optimization'] },
      { id: 'actuary', label: 'Actuary', keywords: ['Actuarial valuation', 'Pricing models', 'IFRS 17', 'Reserving', 'R/Python'] },
    ],
  },
  {
    id: 'legal',
    label: 'Legal',
    description: 'Litigation, corporate counsel, compliance, and paralegal work.',
    recommendedTemplates: ['classic', 'modern', 'consultant'],
    roles: [
      { id: 'lawyer', label: 'Lawyer / Advocate', keywords: ['Litigation', 'Drafting', 'Legal research', 'Client counselling', 'Court appearances'] },
      { id: 'corporate-counsel', label: 'Corporate Counsel', keywords: ['Contract negotiation', 'Corporate governance', 'M&A support', 'Compliance', 'Legal risk'] },
      { id: 'paralegal', label: 'Paralegal', keywords: ['Legal drafting', 'Case management', 'Document review', 'Legal research', 'Court filings'] },
      { id: 'compliance-officer', label: 'Compliance Officer', keywords: ['Regulatory compliance', 'AML/KYC', 'Policy development', 'Audits', 'Risk assessment'] },
      { id: 'contracts-manager', label: 'Contracts Manager', keywords: ['Contract lifecycle', 'Negotiation', 'Vendor agreements', 'SLA management', 'Redlining'] },
      { id: 'legal-researcher', label: 'Legal Researcher', keywords: ['Case law research', 'Legal memoranda', 'Statutory interpretation', 'Citation', 'Westlaw/Manupatra'] },
      { id: 'intellectual-property-attorney', label: 'IP Attorney', keywords: ['Patent prosecution', 'Trademark filing', 'IP litigation', 'Licensing', 'Portfolio management'] },
    ],
  },
  {
    id: 'education',
    label: 'Education & Academia',
    description: 'Teaching, research, and education administration.',
    recommendedTemplates: ['academic', 'classic', 'minimal'],
    roles: [
      { id: 'school-teacher', label: 'School Teacher', keywords: ['Lesson planning', 'Classroom management', 'CBSE/ICSE curriculum', 'Student assessment', 'Parent communication'] },
      { id: 'college-lecturer', label: 'College Lecturer', keywords: ['Curriculum delivery', 'Student mentoring', 'Academic assessment', 'Research publication', 'NAAC documentation'] },
      { id: 'professor', label: 'Professor', keywords: ['Research publications', 'PhD supervision', 'Grant writing', 'Curriculum design', 'Peer review'] },
      { id: 'research-scholar', label: 'Research Scholar / PhD Candidate', keywords: ['Literature review', 'Research methodology', 'Data analysis', 'Academic writing', 'Conference presentations'] },
      { id: 'curriculum-designer', label: 'Curriculum Designer', keywords: ['Curriculum development', 'Learning outcomes', 'Instructional design', 'Assessment design', 'Bloom’s taxonomy'] },
      { id: 'education-administrator', label: 'Education Administrator', keywords: ['Academic operations', 'Accreditation', 'Staff management', 'Budget planning', 'Policy implementation'] },
      { id: 'instructional-designer', label: 'Instructional Designer', keywords: ['ADDIE', 'Storyline', 'E-learning', 'LMS', 'Learning objectives'] },
    ],
  },
  {
    id: 'business-management',
    label: 'Business & Management',
    description: 'Product, project, program, and operations leadership.',
    recommendedTemplates: ['classic', 'modern', 'consultant'],
    roles: [
      { id: 'business-analyst', label: 'Business Analyst', keywords: ['Requirements gathering', 'SQL', 'Process mapping', 'Stakeholder management', 'User stories'] },
      { id: 'product-manager', label: 'Product Manager', keywords: ['Product roadmap', 'User research', 'A/B testing', 'Stakeholder management', 'Agile'] },
      { id: 'project-manager', label: 'Project Manager', keywords: ['Project planning', 'Risk management', 'Agile/Scrum', 'Budget tracking', 'Stakeholder communication'] },
      { id: 'program-manager', label: 'Program Manager', keywords: ['Program governance', 'Cross-functional leadership', 'Dependency management', 'Executive reporting', 'Change management'] },
      { id: 'operations-manager', label: 'Operations Manager', keywords: ['Process improvement', 'SOP development', 'Team management', 'KPI tracking', 'Vendor management'] },
      { id: 'management-consultant', label: 'Management Consultant', keywords: ['Problem structuring', 'Market analysis', 'Financial modelling', 'Client presentations', 'Due diligence'] },
      { id: 'strategy-manager', label: 'Strategy Manager', keywords: ['Strategic planning', 'Competitive analysis', 'Market entry', 'Business cases', 'Executive communication'] },
      { id: 'general-manager', label: 'General Manager', keywords: ['P&L ownership', 'Business development', 'Team leadership', 'Operations', 'Revenue growth'] },
    ],
  },
  {
    id: 'sales-marketing',
    label: 'Sales & Marketing',
    description: 'Revenue, growth, marketing, and customer-facing roles.',
    recommendedTemplates: ['modern', 'creative', 'consultant'],
    roles: [
      { id: 'sales-executive', label: 'Sales Executive', keywords: ['Lead generation', 'Cold calling', 'CRM', 'Pipeline management', 'Target achievement'] },
      { id: 'account-executive', label: 'Account Executive', keywords: ['B2B sales', 'Quota attainment', 'Salesforce', 'Negotiation', 'Account management'] },
      { id: 'sales-manager', label: 'Sales Manager', keywords: ['Team leadership', 'Revenue targets', 'Sales strategy', 'Forecasting', 'Channel management'] },
      { id: 'marketing-manager', label: 'Marketing Manager', keywords: ['Campaign management', 'Brand strategy', 'Budget management', 'Marketing analytics', 'GTM'] },
      { id: 'digital-marketing-specialist', label: 'Digital Marketing Specialist', keywords: ['Google Ads', 'Meta Ads', 'SEO', 'Email marketing', 'Google Analytics'] },
      { id: 'seo-specialist', label: 'SEO Specialist', keywords: ['Keyword research', 'On-page SEO', 'Link building', 'Google Search Console', 'Technical SEO'] },
      { id: 'performance-marketer', label: 'Performance Marketer', keywords: ['ROAS', 'Google Ads', 'Meta Ads', 'Attribution', 'Landing page optimization'] },
      { id: 'content-writer', label: 'Content Writer / Copywriter', keywords: ['SEO writing', 'Copywriting', 'Content strategy', 'Editing', 'CMS'] },
      { id: 'brand-manager', label: 'Brand Manager', keywords: ['Brand positioning', 'Campaign planning', 'Market research', 'Agency management', 'Brand guidelines'] },
      { id: 'growth-marketer', label: 'Growth Marketer', keywords: ['Funnel optimization', 'A/B testing', 'Retention', 'Product analytics', 'Experimentation'] },
    ],
  },
  {
    id: 'creative-design',
    label: 'Creative & Design',
    description: 'UX, graphic, product, motion design, and visual arts.',
    recommendedTemplates: ['creative', 'modern', 'minimal'],
    roles: [
      { id: 'graphic-designer', label: 'Graphic Designer', keywords: ['Adobe Photoshop', 'Illustrator', 'Branding', 'Typography', 'Print & digital'] },
      { id: 'ux-designer', label: 'UX Designer', keywords: ['User research', 'Wireframing', 'Figma', 'Usability testing', 'Information architecture'] },
      { id: 'ui-designer', label: 'UI Designer', keywords: ['Figma', 'Design systems', 'Prototyping', 'Visual design', 'Responsive design'] },
      { id: 'product-designer', label: 'Product Designer', keywords: ['End-to-end design', 'Figma', 'User research', 'Design systems', 'Cross-functional collaboration'] },
      { id: 'motion-designer', label: 'Motion Designer', keywords: ['After Effects', 'Animation', 'Motion graphics', 'Storyboarding', 'Video editing'] },
      { id: 'illustrator', label: 'Illustrator', keywords: ['Digital illustration', 'Procreate', 'Character design', 'Adobe Illustrator', 'Visual storytelling'] },
      { id: 'photographer', label: 'Photographer', keywords: ['Photo editing', 'Lightroom', 'Studio lighting', 'Composition', 'Client shoots'] },
      { id: 'video-editor', label: 'Video Editor', keywords: ['Premiere Pro', 'After Effects', 'Colour grading', 'Sound design', 'Storytelling'] },
      { id: 'art-director', label: 'Art Director', keywords: ['Creative direction', 'Brand campaigns', 'Team leadership', 'Concept development', 'Client presentations'] },
    ],
  },
  {
    id: 'human-resources',
    label: 'Human Resources',
    description: 'Recruiting, HR business partners, L&D, and people ops.',
    recommendedTemplates: ['modern', 'classic', 'consultant'],
    roles: [
      { id: 'hr-generalist', label: 'HR Generalist', keywords: ['Onboarding', 'HR policies', 'Employee relations', 'HRIS', 'Payroll coordination'] },
      { id: 'recruiter', label: 'Technical / Corporate Recruiter', keywords: ['Sourcing', 'ATS', 'Interview coordination', 'Offer negotiation', 'Talent pipelines'] },
      { id: 'hr-business-partner', label: 'HR Business Partner', keywords: ['Employee relations', 'Performance management', 'Org design', 'Stakeholder partnering', 'Talent strategy'] },
      { id: 'learning-development-manager', label: 'Learning & Development Manager', keywords: ['Training needs analysis', 'Program design', 'LMS', 'Facilitation', 'Learning evaluation'] },
      { id: 'compensation-benefits-analyst', label: 'Compensation & Benefits Analyst', keywords: ['Salary benchmarking', 'Job evaluation', 'Benefits administration', 'Compensation surveys', 'Excel'] },
      { id: 'hr-director', label: 'HR Director / CHRO', keywords: ['HR strategy', 'Workforce planning', 'Leadership development', 'Culture', 'Executive advising'] },
    ],
  },
  {
    id: 'science-research',
    label: 'Science & Research',
    description: 'Applied and academic research in sciences.',
    recommendedTemplates: ['academic', 'technical', 'classic'],
    roles: [
      { id: 'research-scientist', label: 'Research Scientist', keywords: ['Experimental design', 'Data analysis', 'Publications', 'Grant writing', 'Lab techniques'] },
      { id: 'biologist', label: 'Biologist', keywords: ['Molecular biology', 'PCR', 'Cell culture', 'Microscopy', 'Data analysis'] },
      { id: 'chemist', label: 'Chemist', keywords: ['HPLC', 'Spectroscopy', 'Synthesis', 'Analytical methods', 'GLP'] },
      { id: 'physicist', label: 'Physicist', keywords: ['Modelling & simulation', 'Data analysis', 'Python/MATLAB', 'Instrumentation', 'Publications'] },
      { id: 'lab-manager', label: 'Lab Manager', keywords: ['Lab operations', 'Inventory management', 'Safety compliance', 'Equipment maintenance', 'Team supervision'] },
      { id: 'data-analyst', label: 'Data Analyst', keywords: ['SQL', 'Excel', 'Power BI/Tableau', 'Python', 'Data visualization'] },
      { id: 'statistician', label: 'Statistician', keywords: ['Statistical modelling', 'R', 'Hypothesis testing', 'Survey design', 'SAS'] },
    ],
  },
  {
    id: 'manufacturing-supply-chain',
    label: 'Manufacturing & Supply Chain',
    description: 'Production, quality, procurement, and logistics.',
    recommendedTemplates: ['classic', 'technical', 'modern'],
    roles: [
      { id: 'production-manager', label: 'Production Manager', keywords: ['Production planning', 'Lean manufacturing', 'OEE', 'Team management', 'Quality systems'] },
      { id: 'quality-engineer', label: 'Quality Engineer', keywords: ['ISO 9001', 'Root cause analysis', 'CAPA', 'SPC', 'Audits'] },
      { id: 'supply-chain-analyst', label: 'Supply Chain Analyst', keywords: ['Demand forecasting', 'Inventory optimization', 'SAP', 'Excel', 'S&OP'] },
      { id: 'procurement-manager', label: 'Procurement Manager', keywords: ['Strategic sourcing', 'Vendor negotiation', 'Cost reduction', 'Contract management', 'SAP MM'] },
      { id: 'logistics-coordinator', label: 'Logistics Coordinator', keywords: ['Shipment tracking', 'Freight coordination', 'Documentation', 'Carrier management', 'TMS'] },
      { id: 'warehouse-manager', label: 'Warehouse Manager', keywords: ['Inventory control', 'WMS', 'Team supervision', 'Space optimization', 'Dispatch planning'] },
    ],
  },
  {
    id: 'hospitality-tourism',
    label: 'Hospitality & Tourism',
    description: 'Hotels, restaurants, travel, and event management.',
    recommendedTemplates: ['modern', 'creative', 'classic'],
    roles: [
      { id: 'hotel-manager', label: 'Hotel Manager', keywords: ['Guest experience', 'Revenue management', 'Team leadership', 'Operations', 'OTA management'] },
      { id: 'chef', label: 'Chef / Culinary Lead', keywords: ['Menu planning', 'Food costing', 'Kitchen management', 'HACCP', 'Team training'] },
      { id: 'event-manager', label: 'Event Manager', keywords: ['Event planning', 'Vendor management', 'Budgeting', 'Client coordination', 'On-site execution'] },
      { id: 'travel-consultant', label: 'Travel Consultant', keywords: ['Itinerary planning', 'GDS (Amadeus/Galileo)', 'Visa processing', 'Client servicing', 'Bookings'] },
      { id: 'food-beverage-manager', label: 'Food & Beverage Manager', keywords: ['F&B operations', 'Cost control', 'Menu engineering', 'Staff training', 'Guest satisfaction'] },
      { id: 'front-office-manager', label: 'Front Office Manager', keywords: ['Front desk operations', 'PMS (Opera)', 'Guest relations', 'Upselling', 'Team scheduling'] },
    ],
  },
  {
    id: 'construction-real-estate',
    label: 'Construction & Real Estate',
    description: 'Architecture, site engineering, surveying, and property.',
    recommendedTemplates: ['classic', 'technical', 'consultant'],
    roles: [
      { id: 'architect', label: 'Architect', keywords: ['AutoCAD', 'Revit', 'Design development', 'Building codes', 'Client presentations'] },
      { id: 'site-engineer', label: 'Site Engineer', keywords: ['Site execution', 'Quantity estimation', 'Contractor coordination', 'Quality checks', 'Safety compliance'] },
      { id: 'project-engineer', label: 'Project Engineer (Construction)', keywords: ['Project scheduling', 'MS Project/Primavera', 'Cost tracking', 'Vendor coordination', 'Progress reporting'] },
      { id: 'real-estate-agent', label: 'Real Estate Agent', keywords: ['Property sales', 'Client relationships', 'Negotiation', 'Market analysis', 'Site visits'] },
      { id: 'quantity-surveyor', label: 'Quantity Surveyor', keywords: ['BOQ preparation', 'Cost estimation', 'Tender analysis', 'Rate analysis', 'Billing'] },
      { id: 'urban-planner', label: 'Urban Planner', keywords: ['Master planning', 'GIS', 'Zoning regulations', 'Impact assessment', 'Stakeholder consultation'] },
    ],
  },
  {
    id: 'government-public-sector',
    label: 'Government & Public Sector',
    description: 'Policy, civil service, defense, and public administration.',
    recommendedTemplates: ['classic', 'consultant', 'academic'],
    roles: [
      { id: 'policy-analyst', label: 'Policy Analyst', keywords: ['Policy research', 'Stakeholder analysis', 'Report writing', 'Data analysis', 'Briefing notes'] },
      { id: 'civil-servant', label: 'Civil Servant', keywords: ['Public administration', 'Scheme implementation', 'File management', 'Inter-departmental coordination', 'Report drafting'] },
      { id: 'public-administrator', label: 'Public Administrator', keywords: ['Program management', 'Budget administration', 'Governance', 'Public grievances', 'Team supervision'] },
      { id: 'defense-officer', label: 'Defense Officer', keywords: ['Leadership', 'Operations planning', 'Logistics', 'Training & discipline', 'Crisis management'] },
      { id: 'diplomat', label: 'Diplomat / Foreign Service Officer', keywords: ['Bilateral relations', 'Negotiation', 'Protocol', 'Political reporting', 'Consular affairs'] },
    ],
  },
  {
    id: 'media-communications',
    label: 'Media & Communications',
    description: 'Journalism, PR, communications, and social media.',
    recommendedTemplates: ['creative', 'modern', 'minimal'],
    roles: [
      { id: 'journalist', label: 'Journalist', keywords: ['News reporting', 'Interviewing', 'Fact-checking', 'Feature writing', 'Deadline management'] },
      { id: 'editor', label: 'Editor', keywords: ['Copy editing', 'Editorial planning', 'Style guides', 'Team management', 'Proofreading'] },
      { id: 'public-relations-manager', label: 'Public Relations Manager', keywords: ['Media relations', 'Press releases', 'Crisis communication', 'Brand reputation', 'Journalist outreach'] },
      { id: 'social-media-manager', label: 'Social Media Manager', keywords: ['Content calendars', 'Community management', 'Instagram/LinkedIn', 'Analytics', 'Influencer collaboration'] },
      { id: 'communications-specialist', label: 'Communications Specialist', keywords: ['Internal communications', 'Content creation', 'Messaging', 'Newsletters', 'Stakeholder communication'] },
      { id: 'broadcast-producer', label: 'Broadcast Producer', keywords: ['Show production', 'Scripting', 'Live broadcast', 'Guest coordination', 'Edit supervision'] },
    ],
  },
  {
    id: 'retail-ecommerce',
    label: 'Retail & E-commerce',
    description: 'Store operations, merchandising, buying, and online retail.',
    recommendedTemplates: ['modern', 'classic', 'creative'],
    roles: [
      { id: 'store-manager', label: 'Store Manager', keywords: ['Store operations', 'Sales targets', 'Inventory management', 'Team leadership', 'Visual standards'] },
      { id: 'buyer', label: 'Buyer / Merchandiser', keywords: ['Range planning', 'Vendor negotiation', 'OTB planning', 'Trend analysis', 'Margin management'] },
      { id: 'visual-merchandiser', label: 'Visual Merchandiser', keywords: ['Window displays', 'Planograms', 'Store layouts', 'Brand guidelines', 'Seasonal setups'] },
      { id: 'ecommerce-manager', label: 'E-commerce Manager', keywords: ['Marketplace management', 'Conversion optimization', 'Catalogue management', 'Performance marketing', 'Amazon/Flipkart'] },
      { id: 'category-manager', label: 'Category Manager', keywords: ['Category strategy', 'Assortment planning', 'Pricing', 'Vendor management', 'P&L'] },
    ],
  },
  {
    id: 'logistics-transport',
    label: 'Logistics & Transport',
    description: 'Fleet, shipping, aviation, and ground transport.',
    recommendedTemplates: ['classic', 'modern', 'technical'],
    roles: [
      { id: 'fleet-manager', label: 'Fleet Manager', keywords: ['Fleet operations', 'Route planning', 'Vehicle maintenance', 'Driver management', 'Fuel efficiency'] },
      { id: 'logistics-manager', label: 'Logistics Manager', keywords: ['3PL management', 'Warehouse operations', 'Freight negotiation', 'SLA management', 'Cost optimization'] },
      { id: 'pilot', label: 'Pilot', keywords: ['Flight operations', 'DGCA regulations', 'CRM', 'Flight planning', 'Safety procedures'] },
      { id: 'cabin-crew', label: 'Cabin Crew', keywords: ['In-flight service', 'Safety procedures', 'Passenger handling', 'Emergency response', 'Grooming standards'] },
      { id: 'shipping-coordinator', label: 'Shipping Coordinator', keywords: ['Export documentation', 'Customs clearance', 'Bill of lading', 'Freight forwarding', 'Incoterms'] },
    ],
  },
  {
    id: 'agriculture-environment',
    label: 'Agriculture & Environment',
    description: 'Agronomy, forestry, sustainability, and environmental science.',
    recommendedTemplates: ['classic', 'academic', 'modern'],
    roles: [
      { id: 'agronomist', label: 'Agronomist', keywords: ['Crop management', 'Soil testing', 'Farmer advisory', 'Pest management', 'Yield improvement'] },
      { id: 'environmental-scientist', label: 'Environmental Scientist', keywords: ['EIA', 'Environmental monitoring', 'Compliance', 'GIS', 'Sustainability reporting'] },
      { id: 'forester', label: 'Forester', keywords: ['Forest management', 'Plantation planning', 'Wildlife conservation', 'GIS mapping', 'Field surveys'] },
      { id: 'sustainability-manager', label: 'Sustainability Manager', keywords: ['ESG reporting', 'Carbon accounting', 'GRI standards', 'Stakeholder engagement', 'Net-zero strategy'] },
      { id: 'horticulturist', label: 'Horticulturist', keywords: ['Nursery management', 'Landscape planning', 'Plant propagation', 'Irrigation', 'Pest control'] },
    ],
  },
  {
    id: 'non-profit-social-impact',
    label: 'Non-profit & Social Impact',
    description: 'NGO program management, fundraising, and social work.',
    recommendedTemplates: ['modern', 'classic', 'minimal'],
    roles: [
      { id: 'program-manager-ngo', label: 'Program Manager (NGO)', keywords: ['Program design', 'Donor reporting', 'M&E', 'Budget management', 'Field operations'] },
      { id: 'fundraiser', label: 'Fundraiser / Development Officer', keywords: ['Donor cultivation', 'Grant proposals', 'CSR partnerships', 'Fundraising campaigns', 'Donor CRM'] },
      { id: 'social-worker', label: 'Social Worker', keywords: ['Case management', 'Community engagement', 'Counselling', 'Field visits', 'Documentation'] },
      { id: 'community-organizer', label: 'Community Organizer', keywords: ['Community mobilization', 'Volunteer management', 'Campaign organizing', 'Local partnerships', 'Advocacy'] },
    ],
  },
];

export const PROFESSION_INDUSTRY_IDS: readonly string[] = PROFESSION_INDUSTRIES.map(
  (industry) => industry.id,
);
export type ProfessionIndustryId = string;

export function getIndustryById(industryId: string): ProfessionIndustry | undefined {
  return PROFESSION_INDUSTRIES.find((industry) => industry.id === industryId);
}

export function getRoleById(industryId: string, roleId: string): ProfessionRole | undefined {
  return getIndustryById(industryId)?.roles.find((role) => role.id === roleId);
}

/**
 * Pick template ids recommended for an industry. Falls back to the default
 * six ATS templates when no industry is selected.
 */
export function templatesForIndustry(industryId: string | undefined | null): TemplateCatalogId[] | null {
  if (!industryId) return null;
  const industry = getIndustryById(industryId);
  return industry ? [...industry.recommendedTemplates] : null;
}
