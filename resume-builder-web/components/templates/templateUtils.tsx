import {
  formatDateRange,
  getAtsSectionTitle,
  normalizeResumeForAts,
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
