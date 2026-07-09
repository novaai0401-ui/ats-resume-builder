import React from 'react';
import {
  formatDateRange,
  getAtsSectionTitle,
  normalizeResumeForAts,
  resolveSectionOrder,
  REORDERABLE_SECTIONS,
  type AtsSectionKey,
  type ResumeImportResult,
} from 'resume-builder-shared';

export type TemplateProps = {
  resumeData: ResumeImportResult;
};

export function cleanList(values: string[] | undefined) {
  return (values || []).map((item) => String(item || '').trim()).filter(Boolean);
}

export function normalizeTemplateResume(resumeData: ResumeImportResult) {
  return normalizeResumeForAts(resumeData);
}

export function sectionTitle(section: Exclude<AtsSectionKey, 'header'>) {
  return getAtsSectionTitle(section);
}

export function displayDateRange(startDate: string, endDate: string) {
  return formatDateRange(String(startDate || ''), String(endDate || ''));
}

export function fullNameOrTitle(resumeData: ResumeImportResult) {
  const title = String(resumeData.title || '').trim();
  const fullName = String(resumeData.contact?.fullName || '').trim();
  return title || fullName || 'Resume';
}

export function allSkills(resumeData: ResumeImportResult) {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [
    ...cleanList(resumeData.skills),
    ...cleanList(resumeData.technicalSkills),
    ...cleanList(resumeData.softSkills),
  ]) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

/**
 * Resolve the list of skills to render in the "main" Skills section,
 * never overlapping the list rendered in the soft-skills section.
 *
 * Background — the bug this fixes: every visual template did
 *   const displaySkills = techSkills.length ? techSkills : skills;
 * Where `skills = allSkills(normalized)` ALREADY contains every soft
 * skill (allSkills merges all three buckets). When techSkills was
 * empty (the common case for users who just type into the single
 * "Skills" field), the soft-skills section then RE-rendered every
 * item already shown in the main skills section — visible as
 * duplicate fields in the downloaded PDF.
 *
 * Behaviour:
 *  - If technicalSkills is populated, use that verbatim (user has
 *    explicitly split tech / soft and we honour their split).
 *  - Otherwise return the merged-all-skills list MINUS anything that
 *    also appears in softSkills, case-insensitively.
 */
export function nonOverlappingMainSkills(resumeData: ResumeImportResult): string[] {
  const tech = cleanList(resumeData.technicalSkills);
  if (tech.length) return tech;
  const merged = allSkills(resumeData);
  const softSet = new Set(cleanList(resumeData.softSkills).map((s) => s.toLowerCase()));
  if (softSet.size === 0) return merged;
  return merged.filter((s) => !softSet.has(s.toLowerCase()));
}

export function contactLine(resumeData: ResumeImportResult) {
  const parts = [
    resumeData.contact?.email,
    resumeData.contact?.phone,
    resumeData.contact?.location,
    ...(resumeData.contact?.links || []),
  ].map((item) => String(item || '').trim()).filter(Boolean);
  return parts.join(' | ');
}

export function experienceItems(resumeData: ResumeImportResult) {
  return (resumeData.experience || []).filter((item) => {
    return Boolean(
      String(item.role || '').trim() ||
      String(item.company || '').trim() ||
      cleanList(item.highlights).length,
    );
  });
}

export function educationItems(resumeData: ResumeImportResult) {
  return (resumeData.education || []).filter((item) => {
    return Boolean(String(item.degree || '').trim() || String(item.institution || '').trim());
  });
}

export function projectItems(resumeData: ResumeImportResult) {
  return (resumeData.projects || []).filter((item) => {
    return Boolean(String(item.name || '').trim() || cleanList(item.highlights).length);
  });
}

export function certificationItems(resumeData: ResumeImportResult) {
  return (resumeData.certifications || []).filter((item) => {
    return Boolean(String(item.name || '').trim() || cleanList(item.details || []).length);
  });
}

export function licenseItems(resumeData: ResumeImportResult) {
  return (resumeData.licenses || []).filter((item) => {
    return Boolean(String(item.name || '').trim());
  });
}

export function publicationItems(resumeData: ResumeImportResult) {
  return (resumeData.publications || []).filter((item) => {
    return Boolean(String(item.title || '').trim());
  });
}

export function achievementItems(resumeData: ResumeImportResult): string[] {
  return cleanList((resumeData as { achievements?: string[] }).achievements || []);
}

/**
 * TEMPLATE_SPEC §1.3 — generic achievements fallback.
 *
 * Only ClassicATS styles achievements first-class; every other
 * template was silently DROPPING the section from preview + PDF
 * (founder report: "all achievements are not listed" — the parser
 * extracted them fine, the template threw them away). This shared
 * block gives the other ten templates an honest plain rendering:
 * the canonical section title + a simple list, styleable via the
 * two style hooks so each template can match its own typography.
 *
 * A template "upgrades" by styling the section itself and adding
 * 'achievements' to its supportedSections catalog entry — at which
 * point it stops rendering this fallback.
 */
// ---------------------------------------------------------------------------
// R-045 Phase 2 — shared, reorderable section renderer for the ATS family.
//
// All seven single-column ATS templates (classic, modern, minimal, technical,
// consultant, academic, healthcare) render their body sections through this
// component so the on-screen preview and the server-side export
// (renderOrderedSections in resume.service.ts) consume the SAME ordering logic
// and honour the per-resume `sectionOrder` override identically. `header` is
// rendered by each template and is never reorderable.
// ---------------------------------------------------------------------------

type BodySectionKey = Exclude<AtsSectionKey, 'header'>;

export type OrderedSectionsOptions = {
  /** Joins role and company in the experience block heading. */
  companyJoiner: ', ' | ' | ' | ' @ ';
  /** Section modifier class: tight or divided (mutually exclusive in practice). */
  tight?: boolean;
  divided?: boolean;
  /** Uppercase the section headings (classic / academic / healthcare). */
  uppercaseHeadings?: boolean;
  /** Pre-grouped skills line (technical template). */
  groupedSkillLine?: string;
  /** Per-section heading label overrides (academic / healthcare). */
  labels?: Partial<Record<BodySectionKey, string>>;
  /** Template default body order before the user override is applied. */
  defaultBody?: BodySectionKey[];
  /** Empty-state copy. */
  summaryPlaceholder?: string;
  skillsPlaceholder?: string;
  experienceEmpty?: string;
  educationEmpty?: string;
};

export function OrderedAtsSections({
  resumeData,
  options,
}: {
  resumeData: ResumeImportResult;
  options: OrderedSectionsOptions;
}) {
  const summary = String(resumeData.summary || '').trim();
  const skills = allSkills(resumeData);
  const languages = cleanList(resumeData.languages);
  const experience = experienceItems(resumeData);
  const projects = projectItems(resumeData);
  const achievements = achievementItems(resumeData);
  const education = educationItems(resumeData);
  const certifications = certificationItems(resumeData);
  const licenses = licenseItems(resumeData);
  const publications = publicationItems(resumeData);

  const sectionClass = `ats-section${options.tight ? ' ats-section--tight' : ''}${options.divided ? ' ats-section--divided' : ''}`;
  const heading = (key: BodySectionKey) => {
    const label = options.labels?.[key] || getAtsSectionTitle(key);
    return options.uppercaseHeadings ? label.toUpperCase() : label;
  };
  const skillLine = options.groupedSkillLine || (skills.length ? skills.join(', ') : (options.skillsPlaceholder || 'Add role-relevant skills.'));

  const blocks: Record<BodySectionKey, React.ReactNode> = {
    summary: (
      <section className={sectionClass} key="summary">
        <h2>{heading('summary')}</h2>
        <p>{summary || (options.summaryPlaceholder || 'Add a concise summary aligned to your target role.')}</p>
      </section>
    ),
    skills: (
      <section className={sectionClass} key="skills">
        <h2>{heading('skills')}</h2>
        <p>{skillLine}</p>
      </section>
    ),
    experience: (
      <section className={sectionClass} key="experience">
        <h2>{heading('experience')}</h2>
        {experience.length ? experience.map((item, idx) => (
          <div className="ats-item" key={`exp-${idx}`}>
            <h3>{item.role || 'Role'}{item.company ? `${options.companyJoiner}${item.company}` : ''}</h3>
            {displayDateRange(item.startDate, item.endDate) ? <p className="ats-item__meta">{displayDateRange(item.startDate, item.endDate)}</p> : null}
            <ul>
              {cleanList(item.highlights).map((line, lineIdx) => (
                <li key={`exp-line-${idx}-${lineIdx}`}>{line}</li>
              ))}
            </ul>
          </div>
        )) : <p>{options.experienceEmpty || 'No experience added.'}</p>}
      </section>
    ),
    projects: projects.length ? (
      <section className={sectionClass} key="projects">
        <h2>{heading('projects')}</h2>
        {projects.map((item, idx) => (
          <div className="ats-item" key={`proj-${idx}`}>
            <h3>{item.name || 'Project'}</h3>
            {displayDateRange(item.startDate || '', item.endDate || '') ? <p className="ats-item__meta">{displayDateRange(item.startDate || '', item.endDate || '')}</p> : null}
            <ul>
              {cleanList(item.highlights).map((line, lineIdx) => (
                <li key={`proj-line-${idx}-${lineIdx}`}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    ) : null,
    achievements: achievements.length ? (
      <section className={sectionClass} key="achievements">
        <h2>{heading('achievements')}</h2>
        <ul className="ats-item">
          {achievements.map((line, idx) => (
            <li key={`ach-${idx}`}>{line}</li>
          ))}
        </ul>
      </section>
    ) : null,
    education: (
      <section className={sectionClass} key="education">
        <h2>{heading('education')}</h2>
        {education.length ? education.map((item, idx) => (
          <div className="ats-item" key={`edu-${idx}`}>
            <h3>{item.degree || 'Degree'}</h3>
            <p>{item.institution || ''}</p>
            {displayDateRange(item.startDate, item.endDate) ? <p className="ats-item__meta">{displayDateRange(item.startDate, item.endDate)}</p> : null}
          </div>
        )) : <p>{options.educationEmpty || 'No education added.'}</p>}
      </section>
    ),
    certifications: certifications.length ? (
      <section className={sectionClass} key="certifications">
        <h2>{heading('certifications')}</h2>
        {certifications.map((item, idx) => (
          <div className="ats-item" key={`cert-${idx}`}>
            <h3>{item.name || 'Certification'}</h3>
            <p>{[item.issuer, displayDateRange(item.date || '', '')].filter(Boolean).join(' | ')}</p>
          </div>
        ))}
      </section>
    ) : null,
    licenses: licenses.length ? (
      <section className={sectionClass} key="licenses">
        <h2>{heading('licenses')}</h2>
        {licenses.map((item, idx) => (
          <div className="ats-item" key={`lic-${idx}`}>
            <h3>{item.name || 'License'}</h3>
            <p>{[item.authority, item.licenseNumber, item.region, item.validTill ? `Valid till ${item.validTill}` : ''].map((part) => String(part || '').trim()).filter(Boolean).join(' | ')}</p>
          </div>
        ))}
      </section>
    ) : null,
    publications: publications.length ? (
      <section className={sectionClass} key="publications">
        <h2>{heading('publications')}</h2>
        {publications.map((item, idx) => (
          <div className="ats-item" key={`pub-${idx}`}>
            <h3>{item.title || 'Publication'}{item.type === 'patent' ? ' (Patent)' : ''}</h3>
            <p>{[item.venue, item.year, item.url].map((part) => String(part || '').trim()).filter(Boolean).join(' | ')}</p>
          </div>
        ))}
      </section>
    ) : null,
    languages: languages.length ? (
      <section className={sectionClass} key="languages">
        <h2>{heading('languages')}</h2>
        <p>{languages.join(', ')}</p>
      </section>
    ) : null,
  };

  const order = resolveSectionOrder(resumeData.sectionOrder, options.defaultBody || REORDERABLE_SECTIONS);
  return <>{order.map((key) => blocks[key])}</>;
}

export function AchievementsSection({
  resumeData,
  headingStyle,
  listStyle,
}: {
  resumeData: ResumeImportResult;
  headingStyle?: React.CSSProperties;
  listStyle?: React.CSSProperties;
}) {
  const achievements = achievementItems(resumeData);
  if (!achievements.length) return null;
  return (
    <section>
      <h2 style={headingStyle}>{sectionTitle('achievements').toUpperCase()}</h2>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18, ...listStyle }}>
        {achievements.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
