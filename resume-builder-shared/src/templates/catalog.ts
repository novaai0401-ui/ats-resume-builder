export type TemplateCatalogId =
  | 'classic'
  | 'modern'
  | 'technical'
  | 'minimal'
  | 'consultant'
  | 'academic'
  | 'healthcare'
  | 'medical-coder'
  | 'ai-ml-engineer'
  | 'product-manager'
  | 'creative'
  | 'sidebar-bold'
  | 'accent-header'
  // R-110 — 2026 intake. Preset-driven (templates/presets.ts): one shared
  // layout definition read by BOTH the React preview and the API export,
  // so a downloaded PDF cannot drift from the previewed document.
  | 'skills-first'
  | 'impact-metrics'
  | 'ai-native'
  | 'executive-brief'
  | 'compact-dense'
  | 'career-switch'
  | 'early-talent'
  | 'federal-detailed'
  | 'revenue-sales'
  | 'data-analytics'
  | 'open-source'
  | 'remote-global'
  // nb-visual family — designer/showcase templates, accent-colour driven.
  // One shared component + one export renderer; the variant class does the
  // visual differentiation. atsSafety low: for people, not parsers.
  | 'sidebar-elegant'
  | 'icon-accent'
  | 'banner-modern'
  | 'initials-classic'
  | 'photo-banner'
  | 'timeline-pro'
  | 'elegant-serif'
  | 'bold-header';

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
    id: 'medical-coder',
    name: 'Medical Coder',
    description: 'Certifications-and-credentials-first layout for medical coders and billing specialists: CPC/CCS certifications, code-set skills (ICD-10, CPT, HCPCS), and compliance experience lead the page. Single-column, standard headings.',
    tags: ['ATS-safe', 'Healthcare', 'Coding & Billing'],
    atsSafety: 'high',
    recommendedFor: ['Medical Coders', 'Medical Billing Specialists', 'HIM professionals'],
    industries: ['healthcare'],
    componentKey: 'healthcare',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'ai-ml-engineer',
    name: 'AI / ML Engineer',
    description: 'Skills-and-projects-forward single-column layout for AI/ML, data-science and GenAI roles: model/ML frameworks and code-set skills lead, projects/research and publications get first-class framing. ATS-safe.',
    tags: ['ATS-safe', 'AI / ML', 'Engineering'],
    atsSafety: 'high',
    recommendedFor: ['AI Engineers', 'ML Engineers', 'Data Scientists', 'MLOps', 'Applied Scientists'],
    industries: ['ai-machine-learning', 'information-technology', 'science-research'],
    componentKey: 'technical',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    description: 'Impact-and-metrics-forward single-column layout for product, program and business roles: a crisp summary, competencies, and outcome-led experience bullets. ATS-safe.',
    tags: ['ATS-safe', 'Product', 'Business'],
    atsSafety: 'high',
    recommendedFor: ['Product Managers', 'Program Managers', 'Business Analysts', 'Strategy / Ops'],
    industries: ['business-management', 'information-technology', 'ai-machine-learning', 'sales-marketing'],
    componentKey: 'consultant',
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

  /* ---------------------------------------------------------------
     R-110 — 2026 intake, preset-driven (see templates/presets.ts).
     Layout for these lives in ONE shared preset read by both the React
     preview and the API export renderer, so the downloaded PDF cannot
     drift from the document the user approved on screen. All are
     single-column with standard headings: what has changed for 2026 is
     WHICH evidence leads and what it is called, not the visual styling,
     because LLM-backed parsers reward explicit sections and penalise the
     columns and graphics that older "designer" templates rely on.
     --------------------------------------------------------------- */
  {
    id: 'skills-first',
    name: 'Skills-First 2026',
    description:
      'Skills lead, profile supports, history follows. Built for skills-based screening, where the first filter asks what you can do rather than where you did it.',
    tags: ['ATS-safe', 'Skills-based', '2026'],
    atsSafety: 'high',
    recommendedFor: ['Skills-based applications', 'Roles with an explicit skill checklist'],
    industries: ['information-technology', 'ai-machine-learning', 'engineering', 'business-management', 'sales-marketing'],
    componentKey: 'skills-first',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'impact-metrics',
    name: 'Impact & Metrics',
    description:
      'Quantified impact sits directly under the summary, so the numbers are read before the employment history. For roles screened on measurable outcomes.',
    tags: ['ATS-safe', 'Metrics-led', '2026'],
    atsSafety: 'high',
    recommendedFor: ['Senior individual contributors', 'Roles judged on measurable outcomes'],
    industries: ['business-management', 'sales-marketing', 'finance', 'information-technology', 'engineering'],
    componentKey: 'impact-metrics',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'ai-native',
    name: 'AI-Native Professional',
    description:
      'Gives AI tooling a named section instead of burying it in a generic skills list. For 2027-2028 hiring, where AI fluency is a baseline expectation rather than a specialism.',
    tags: ['ATS-safe', 'AI-ready', '2027'],
    atsSafety: 'high',
    recommendedFor: ['AI-adjacent roles in any function', 'Demonstrating AI fluency outside an AI job title'],
    industries: ['ai-machine-learning', 'information-technology', 'engineering', 'media-communications', 'business-management'],
    componentKey: 'ai-native',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'executive-brief',
    name: 'Executive Brief',
    description:
      'Scope first: teams led, budget owned, outcomes delivered. Uppercase headings and no decorative rules, so it reads as a briefing document.',
    tags: ['ATS-safe', 'Leadership'],
    atsSafety: 'high',
    recommendedFor: ['Director and above', 'Board and executive search'],
    industries: ['business-management', 'finance', 'manufacturing-supply-chain', 'healthcare', 'government-public-sector'],
    componentKey: 'executive-brief',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'compact-dense',
    name: 'Compact One-Page',
    description:
      'Deliberately dense spacing for a long history that will not fit a page at normal leading. Compresses rather than cuts.',
    tags: ['ATS-safe', 'One-page', 'Dense'],
    atsSafety: 'high',
    recommendedFor: ['Long careers held to one page', 'Applications with a strict page limit'],
    industries: ['information-technology', 'engineering', 'finance', 'legal', 'business-management'],
    componentKey: 'compact-dense',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'career-switch',
    name: 'Career Switch',
    description:
      'Transferable skills and relevant projects both precede the employment history, because a changer is screened out on history and screened in on capability.',
    tags: ['ATS-safe', 'Career change'],
    atsSafety: 'high',
    recommendedFor: ['Changing industry or function', 'Returning after a break'],
    industries: ['information-technology', 'business-management', 'education', 'healthcare', 'retail-ecommerce'],
    componentKey: 'career-switch',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'early-talent',
    name: 'Early Talent',
    description:
      'Education and built projects lead; internships follow. For a first or second role, where coursework and personal projects are the strongest evidence available.',
    tags: ['ATS-safe', 'Graduate', 'Entry-level'],
    atsSafety: 'high',
    recommendedFor: ['Students and new graduates', 'First or second professional role'],
    industries: ['information-technology', 'engineering', 'education', 'ai-machine-learning', 'finance'],
    componentKey: 'early-talent',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'federal-detailed',
    name: 'Government & Federal',
    description:
      'Explicit over polished: plain uppercase headings, no decorative rules, certifications and clearances given their own named section. Built for rules-based public-sector screening.',
    tags: ['ATS-safe', 'Public sector', 'Detailed'],
    atsSafety: 'high',
    recommendedFor: ['Government and public-sector applications', 'Roles requiring clearances'],
    industries: ['government-public-sector', 'legal', 'healthcare', 'engineering', 'logistics-transport'],
    componentKey: 'federal-detailed',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'revenue-sales',
    name: 'Revenue & Sales',
    description:
      'Quota and revenue attainment lead, because sales screening reads attainment before anything else. Segment and deal size belong in the summary.',
    tags: ['ATS-safe', 'Sales', 'Metrics-led'],
    atsSafety: 'high',
    recommendedFor: ['Quota-carrying sales roles', 'Revenue and growth functions'],
    industries: ['sales-marketing', 'business-management', 'retail-ecommerce', 'hospitality-tourism', 'media-communications'],
    componentKey: 'revenue-sales',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'data-analytics',
    name: 'Data & Analytics',
    description:
      'Stack first, then the decisions it influenced. Analysis and dashboard work gets its own section rather than competing with employment history.',
    tags: ['ATS-safe', 'Data', 'Technical'],
    atsSafety: 'high',
    recommendedFor: ['Analysts and data scientists', 'BI and analytics engineering'],
    industries: ['information-technology', 'ai-machine-learning', 'finance', 'retail-ecommerce', 'healthcare'],
    componentKey: 'data-analytics',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'open-source',
    name: 'Open Source Engineer',
    description:
      'Public contributions and tooling precede the employer list, for engineers whose visible work is stronger evidence than where they have been employed.',
    tags: ['ATS-safe', 'Engineering', 'Portfolio'],
    atsSafety: 'high',
    recommendedFor: ['Engineers with public repositories', 'Developer-tooling and infrastructure roles'],
    industries: ['information-technology', 'ai-machine-learning', 'engineering', 'media-communications'],
    componentKey: 'open-source',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'remote-global',
    name: 'Remote & Global',
    description:
      'Promotes working languages out of the footer and names remote track record explicitly, because overlap hours and language are real screening criteria in distributed hiring.',
    tags: ['ATS-safe', 'Remote', 'Global'],
    atsSafety: 'high',
    recommendedFor: ['Distributed and remote-first roles', 'Cross-border applications'],
    industries: ['information-technology', 'ai-machine-learning', 'media-communications', 'business-management', 'sales-marketing'],
    componentKey: 'remote-global',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'single-column',
    paginationSafe: true,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },

  /* ---------------------------------------------------------------
     nb-visual family — designer/showcase templates for people rather
     than parsers (the honest atsSafety: low). One shared component and
     one export renderer serve all four; the variant modifier class does
     the visual differentiation, and every design is recoloured by the
     user's accent swatch (--rb-accent).
     --------------------------------------------------------------- */
  {
    id: 'sidebar-elegant',
    name: 'Sidebar Elegant',
    description:
      'Accent-coloured left rail for contact and skills beside a clean white main column — and the rail recolours with your accent swatch. Visual showcase: most ATS merge or drop the columns, so use it for people, not portals.',
    tags: ['Visual', 'Two-column', 'Accent'],
    atsSafety: 'low',
    recommendedFor: ['Direct applications and referrals', 'Printed CVs', 'Client-facing roles'],
    industries: ['sales-marketing', 'business-management', 'hospitality-tourism', 'creative-design', 'media-communications'],
    componentKey: 'sidebar-elegant',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'sidebar',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'icon-accent',
    name: 'Icon Accent',
    description:
      'Glyph-badged section headings in your accent colour with a slim contact column — the polished-but-quiet look. Visual showcase: two-column, so keep it for humans rather than ATS portals.',
    tags: ['Visual', 'Icons', 'Accent'],
    atsSafety: 'low',
    recommendedFor: ['Networking and referrals', 'Consultants and freelancers'],
    industries: ['business-management', 'media-communications', 'creative-design', 'education', 'hospitality-tourism'],
    componentKey: 'icon-accent',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'multi-column',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'banner-modern',
    name: 'Banner Modern',
    description:
      'A soft accent-tinted banner behind your name, with a grey utility rail on the right. The tint follows your accent swatch. Visual showcase — recruiters love it, parsers merge the columns.',
    tags: ['Visual', 'Banner', 'Accent'],
    atsSafety: 'low',
    recommendedFor: ['Creative and client-facing roles', 'Printed CVs'],
    industries: ['creative-design', 'media-communications', 'sales-marketing', 'hospitality-tourism', 'retail-ecommerce'],
    componentKey: 'banner-modern',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'multi-column',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'initials-classic',
    name: 'Initials Classic',
    description:
      'A monogram avatar built from your initials beside an understated serif-weight name, with square accent markers. The calm executive look, no photo required. Visual showcase, not for ATS portals.',
    tags: ['Visual', 'Monogram', 'Understated'],
    atsSafety: 'low',
    recommendedFor: ['Senior and executive applications shared directly', 'Board and advisory CVs'],
    industries: ['business-management', 'finance', 'legal', 'government-public-sector', 'education'],
    componentKey: 'initials-classic',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'multi-column',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },

  /* nb-visual batch 2 — same family, same contract. */
  {
    id: 'photo-banner',
    name: 'Photo Banner',
    description:
      'A soft accent banner with your photo in a clean circle — and a tasteful monogram when you skip the photo. Visual showcase: use for people, not ATS portals.',
    tags: ['Visual', 'Photo', 'Banner'],
    atsSafety: 'low',
    recommendedFor: ['Client-facing and hospitality roles', 'Regions where photo CVs are the norm'],
    industries: ['hospitality-tourism', 'sales-marketing', 'media-communications', 'creative-design', 'retail-ecommerce'],
    componentKey: 'photo-banner',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'sidebar',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'timeline-pro',
    name: 'Timeline Pro',
    description:
      'Your career as a vertical timeline — an accent dot per role on a clean rule. Reads instantly in interviews and printouts; ATS parsers merge the columns, so keep it for humans.',
    tags: ['Visual', 'Timeline', 'Accent'],
    atsSafety: 'low',
    recommendedFor: ['Interview leave-behinds', 'Career-story-driven applications'],
    industries: ['business-management', 'information-technology', 'engineering', 'media-communications', 'education'],
    componentKey: 'timeline-pro',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'multi-column',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'elegant-serif',
    name: 'Elegant Serif',
    description:
      'Centred serif name, hairline rules, letter-spaced role line — the quiet luxury look. Visual showcase for direct sharing rather than job portals.',
    tags: ['Visual', 'Serif', 'Understated'],
    atsSafety: 'low',
    recommendedFor: ['Senior and executive applications', 'Law, finance and academia shared directly'],
    industries: ['legal', 'finance', 'education', 'government-public-sector', 'business-management'],
    componentKey: 'elegant-serif',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'multi-column',
    paginationSafe: false,
    implementedVariants: ['screen', 'print', 'ats-export'],
  },
  {
    id: 'bold-header',
    name: 'Bold Header',
    description:
      'A solid accent header block with your name in white — maximum presence in the first second. Visual showcase; parsers may misread the header block, so use it with people.',
    tags: ['Visual', 'Bold', 'Accent'],
    atsSafety: 'low',
    recommendedFor: ['Creative and sales roles', 'Printed CVs and career fairs'],
    industries: ['creative-design', 'sales-marketing', 'media-communications', 'retail-ecommerce', 'hospitality-tourism'],
    componentKey: 'bold-header',
    supportedSections: ['summary', 'skills', 'experience', 'projects', 'achievements', 'education', 'certifications', 'languages'],
    supportedLocales: ['en-IN', 'en-US'],
    layout: 'multi-column',
    paginationSafe: false,
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
  'medical-coding': 'medical-coder',
  'medical-billing': 'medical-coder',
  coder: 'medical-coder',
  'ai-engineer': 'ai-ml-engineer',
  'ml-engineer': 'ai-ml-engineer',
  'machine-learning': 'ai-ml-engineer',
  'data-scientist': 'ai-ml-engineer',
  'ai-ml': 'ai-ml-engineer',
  'product-manager': 'product-manager',
  pm: 'product-manager',
  product: 'product-manager',
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
