/**
 * Industry taxonomy for the Quantum Career Navigator.
 *
 * The app is used by people from very different professions. We keep a small
 * curated catalog here so downstream features (recommendations, resume tone,
 * ATS keyword hints) can adapt without hard-coding IT assumptions everywhere.
 *
 * Shape notes:
 *  - Each industry lists roles and a "skillClusters" map: cluster -> ranked
 *    skill list. Clusters let the quantum engine simulate interference
 *    between related skills (e.g. React boosts TypeScript because they
 *    share a "frontend" cluster).
 *  - Adjacencies let us recommend pivots across industries (e.g. a sales
 *    engineer bridging IT and Sales).
 */

export type IndustryId =
  | 'it'
  | 'healthcare'
  | 'education'
  | 'bpo'
  | 'sales'
  | 'finance'
  | 'creative'
  | 'engineering'
  | 'hospitality'
  | 'legal';

export type IndustryRole = {
  id: string;
  title: string;
  seniority: ('entry' | 'mid' | 'senior' | 'lead')[];
  coreSkills: string[];
};

export type Industry = {
  id: IndustryId;
  label: string;
  tagline: string;
  roles: IndustryRole[];
  skillClusters: Record<string, string[]>;
  adjacent: IndustryId[];
};

export const INDUSTRIES: Industry[] = [
  {
    id: 'it',
    label: 'Information Technology',
    tagline: 'Software, data, cloud and platform engineering.',
    roles: [
      {
        id: 'frontend-engineer',
        title: 'Frontend Engineer',
        seniority: ['entry', 'mid', 'senior', 'lead'],
        coreSkills: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React'],
      },
      {
        id: 'backend-engineer',
        title: 'Backend Engineer',
        seniority: ['entry', 'mid', 'senior', 'lead'],
        coreSkills: ['Node.js', 'SQL', 'REST APIs', 'Docker'],
      },
      {
        id: 'data-engineer',
        title: 'Data Engineer',
        seniority: ['mid', 'senior', 'lead'],
        coreSkills: ['Python', 'SQL', 'Airflow', 'Spark'],
      },
      {
        id: 'devops-engineer',
        title: 'DevOps / SRE',
        seniority: ['mid', 'senior', 'lead'],
        coreSkills: ['Linux', 'Docker', 'Kubernetes', 'Terraform'],
      },
    ],
    skillClusters: {
      frontend: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Accessibility'],
      backend: ['Node.js', 'Python', 'Go', 'SQL', 'REST APIs', 'GraphQL'],
      cloud: ['AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform'],
      data: ['SQL', 'Python', 'Pandas', 'Airflow', 'Spark', 'dbt'],
      ai: ['Python', 'PyTorch', 'LLMs', 'Prompt Engineering', 'Vector DBs'],
    },
    adjacent: ['sales', 'finance', 'engineering'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare & Medicine',
    tagline: 'Doctors, nurses, allied health, and clinical research.',
    roles: [
      {
        id: 'physician',
        title: 'Physician / Doctor',
        seniority: ['mid', 'senior', 'lead'],
        coreSkills: ['Patient Care', 'Diagnosis', 'EMR', 'Clinical Notes'],
      },
      {
        id: 'registered-nurse',
        title: 'Registered Nurse',
        seniority: ['entry', 'mid', 'senior'],
        coreSkills: ['Patient Care', 'Triage', 'IV Therapy', 'EMR'],
      },
      {
        id: 'clinical-researcher',
        title: 'Clinical Researcher',
        seniority: ['mid', 'senior'],
        coreSkills: ['GCP (Good Clinical Practice)', 'Protocol Design', 'Biostatistics'],
      },
    ],
    skillClusters: {
      clinical: ['Patient Care', 'Triage', 'Diagnosis', 'Clinical Notes', 'Bedside Manner'],
      admin: ['EMR', 'HIPAA', 'Medical Billing', 'ICD-10 Coding'],
      research: ['Protocol Design', 'Biostatistics', 'Literature Review', 'IRB Submissions'],
      telehealth: ['Telemedicine Platforms', 'Remote Monitoring', 'Digital Health Records'],
    },
    adjacent: ['education', 'it'],
  },
  {
    id: 'education',
    label: 'Education & Academia',
    tagline: 'Teachers, lecturers, professors, trainers and L&D.',
    roles: [
      {
        id: 'k12-teacher',
        title: 'K-12 Teacher',
        seniority: ['entry', 'mid', 'senior'],
        coreSkills: ['Classroom Management', 'Lesson Planning', 'Assessment Design'],
      },
      {
        id: 'university-lecturer',
        title: 'University Lecturer',
        seniority: ['mid', 'senior', 'lead'],
        coreSkills: ['Curriculum Design', 'Academic Research', 'Student Mentorship'],
      },
      {
        id: 'corporate-trainer',
        title: 'Corporate Trainer',
        seniority: ['mid', 'senior'],
        coreSkills: ['Instructional Design', 'Facilitation', 'Needs Analysis'],
      },
    ],
    skillClusters: {
      pedagogy: ['Lesson Planning', 'Curriculum Design', 'Assessment Design', 'Differentiation'],
      digital: ['LMS (Moodle, Canvas)', 'EdTech Tools', 'Blended Learning', 'Video Lessons'],
      research: ['Academic Writing', 'Peer Review', 'Grant Writing'],
      softskills: ['Classroom Management', 'Mentorship', 'Public Speaking'],
    },
    adjacent: ['it', 'healthcare'],
  },
  {
    id: 'bpo',
    label: 'BPO & Customer Support',
    tagline: 'Voice, chat, back-office, and technical support.',
    roles: [
      {
        id: 'customer-support-assoc',
        title: 'Customer Support Associate',
        seniority: ['entry', 'mid'],
        coreSkills: ['Active Listening', 'CRM Tools', 'Issue Resolution'],
      },
      {
        id: 'technical-support-eng',
        title: 'Technical Support Engineer',
        seniority: ['entry', 'mid', 'senior'],
        coreSkills: ['Troubleshooting', 'Ticketing Systems', 'Networking Basics'],
      },
      {
        id: 'team-lead',
        title: 'Operations Team Lead',
        seniority: ['senior', 'lead'],
        coreSkills: ['SLA Management', 'Coaching', 'Quality Audits'],
      },
    ],
    skillClusters: {
      voice: ['Active Listening', 'Voice Modulation', 'Accent Neutralization', 'Empathy'],
      tools: ['CRM Tools', 'Ticketing Systems', 'Knowledge Base Mgmt'],
      leadership: ['SLA Management', 'Coaching', 'Quality Audits', 'Shift Scheduling'],
    },
    adjacent: ['sales', 'it'],
  },
  {
    id: 'sales',
    label: 'Sales & Business Development',
    tagline: 'Inside sales, field sales, account management and BD.',
    roles: [
      {
        id: 'sdr',
        title: 'Sales Development Rep (SDR)',
        seniority: ['entry', 'mid'],
        coreSkills: ['Cold Outreach', 'Lead Qualification', 'CRM (HubSpot, Salesforce)'],
      },
      {
        id: 'account-executive',
        title: 'Account Executive',
        seniority: ['mid', 'senior'],
        coreSkills: ['Discovery Calls', 'Solution Selling', 'Negotiation'],
      },
      {
        id: 'sales-manager',
        title: 'Sales Manager',
        seniority: ['senior', 'lead'],
        coreSkills: ['Pipeline Mgmt', 'Forecasting', 'Coaching'],
      },
    ],
    skillClusters: {
      outbound: ['Cold Outreach', 'Lead Qualification', 'Email Sequencing'],
      closing: ['Discovery Calls', 'Negotiation', 'Objection Handling'],
      tools: ['CRM (HubSpot, Salesforce)', 'Sales Navigator', 'Outreach.io'],
      leadership: ['Pipeline Mgmt', 'Forecasting', 'Quota Planning'],
    },
    adjacent: ['bpo', 'it', 'finance'],
  },
  {
    id: 'finance',
    label: 'Finance & Accounting',
    tagline: 'Accounting, FP&A, audit, banking and fintech.',
    roles: [
      {
        id: 'accountant',
        title: 'Accountant',
        seniority: ['entry', 'mid', 'senior'],
        coreSkills: ['GAAP', 'Reconciliation', 'Journal Entries', 'Excel'],
      },
      {
        id: 'financial-analyst',
        title: 'Financial Analyst',
        seniority: ['mid', 'senior'],
        coreSkills: ['Financial Modeling', 'Forecasting', 'Excel', 'SQL'],
      },
    ],
    skillClusters: {
      core: ['GAAP', 'IFRS', 'Reconciliation', 'Journal Entries'],
      analytics: ['Excel', 'SQL', 'Power BI', 'Financial Modeling'],
      compliance: ['SOX', 'Audit', 'Risk Assessment'],
    },
    adjacent: ['sales', 'it'],
  },
  {
    id: 'creative',
    label: 'Creative & Design',
    tagline: 'Graphic design, UX, content and marketing creative.',
    roles: [
      {
        id: 'ux-designer',
        title: 'UX / Product Designer',
        seniority: ['entry', 'mid', 'senior', 'lead'],
        coreSkills: ['Figma', 'User Research', 'Wireframing', 'Prototyping'],
      },
      {
        id: 'graphic-designer',
        title: 'Graphic Designer',
        seniority: ['entry', 'mid', 'senior'],
        coreSkills: ['Adobe Illustrator', 'Photoshop', 'Typography', 'Brand Systems'],
      },
    ],
    skillClusters: {
      tools: ['Figma', 'Adobe Illustrator', 'Photoshop', 'After Effects'],
      research: ['User Research', 'Usability Testing', 'Journey Mapping'],
      craft: ['Typography', 'Color Theory', 'Brand Systems', 'Illustration'],
    },
    adjacent: ['it', 'sales'],
  },
  {
    id: 'engineering',
    label: 'Engineering (Non-IT)',
    tagline: 'Mechanical, civil, electrical, and manufacturing.',
    roles: [
      {
        id: 'mechanical-eng',
        title: 'Mechanical Engineer',
        seniority: ['entry', 'mid', 'senior'],
        coreSkills: ['AutoCAD', 'SolidWorks', 'FEA', 'Manufacturing Processes'],
      },
      {
        id: 'civil-eng',
        title: 'Civil Engineer',
        seniority: ['entry', 'mid', 'senior'],
        coreSkills: ['AutoCAD', 'STAAD.Pro', 'Site Supervision'],
      },
    ],
    skillClusters: {
      cad: ['AutoCAD', 'SolidWorks', 'Revit', 'CATIA'],
      analysis: ['FEA', 'CFD', 'Tolerance Analysis'],
      ops: ['Site Supervision', 'Safety Compliance', 'Project Scheduling'],
    },
    adjacent: ['it'],
  },
  {
    id: 'hospitality',
    label: 'Hospitality & Services',
    tagline: 'Hotels, restaurants, travel and events.',
    roles: [
      {
        id: 'hotel-manager',
        title: 'Hotel Manager',
        seniority: ['mid', 'senior', 'lead'],
        coreSkills: ['Guest Relations', 'P&L Management', 'Staff Training'],
      },
      {
        id: 'chef',
        title: 'Chef / Kitchen Lead',
        seniority: ['mid', 'senior'],
        coreSkills: ['Menu Design', 'Food Safety', 'Kitchen Ops'],
      },
    ],
    skillClusters: {
      ops: ['Guest Relations', 'P&L Management', 'Inventory', 'Staff Training'],
      culinary: ['Menu Design', 'Food Safety', 'Plating', 'Sourcing'],
    },
    adjacent: ['sales', 'bpo'],
  },
  {
    id: 'legal',
    label: 'Legal',
    tagline: 'Corporate, litigation, compliance and paralegal.',
    roles: [
      {
        id: 'corporate-lawyer',
        title: 'Corporate Lawyer',
        seniority: ['mid', 'senior', 'lead'],
        coreSkills: ['Contract Drafting', 'Due Diligence', 'Regulatory Filings'],
      },
      {
        id: 'paralegal',
        title: 'Paralegal',
        seniority: ['entry', 'mid'],
        coreSkills: ['Legal Research', 'Document Review', 'Case Management'],
      },
    ],
    skillClusters: {
      practice: ['Contract Drafting', 'Due Diligence', 'Litigation Support'],
      research: ['Legal Research', 'Case Law Analysis', 'Regulatory Filings'],
    },
    adjacent: ['finance'],
  },
];

export function getIndustry(id: IndustryId): Industry | undefined {
  return INDUSTRIES.find((i) => i.id === id);
}

export function listIndustryIds(): IndustryId[] {
  return INDUSTRIES.map((i) => i.id);
}

export function findRole(industryId: IndustryId, roleId: string): IndustryRole | undefined {
  return getIndustry(industryId)?.roles.find((r) => r.id === roleId);
}

/**
 * Flat list of every skill known across every industry. Order is industry
 * declaration order then cluster order — deterministic so tests can pin it.
 */
export function allKnownSkills(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const industry of INDUSTRIES) {
    for (const skills of Object.values(industry.skillClusters)) {
      for (const skill of skills) {
        if (!seen.has(skill)) {
          seen.add(skill);
          out.push(skill);
        }
      }
    }
  }
  return out;
}
