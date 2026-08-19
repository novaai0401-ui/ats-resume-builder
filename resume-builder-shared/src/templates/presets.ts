import type { AtsSectionKey } from '../resume-normalization.js';
import type { TemplateCatalogId } from './catalog.js';

/**
 * ONE definition of how a template lays out its body, read by BOTH renderers.
 *
 * Why this file exists
 * --------------------
 * A resume is rendered twice by two different code paths:
 *
 *   preview  React  resume-builder-web/components/templates/* + globals.css
 *   export   HTML   resume-builder-api  renderOrderedSections + ATS_TEMPLATE_EXPORT_CSS
 *
 * Every template added before this file duplicated its layout decisions across
 * both paths, and they drifted: the API grew `educationFirst` / `certificationsFirst`
 * booleans while the React side took a `defaultBody` array, so the two could
 * disagree about section order with nothing to catch it. Users then downloaded a
 * PDF that did not match the preview they had just approved.
 *
 * A preset is plain data. Both renderers translate the SAME object into their own
 * option shape, so a template cannot be laid out one way on screen and another
 * way in the PDF. Adding a template means adding a preset here — not editing two
 * renderers and hoping they stay in step.
 *
 * The CSS parity rule
 * -------------------
 * Presets deliberately express themselves through the existing `.ats-*` class
 * vocabulary (`.ats-section`, `.ats-section--divided`, `.ats-section--tight`,
 * `.ats-item`, `.ats-item__meta`, `.ats-upper`, `.ats-template__header--bar`).
 * Those classes are already declared identically in globals.css and in
 * ATS_TEMPLATE_EXPORT_CSS, so a preset-driven template exports correctly with no
 * new CSS at all. If a future preset needs a class outside that vocabulary it
 * MUST be added to BOTH stylesheets — `tests/template-css-parity.test.ts` fails
 * the build otherwise.
 */

export type BodySectionKey = Exclude<AtsSectionKey, 'header'>;

export type TemplatePreset = {
  /** Joins role and company in an experience heading. */
  companyJoiner: ', ' | ' | ' | ' @ ';
  /** `.ats-section--tight` — smaller gaps, for dense one-page layouts. */
  tight?: boolean;
  /** `.ats-section--divided` — a hairline rule under each section. */
  divided?: boolean;
  /** Uppercase the section headings. */
  uppercaseHeadings?: boolean;
  /** Apply `.ats-upper` to headings rather than uppercasing the text itself. */
  upperClassHeadings?: boolean;
  /** `.ats-template__header--bar` — a rule under the name block. */
  headerBar?: boolean;
  /** Section order before the user's own `sectionOrder` override is applied. */
  defaultBody: BodySectionKey[];
  /** Per-section heading overrides. This is most of what makes a template feel role-specific. */
  labels?: Partial<Record<BodySectionKey, string>>;
  /** Empty-state copy shown in the preview (export omits empty sections entirely). */
  summaryPlaceholder?: string;
  skillsPlaceholder?: string;
};

/** Conventional order: what a general-purpose ATS resume leads with. */
const STANDARD: BodySectionKey[] = [
  'summary', 'skills', 'experience', 'projects', 'achievements',
  'education', 'certifications', 'licenses', 'publications', 'languages',
];

/** Reorder STANDARD by pulling `lead` to the front, keeping the rest stable. */
function leadWith(...lead: BodySectionKey[]): BodySectionKey[] {
  return [...lead, ...STANDARD.filter((key) => !lead.includes(key))];
}

/**
 * Templates added for the 2026 hiring cycle, chosen for where screening is
 * heading through 2027-2028 rather than where it has been.
 *
 * The through-line: applications are now read first by an LLM-backed parser and
 * only then by a person. That rewards explicit, well-named sections and an order
 * that puts the deciding evidence first — and it penalises the visual tricks
 * (columns, tables, sidebars, icons) that older "designer" templates lean on.
 * So every preset below is single-column with standard headings; they differ in
 * WHICH evidence leads and what it is called, which is what a parser and a
 * reviewer both actually key on.
 */
export const TEMPLATE_PRESETS: Partial<Record<TemplateCatalogId, TemplatePreset>> = {
  // Skills-based hiring: the fastest-growing screen is "does this person have
  // the skill", not "where have they worked". Skills lead, profile supports.
  'skills-first': {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('skills', 'summary'),
    labels: { skills: 'Core Skills', summary: 'Profile', experience: 'Applied Experience' },
    summaryPlaceholder: 'Two lines on the problems you solve and for whom.',
    skillsPlaceholder: 'Lead with the skills the posting names.',
  },

  // Quantified-impact screening. Achievements sit directly under the summary so
  // the numbers are read before the employment history.
  'impact-metrics': {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('summary', 'achievements'),
    labels: {
      summary: 'Impact Summary',
      achievements: 'Quantified Impact',
      experience: 'Experience & Outcomes',
    },
    summaryPlaceholder: 'One line of scope, one line of measurable result.',
  },

  // AI fluency is becoming a baseline expectation rather than a specialism.
  // Gives it a named home instead of burying it in a generic skills list.
  'ai-native': {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('summary', 'skills'),
    labels: {
      summary: 'Profile',
      skills: 'AI & Technical Toolkit',
      projects: 'AI Projects & Automation',
      experience: 'Experience',
    },
    skillsPlaceholder: 'Models, tooling, and where you have shipped with them.',
  },

  // Leadership screens read scope first: teams, budget, span of control.
  'executive-brief': {
    companyJoiner: ' | ',
    uppercaseHeadings: true,
    defaultBody: leadWith('summary', 'achievements', 'experience'),
    labels: {
      summary: 'Executive Summary',
      achievements: 'Leadership Highlights',
      experience: 'Leadership Experience',
      skills: 'Areas of Expertise',
    },
    summaryPlaceholder: 'Scope: teams led, budget owned, outcomes delivered.',
  },

  // Deliberately dense. For senior people whose history does not fit a page at
  // normal spacing and who would rather compress than cut.
  'compact-dense': {
    companyJoiner: ' | ',
    tight: true,
    defaultBody: STANDARD,
    labels: { summary: 'Profile' },
  },

  // Career changers are screened out by history and screened in by transferable
  // capability, so capability and proof-of-work both precede the history.
  'career-switch': {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('summary', 'skills', 'projects'),
    labels: {
      summary: 'Career Objective',
      skills: 'Transferable Skills',
      projects: 'Relevant Projects',
      experience: 'Professional Background',
    },
    summaryPlaceholder: 'The move you are making and the evidence you bring to it.',
  },

  // Early career: coursework and built things are the evidence; employment is thin.
  'early-talent': {
    companyJoiner: ', ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('summary', 'education', 'projects', 'skills'),
    labels: {
      summary: 'Objective',
      education: 'Education',
      projects: 'Academic & Personal Projects',
      experience: 'Internships & Work Experience',
    },
    summaryPlaceholder: 'The role you want and the strongest thing you have built.',
  },

  // Public-sector screening is rules-based and rewards explicitness over polish:
  // plain uppercase headings, no decorative rules, nothing to misparse.
  'federal-detailed': {
    companyJoiner: ', ',
    uppercaseHeadings: true,
    defaultBody: leadWith('summary', 'experience', 'education', 'certifications'),
    labels: {
      summary: 'Professional Summary',
      experience: 'Work Experience',
      certifications: 'Certifications & Clearances',
      achievements: 'Awards & Recognition',
    },
    summaryPlaceholder: 'Role, years of relevant service, and clearance if held.',
  },

  // Sales screens on attainment. Quota history leads.
  'revenue-sales': {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('summary', 'achievements', 'experience'),
    labels: {
      summary: 'Profile',
      achievements: 'Quota & Revenue Attainment',
      experience: 'Sales Experience',
      skills: 'Sales Skills & Tools',
    },
    summaryPlaceholder: 'Segment, deal size, and attainment against quota.',
  },

  // Analytics roles are screened on stack first, then on decisions influenced.
  'data-analytics': {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('summary', 'skills', 'experience', 'projects'),
    labels: {
      skills: 'Tools & Technologies',
      projects: 'Analysis & Dashboards',
      experience: 'Experience',
      achievements: 'Measured Outcomes',
    },
    skillsPlaceholder: 'Languages, warehouses, BI tools, statistical methods.',
  },

  // For engineers whose public work is stronger evidence than their employer list.
  'open-source': {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('summary', 'skills', 'projects'),
    labels: {
      projects: 'Open Source & Contributions',
      skills: 'Languages & Tooling',
      experience: 'Professional Experience',
      publications: 'Talks & Writing',
    },
    summaryPlaceholder: 'What you build, and where your work is publicly visible.',
  },

  // Distributed hiring keeps growing; overlap hours and working languages are
  // screening criteria, so languages are promoted out of the footer.
  'remote-global': {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: leadWith('summary', 'skills', 'experience', 'languages'),
    labels: {
      summary: 'Profile',
      languages: 'Working Languages',
      experience: 'Remote & Distributed Experience',
      skills: 'Skills & Collaboration Tools',
    },
    summaryPlaceholder: 'Base location, overlap hours, and remote track record.',
  },
};

/** The preset for a template id, or undefined for the hand-written templates. */
export function templatePreset(id: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS[id as TemplateCatalogId];
}

/** Ids that are driven by a preset rather than a bespoke renderer. */
export const PRESET_TEMPLATE_IDS = Object.keys(TEMPLATE_PRESETS) as TemplateCatalogId[];
