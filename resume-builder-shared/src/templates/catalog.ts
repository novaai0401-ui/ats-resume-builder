export type TemplateCatalogId =
  | 'classic'
  | 'modern'
  | 'executive'
  | 'technical'
  | 'minimal'
  | 'consultant'
  | 'academic'
  | 'healthcare'
  | 'creative';

export type TemplateCatalogItem = {
  id: TemplateCatalogId;
  name: string;
  description: string;
  tags: string[];
  recommendedFor?: string[];
  /** Industry ids (from professions.ts) this template is suited to. */
  industries?: string[];
  componentKey: TemplateCatalogId;
  isDefault?: boolean;
};

export const TEMPLATE_CATALOG: readonly TemplateCatalogItem[] = [
  {
    id: 'classic',
    name: 'Classic ATS',
    description: 'Single-column ATS-safe structure with bold section headers.',
    tags: ['ATS-safe', 'Single-column', 'Default'],
    recommendedFor: ['General professional resumes', 'High ATS compatibility'],
    industries: [
      'information-technology', 'engineering', 'finance', 'legal', 'education',
      'healthcare', 'human-resources', 'manufacturing-supply-chain',
      'construction-real-estate', 'government-public-sector',
      'logistics-transport', 'agriculture-environment', 'retail-ecommerce',
    ],
    componentKey: 'classic',
    isDefault: true,
  },
  {
    id: 'modern',
    name: 'Modern Professional',
    description: 'Clean modern spacing with subtle divider lines and ATS-safe semantics.',
    tags: ['ATS-safe', 'Modern (ATS-safe)'],
    recommendedFor: ['Product', 'Operations', 'Business-facing roles'],
    industries: [
      'business-management', 'sales-marketing', 'human-resources',
      'hospitality-tourism', 'retail-ecommerce', 'media-communications',
      'non-profit-social-impact', 'information-technology',
    ],
    componentKey: 'modern',
  },
  {
    id: 'executive',
    name: 'Executive Impact',
    description: 'Leadership-focused hierarchy with strong, results-first bullet structure.',
    tags: ['ATS-safe', 'Leadership'],
    recommendedFor: ['Senior IC', 'Manager', 'Director'],
    industries: [
      'business-management', 'finance', 'sales-marketing',
      'human-resources', 'government-public-sector', 'legal',
      'construction-real-estate',
    ],
    componentKey: 'executive',
  },
  {
    id: 'technical',
    name: 'Technical Compact',
    description: 'Dense but readable ATS-safe layout with grouped technical skills.',
    tags: ['ATS-safe', 'Engineering'],
    recommendedFor: ['Engineering', 'Data', 'Platform teams'],
    industries: [
      'information-technology', 'engineering', 'science-research',
      'manufacturing-supply-chain', 'logistics-transport',
      'construction-real-estate',
    ],
    componentKey: 'technical',
  },
  {
    id: 'minimal',
    name: 'Minimal Clean',
    description: 'Ultra-minimal recruiter-friendly format with precise section rhythm.',
    tags: ['ATS-safe', 'Minimal (ATS-safe)'],
    recommendedFor: ['Early-career', 'One-page resumes'],
    industries: [
      'education', 'creative-design', 'media-communications',
      'non-profit-social-impact', 'information-technology',
    ],
    componentKey: 'minimal',
  },
  {
    id: 'consultant',
    name: 'Consultant Clean',
    description: 'Crisp headings and metric-forward bullet readability in single-column flow.',
    tags: ['ATS-safe', 'Consulting style'],
    recommendedFor: ['Consulting', 'Strategy', 'Client delivery'],
    industries: [
      'business-management', 'finance', 'legal', 'information-technology',
    ],
    componentKey: 'consultant',
  },
  {
    id: 'academic',
    name: 'Academic CV',
    description: 'Publication-first layout with sections for research, teaching, and awards. ATS-safe single column.',
    tags: ['ATS-safe', 'Academic', 'Research'],
    recommendedFor: ['Researchers', 'Professors', 'PhD candidates', 'Scientists'],
    industries: [
      'education', 'science-research', 'government-public-sector',
      'agriculture-environment', 'healthcare',
    ],
    componentKey: 'academic',
  },
  {
    id: 'healthcare',
    name: 'Healthcare CV',
    description: 'Credentials-forward layout surfacing licensure, certifications, and clinical experience.',
    tags: ['ATS-safe', 'Healthcare', 'Clinical'],
    recommendedFor: ['Physicians', 'Nurses', 'Pharmacists', 'Allied health'],
    industries: ['healthcare', 'science-research'],
    componentKey: 'healthcare',
  },
  {
    id: 'creative',
    name: 'Creative Portfolio',
    description: 'Portfolio-friendly layout with highlighted links and visual rhythm while staying ATS-safe.',
    tags: ['ATS-safe', 'Creative', 'Portfolio'],
    recommendedFor: ['Designers', 'Writers', 'Marketers', 'Media'],
    industries: [
      'creative-design', 'media-communications', 'sales-marketing',
      'hospitality-tourism', 'retail-ecommerce',
    ],
    componentKey: 'creative',
  },
] as const;

export const DEFAULT_TEMPLATE_ID: TemplateCatalogId =
  (TEMPLATE_CATALOG.find((template) => template.isDefault)?.id as TemplateCatalogId | undefined) || 'classic';

const TEMPLATE_ID_SET = new Set<TemplateCatalogId>(TEMPLATE_CATALOG.map((template) => template.id));

const TEMPLATE_ID_ALIASES: Record<string, TemplateCatalogId> = {
  student: 'minimal',
  graduate: 'minimal',
  'graduate-starter': 'minimal',
  'modern-professional': 'modern',
  'classic-ats': 'classic',
  'executive-impact': 'executive',
  'technical-compact': 'technical',
  'minimal-clean': 'minimal',
  'consultant-clean': 'consultant',
  'academic-cv': 'academic',
  'healthcare-cv': 'healthcare',
  medical: 'healthcare',
  clinical: 'healthcare',
  'creative-portfolio': 'creative',
  designer: 'creative',
  portfolio: 'creative',
};

export function isTemplateCatalogId(value: string): value is TemplateCatalogId {
  return TEMPLATE_ID_SET.has(value as TemplateCatalogId);
}

export function resolveTemplateCatalogId(value: string, fallback: TemplateCatalogId = DEFAULT_TEMPLATE_ID): TemplateCatalogId {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  const candidate = TEMPLATE_ID_ALIASES[normalized] || normalized;
  if (isTemplateCatalogId(candidate)) {
    return candidate;
  }
  return fallback;
}
