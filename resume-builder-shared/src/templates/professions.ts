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
      { id: 'full-stack-engineer', label: 'Full Stack Engineer' },
      { id: 'mobile-engineer', label: 'Mobile Engineer', keywords: ['iOS', 'Android', 'React Native'] },
      { id: 'devops-engineer', label: 'DevOps / Platform Engineer', keywords: ['Kubernetes', 'CI/CD', 'AWS'] },
      { id: 'site-reliability-engineer', label: 'Site Reliability Engineer' },
      { id: 'data-engineer', label: 'Data Engineer', keywords: ['Spark', 'Airflow', 'Snowflake'] },
      { id: 'data-scientist', label: 'Data Scientist', keywords: ['Python', 'ML', 'Statistics'] },
      { id: 'machine-learning-engineer', label: 'Machine Learning Engineer' },
      { id: 'ai-engineer', label: 'AI Engineer', keywords: ['LLMs', 'RAG', 'Agents'] },
      { id: 'qa-engineer', label: 'QA / Automation Engineer' },
      { id: 'security-engineer', label: 'Security Engineer' },
      { id: 'solutions-architect', label: 'Solutions Architect' },
      { id: 'engineering-manager', label: 'Engineering Manager' },
    ],
  },
  {
    id: 'ai-machine-learning',
    label: 'AI & Machine Learning',
    description:
      'Applied AI, agentic systems, LLM engineering, MLOps, and AI product roles.',
    recommendedTemplates: ['technical', 'modern', 'classic'],
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
      { id: 'mechanical-engineer', label: 'Mechanical Engineer' },
      { id: 'electrical-engineer', label: 'Electrical Engineer' },
      { id: 'civil-engineer', label: 'Civil Engineer' },
      { id: 'chemical-engineer', label: 'Chemical Engineer' },
      { id: 'industrial-engineer', label: 'Industrial Engineer' },
      { id: 'aerospace-engineer', label: 'Aerospace Engineer' },
      { id: 'automotive-engineer', label: 'Automotive Engineer' },
      { id: 'biomedical-engineer', label: 'Biomedical Engineer' },
      { id: 'petroleum-engineer', label: 'Petroleum Engineer' },
      { id: 'structural-engineer', label: 'Structural Engineer' },
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare & Life Sciences',
    description: 'Clinical, nursing, pharmacy, and life-sciences roles.',
    recommendedTemplates: ['healthcare', 'medical-coder', 'classic', 'consultant'],
    roles: [
      { id: 'physician', label: 'Physician / Doctor' },
      { id: 'registered-nurse', label: 'Registered Nurse' },
      { id: 'nurse-practitioner', label: 'Nurse Practitioner' },
      { id: 'pharmacist', label: 'Pharmacist' },
      { id: 'physiotherapist', label: 'Physiotherapist' },
      { id: 'dentist', label: 'Dentist' },
      { id: 'medical-laboratory-technician', label: 'Medical Lab Technician' },
      {
        id: 'medical-coder',
        label: 'Medical Coder / Billing Specialist',
        keywords: ['ICD-10', 'CPT', 'HCPCS', 'CPC', 'Medical Records', 'EHR', 'Claims', 'HIPAA'],
      },
      { id: 'radiology-technician', label: 'Radiology Technician' },
      { id: 'healthcare-administrator', label: 'Healthcare Administrator' },
      { id: 'clinical-research-associate', label: 'Clinical Research Associate' },
      { id: 'public-health-specialist', label: 'Public Health Specialist' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance & Accounting',
    description: 'Banking, investing, audit, and corporate finance.',
    recommendedTemplates: ['modern', 'consultant', 'classic'],
    roles: [
      { id: 'financial-analyst', label: 'Financial Analyst' },
      { id: 'investment-banker', label: 'Investment Banker' },
      { id: 'accountant', label: 'Accountant' },
      { id: 'auditor', label: 'Auditor' },
      { id: 'chartered-accountant', label: 'Chartered Accountant (CA)' },
      { id: 'tax-consultant', label: 'Tax Consultant' },
      { id: 'risk-analyst', label: 'Risk Analyst' },
      { id: 'credit-analyst', label: 'Credit Analyst' },
      { id: 'portfolio-manager', label: 'Portfolio Manager' },
      { id: 'cfo', label: 'CFO / Finance Leader' },
      { id: 'actuary', label: 'Actuary' },
    ],
  },
  {
    id: 'legal',
    label: 'Legal',
    description: 'Litigation, corporate counsel, compliance, and paralegal work.',
    recommendedTemplates: ['classic', 'modern', 'consultant'],
    roles: [
      { id: 'lawyer', label: 'Lawyer / Advocate' },
      { id: 'corporate-counsel', label: 'Corporate Counsel' },
      { id: 'paralegal', label: 'Paralegal' },
      { id: 'compliance-officer', label: 'Compliance Officer' },
      { id: 'contracts-manager', label: 'Contracts Manager' },
      { id: 'legal-researcher', label: 'Legal Researcher' },
      { id: 'intellectual-property-attorney', label: 'IP Attorney' },
    ],
  },
  {
    id: 'education',
    label: 'Education & Academia',
    description: 'Teaching, research, and education administration.',
    recommendedTemplates: ['academic', 'classic', 'minimal'],
    roles: [
      { id: 'school-teacher', label: 'School Teacher' },
      { id: 'college-lecturer', label: 'College Lecturer' },
      { id: 'professor', label: 'Professor' },
      { id: 'research-scholar', label: 'Research Scholar / PhD Candidate' },
      { id: 'curriculum-designer', label: 'Curriculum Designer' },
      { id: 'education-administrator', label: 'Education Administrator' },
      { id: 'instructional-designer', label: 'Instructional Designer' },
    ],
  },
  {
    id: 'business-management',
    label: 'Business & Management',
    description: 'Product, project, program, and operations leadership.',
    recommendedTemplates: ['classic', 'modern', 'consultant'],
    roles: [
      { id: 'business-analyst', label: 'Business Analyst' },
      { id: 'product-manager', label: 'Product Manager' },
      { id: 'project-manager', label: 'Project Manager' },
      { id: 'program-manager', label: 'Program Manager' },
      { id: 'operations-manager', label: 'Operations Manager' },
      { id: 'management-consultant', label: 'Management Consultant' },
      { id: 'strategy-manager', label: 'Strategy Manager' },
      { id: 'general-manager', label: 'General Manager' },
    ],
  },
  {
    id: 'sales-marketing',
    label: 'Sales & Marketing',
    description: 'Revenue, growth, marketing, and customer-facing roles.',
    recommendedTemplates: ['modern', 'creative', 'consultant'],
    roles: [
      { id: 'sales-executive', label: 'Sales Executive' },
      { id: 'account-executive', label: 'Account Executive' },
      { id: 'sales-manager', label: 'Sales Manager' },
      { id: 'marketing-manager', label: 'Marketing Manager' },
      { id: 'digital-marketing-specialist', label: 'Digital Marketing Specialist' },
      { id: 'seo-specialist', label: 'SEO Specialist' },
      { id: 'performance-marketer', label: 'Performance Marketer' },
      { id: 'content-writer', label: 'Content Writer / Copywriter' },
      { id: 'brand-manager', label: 'Brand Manager' },
      { id: 'growth-marketer', label: 'Growth Marketer' },
    ],
  },
  {
    id: 'creative-design',
    label: 'Creative & Design',
    description: 'UX, graphic, product, motion design, and visual arts.',
    recommendedTemplates: ['creative', 'modern', 'minimal'],
    roles: [
      { id: 'graphic-designer', label: 'Graphic Designer' },
      { id: 'ux-designer', label: 'UX Designer' },
      { id: 'ui-designer', label: 'UI Designer' },
      { id: 'product-designer', label: 'Product Designer' },
      { id: 'motion-designer', label: 'Motion Designer' },
      { id: 'illustrator', label: 'Illustrator' },
      { id: 'photographer', label: 'Photographer' },
      { id: 'video-editor', label: 'Video Editor' },
      { id: 'art-director', label: 'Art Director' },
    ],
  },
  {
    id: 'human-resources',
    label: 'Human Resources',
    description: 'Recruiting, HR business partners, L&D, and people ops.',
    recommendedTemplates: ['modern', 'classic', 'consultant'],
    roles: [
      { id: 'hr-generalist', label: 'HR Generalist' },
      { id: 'recruiter', label: 'Technical / Corporate Recruiter' },
      { id: 'hr-business-partner', label: 'HR Business Partner' },
      { id: 'learning-development-manager', label: 'Learning & Development Manager' },
      { id: 'compensation-benefits-analyst', label: 'Compensation & Benefits Analyst' },
      { id: 'hr-director', label: 'HR Director / CHRO' },
    ],
  },
  {
    id: 'science-research',
    label: 'Science & Research',
    description: 'Applied and academic research in sciences.',
    recommendedTemplates: ['academic', 'technical', 'classic'],
    roles: [
      { id: 'research-scientist', label: 'Research Scientist' },
      { id: 'biologist', label: 'Biologist' },
      { id: 'chemist', label: 'Chemist' },
      { id: 'physicist', label: 'Physicist' },
      { id: 'lab-manager', label: 'Lab Manager' },
      { id: 'data-analyst', label: 'Data Analyst' },
      { id: 'statistician', label: 'Statistician' },
    ],
  },
  {
    id: 'manufacturing-supply-chain',
    label: 'Manufacturing & Supply Chain',
    description: 'Production, quality, procurement, and logistics.',
    recommendedTemplates: ['classic', 'technical', 'modern'],
    roles: [
      { id: 'production-manager', label: 'Production Manager' },
      { id: 'quality-engineer', label: 'Quality Engineer' },
      { id: 'supply-chain-analyst', label: 'Supply Chain Analyst' },
      { id: 'procurement-manager', label: 'Procurement Manager' },
      { id: 'logistics-coordinator', label: 'Logistics Coordinator' },
      { id: 'warehouse-manager', label: 'Warehouse Manager' },
    ],
  },
  {
    id: 'hospitality-tourism',
    label: 'Hospitality & Tourism',
    description: 'Hotels, restaurants, travel, and event management.',
    recommendedTemplates: ['modern', 'creative', 'classic'],
    roles: [
      { id: 'hotel-manager', label: 'Hotel Manager' },
      { id: 'chef', label: 'Chef / Culinary Lead' },
      { id: 'event-manager', label: 'Event Manager' },
      { id: 'travel-consultant', label: 'Travel Consultant' },
      { id: 'food-beverage-manager', label: 'Food & Beverage Manager' },
      { id: 'front-office-manager', label: 'Front Office Manager' },
    ],
  },
  {
    id: 'construction-real-estate',
    label: 'Construction & Real Estate',
    description: 'Architecture, site engineering, surveying, and property.',
    recommendedTemplates: ['classic', 'technical', 'consultant'],
    roles: [
      { id: 'architect', label: 'Architect' },
      { id: 'site-engineer', label: 'Site Engineer' },
      { id: 'project-engineer', label: 'Project Engineer (Construction)' },
      { id: 'real-estate-agent', label: 'Real Estate Agent' },
      { id: 'quantity-surveyor', label: 'Quantity Surveyor' },
      { id: 'urban-planner', label: 'Urban Planner' },
    ],
  },
  {
    id: 'government-public-sector',
    label: 'Government & Public Sector',
    description: 'Policy, civil service, defense, and public administration.',
    recommendedTemplates: ['classic', 'consultant', 'academic'],
    roles: [
      { id: 'policy-analyst', label: 'Policy Analyst' },
      { id: 'civil-servant', label: 'Civil Servant' },
      { id: 'public-administrator', label: 'Public Administrator' },
      { id: 'defense-officer', label: 'Defense Officer' },
      { id: 'diplomat', label: 'Diplomat / Foreign Service Officer' },
    ],
  },
  {
    id: 'media-communications',
    label: 'Media & Communications',
    description: 'Journalism, PR, communications, and social media.',
    recommendedTemplates: ['creative', 'modern', 'minimal'],
    roles: [
      { id: 'journalist', label: 'Journalist' },
      { id: 'editor', label: 'Editor' },
      { id: 'public-relations-manager', label: 'Public Relations Manager' },
      { id: 'social-media-manager', label: 'Social Media Manager' },
      { id: 'communications-specialist', label: 'Communications Specialist' },
      { id: 'broadcast-producer', label: 'Broadcast Producer' },
    ],
  },
  {
    id: 'retail-ecommerce',
    label: 'Retail & E-commerce',
    description: 'Store operations, merchandising, buying, and online retail.',
    recommendedTemplates: ['modern', 'classic', 'creative'],
    roles: [
      { id: 'store-manager', label: 'Store Manager' },
      { id: 'buyer', label: 'Buyer / Merchandiser' },
      { id: 'visual-merchandiser', label: 'Visual Merchandiser' },
      { id: 'ecommerce-manager', label: 'E-commerce Manager' },
      { id: 'category-manager', label: 'Category Manager' },
    ],
  },
  {
    id: 'logistics-transport',
    label: 'Logistics & Transport',
    description: 'Fleet, shipping, aviation, and ground transport.',
    recommendedTemplates: ['classic', 'modern', 'technical'],
    roles: [
      { id: 'fleet-manager', label: 'Fleet Manager' },
      { id: 'logistics-manager', label: 'Logistics Manager' },
      { id: 'pilot', label: 'Pilot' },
      { id: 'cabin-crew', label: 'Cabin Crew' },
      { id: 'shipping-coordinator', label: 'Shipping Coordinator' },
    ],
  },
  {
    id: 'agriculture-environment',
    label: 'Agriculture & Environment',
    description: 'Agronomy, forestry, sustainability, and environmental science.',
    recommendedTemplates: ['classic', 'academic', 'modern'],
    roles: [
      { id: 'agronomist', label: 'Agronomist' },
      { id: 'environmental-scientist', label: 'Environmental Scientist' },
      { id: 'forester', label: 'Forester' },
      { id: 'sustainability-manager', label: 'Sustainability Manager' },
      { id: 'horticulturist', label: 'Horticulturist' },
    ],
  },
  {
    id: 'non-profit-social-impact',
    label: 'Non-profit & Social Impact',
    description: 'NGO program management, fundraising, and social work.',
    recommendedTemplates: ['modern', 'classic', 'minimal'],
    roles: [
      { id: 'program-manager-ngo', label: 'Program Manager (NGO)' },
      { id: 'fundraiser', label: 'Fundraiser / Development Officer' },
      { id: 'social-worker', label: 'Social Worker' },
      { id: 'community-organizer', label: 'Community Organizer' },
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
