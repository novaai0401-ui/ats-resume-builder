export type TemplateCatalogId =
  | 'classic'
  | 'modern'
  | 'technical'
  | 'minimal'
  | 'consultant'
  | 'academic'
  | 'healthcare'
  | 'creative'
  | 'sidebar-bold'
  | 'accent-header';

/**
 * How well a template actually survives ATS parsers. We previously
 * tagged 9 of 11 templates "ATS-safe" because they were single-column,
 * but real ATS systems (Workday, Greenhouse, iCIMS, Taleo, BambooHR)
 * differ in what they accept. Only a plain single-column layout with
 * standard section headers and no visual flourishes parses cleanly
 * across all of them.
 *
 *   - 'high':   Plain single-column, standard headings, plain bullets.
 *               Tested to parse cleanly across the major ATS systems.
 *   - 'medium': Single-column with light visual styling (dividers,
 *               subtle colour). Most ATS scrape it fine; a few may
 *               drop the styled bits but the content survives.
 *   - 'low':    Visual / multi-column / chip-style. Recruiters
 *               sourcing manually love these; ATS scrapers often
 *               miss sections or merge content incorrectly. Use only
 *               for direct networking or printed CVs.
 */
export type AtsSafetyLevel = 'high' | 'medium' | 'low';

/** TEMPLATE_SPEC §1.2 — render variants a template can implement. */
export type TemplateVariant = 'screen' | 'print' | 'ats-export';

/** TEMPLATE_SPEC §2.1 — layout family, drives recommendations + export rules. */
export type TemplateLayout = 'single-column' | 'multi-column' | 'sidebar';

/** Section keys a template can claim first-class styling for (mirrors AtsSectionKey minus 'header'). */
export type TemplateSectionKey =
  | 'summary' | 'skills' | 'experience' | 'projects'
  | 'achievements' | 'education' | 'certifications' | 'languages';

export type TemplateCatalogItem = {
  id: TemplateCatalogId;
  name: string;
  description: string;
  tags: string[];
  /** Honest ATS-survival classification — see AtsSafetyLevel docs. */
  atsSafety: AtsSafetyLevel;
  recommendedFor?: string[];
  /** Industry ids (from professions.ts) this template is suited to. */
  industries?: string[];
  componentKey: TemplateCatalogId;
  isDefault?: boolean;
  /**
   * TEMPLATE_SPEC §2.1. Sections this template styles first-class.
   * Sections NOT listed still render via the shared fallback
   * (templateUtils.AchievementsSection etc.) so user data is never
   * silently dropped — but the template author hasn't optimised the
   * layout for them. The editor may surface a soft warning when the
   * user's filled sections exceed this list.
   */
  supportedSections: TemplateSectionKey[];
  /** Locales the template renders correctly today. */
  supportedLocales: string[];
  /** Layout family (TEMPLATE_SPEC §2.1). */
  layout: TemplateLayout;
  /** True if the template renders cleanly across A4/Letter page breaks. */
  paginationSafe: boolean;
  /** Variants implemented; 'ats-export' is REQUIRED for atsSafety high/medium. */
  implementedVariants: TemplateVariant[];
};

export const TEMPLATE_CATALOG: readonly TemplateCatalogItem[] = [
  {
    id: 'classic',
    name: 'Classic ATS',
    description: 'Single-column ATS-safe structure with bold section headers. Tested across Workday, Greenhouse, iCIMS, Taleo, BambooHR.',
    tags: ['ATS-safe', 'Single-column', 'Default'],
    atsSafety: 'high',
    recommendedFor: ['General professional resumes', 'High ATS compatibility'],
    industries: [
      'information-technology', 'ai-machine-learning', 'engineering', 'finance',
      'legal', 'education', 'healthcare', 'human-resources',
      'manufacturing-supply-chain', 'construction-real-estate',
      'government-public-sector', 'logistics-transport',
      'agriculture-environment', 'retail-ecommerce',
    ],
    componentKey: 'classic',
    isDefault: true,
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'modern',
    name: 'Modern Professional',
    description: 'Single-column with subtle divider lines. Content parses cleanly; some ATS may drop the divider styling but never the text.',
    tags: ['ATS-safe', 'Modern'],
    atsSafety: 'high',
    recommendedFor: ['Product', 'Operations', 'Business-facing roles'],
    industries: [
      'business-management', 'sales-marketing', 'human-resources',
      'hospitality-tourism', 'retail-ecommerce', 'media-communications',
      'non-profit-social-impact', 'information-technology',
      'ai-machine-learning',
    ],
    componentKey: 'modern',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'technical',
    name: 'Technical Compact',
    description: 'Dense single-column layout with grouped technical skills. ATS-safe; the grouping helps keyword matching.',
    tags: ['ATS-safe', 'Engineering'],
    atsSafety: 'high',
    recommendedFor: ['Engineering', 'Data', 'Platform teams'],
    industries: [
      'information-technology', 'ai-machine-learning', 'engineering',
      'science-research', 'manufacturing-supply-chain', 'logistics-transport',
      'construction-real-estate',
    ],
    componentKey: 'technical',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'minimal',
    name: 'Minimal Clean',
    description: 'Ultra-minimal single-column format. The safest visual choice for ATS — almost nothing for a parser to trip on.',
    tags: ['ATS-safe', 'Minimal'],
    atsSafety: 'high',
    recommendedFor: ['Early-career', 'One-page resumes'],
    industries: [
      'education', 'creative-design', 'media-communications',
      'non-profit-social-impact', 'information-technology',
    ],
    componentKey: 'minimal',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'consultant',
    name: 'Consultant Clean',
    description: 'Crisp headings, metric-forward bullets, single-column. ATS-safe across the board.',
    tags: ['ATS-safe', 'Consulting style'],
    atsSafety: 'high',
    recommendedFor: ['Consulting', 'Strategy', 'Client delivery'],
    industries: [
      'business-management', 'finance', 'legal', 'information-technology',
      'ai-machine-learning',
    ],
    componentKey: 'consultant',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'academic',
    name: 'Academic CV',
    description: 'Publication-first layout with sections for research, teaching, and awards. Single-column; parses cleanly but adds non-standard headings some ATS may not recognise.',
    tags: ['Recruiter-friendly', 'Academic', 'Research'],
    atsSafety: 'medium',
    recommendedFor: ['Researchers', 'Professors', 'PhD candidates', 'Scientists'],
    industries: [
      'education', 'science-research', 'government-public-sector',
      'agriculture-environment', 'healthcare',
    ],
    componentKey: 'academic',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'healthcare',
    name: 'Healthcare CV',
    description: 'Credentials-forward single-column layout surfacing licensure, certifications, and clinical experience. Parses cleanly; uses standard section names.',
    tags: ['ATS-safe', 'Healthcare', 'Clinical'],
    atsSafety: 'medium',
    recommendedFor: ['Physicians', 'Nurses', 'Pharmacists', 'Allied health'],
    industries: ['healthcare', 'science-research'],
    componentKey: 'healthcare',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'creative',
    name: 'Creative Portfolio',
    description: 'Portfolio-friendly layout with highlighted links and visual rhythm. Recruiters love it for design-heavy roles; ATS systems sometimes mis-parse the styled link blocks. Use a Classic / Minimal variant for the actual application upload.',
    tags: ['Recruiter-friendly', 'Creative', 'Portfolio'],
    atsSafety: 'medium',
    recommendedFor: ['Designers', 'Writers', 'Marketers', 'Media'],
    industries: [
      'creative-design', 'media-communications', 'sales-marketing',
      'hospitality-tourism', 'retail-ecommerce',
    ],
    componentKey: 'creative',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'multi-column',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'sidebar-bold',
    name: 'Sidebar Bold',
    description: 'Two-column layout with a dark navy sidebar for skills and a clean white main area. Visual showcase only — most ATS scrapers merge the columns or drop the sidebar. Do not upload this to a job portal.',
    tags: ['Visual', 'Two-column', 'Showcase'],
    atsSafety: 'low',
    recommendedFor: ['Portfolio sites', 'Direct networking', 'Printed CVs'],
    industries: [
      'creative-design', 'media-communications', 'information-technology',
      'sales-marketing', 'business-management',
    ],
    componentKey: 'sidebar-bold',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'sidebar',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'accent-header',
    name: 'Accent Header',
    description: 'Vivid gradient header band, colour-coded skill pills and a timeline-style experience section. Visual showcase only — ATS scrapers usually drop the chip pills and may mis-parse the header band. Do not upload this to a job portal.',
    tags: ['Visual', 'Modern', 'Showcase'],
    atsSafety: 'low',
    recommendedFor: ['Portfolio sites', 'Direct networking', 'Printed CVs'],
    industries: [
      'creative-design', 'media-communications', 'information-technology',
      'ai-machine-learning', 'sales-marketing',
    ],
    componentKey: 'accent-header',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
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
  // 'executive' was visually indistinguishable from 'classic' (founder
  // smoke 2026-06: only h1 font-size and one letter-spacing differed).
  // Removed from the catalog; both old IDs alias to 'classic' so saved
  // resumes and profession recommendations keep working.
  executive: 'classic',
  'executive-impact': 'classic',
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
  'sidebar-bold': 'sidebar-bold',
  'two-column-bold': 'sidebar-bold',
  sidebar: 'sidebar-bold',
  'accent-header': 'accent-header',
  'accent-band': 'accent-header',
  visual: 'accent-header',
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
