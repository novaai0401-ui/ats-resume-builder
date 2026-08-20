import React from 'react';
import {
  achievementItems,
  certificationItems,
  cleanList,
  displayDateRange,
  educationItems,
  experienceItems,
  fullNameOrTitle,
  nonOverlappingMainSkills,
  normalizeTemplateResume,
  projectItems,
  type TemplateProps,
} from './templateUtils';

/**
 * The `nb-visual` family — four designer templates sharing ONE DOM structure,
 * with a variant modifier class doing all the visual differentiation:
 *
 *   sidebar-elegant   accent-coloured left rail (contact + skills), white main
 *   icon-accent       glyph-badged section headings, slim left column
 *   banner-modern     tinted accent banner header, grey right rail
 *   initials-classic  initials avatar beside the name, accent details
 *
 * Why one structure instead of four components: every visual template must be
 * mirrored in the API's export renderer with byte-equivalent markup, or the
 * downloaded PDF drifts from the preview — the exact bug class this codebase
 * has been burned by. One structure means one mirror
 * (renderVisualTemplateArticle) and one CSS block duplicated into the two
 * stylesheets, instead of four of each.
 *
 * All four are driven by var(--rb-accent), so the editor's existing accent
 * swatches recolour the whole design — the "colour dots" behaviour users know
 * from competitor galleries. These are showcase layouts (atsSafety: low):
 * recruiters love them, ATS parsers merge or drop the columns.
 */
export type VisualVariant = 'sidebar-elegant' | 'icon-accent' | 'banner-modern' | 'initials-classic';

/** Glyphs for the icon variants. Chosen from DejaVu/Liberation coverage so the
 *  PDF container renders them — emoji would tofu in the Alpine image. */
const SECTION_GLYPHS: Record<string, string> = {
  contact: '✉',
  skills: '★',
  languages: '◆',
  summary: '●',
  experience: '◆',
  projects: '■',
  education: '▲',
  certifications: '✦',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 className="nb-visual__title">
      <span className="nb-visual__ico" aria-hidden="true">{SECTION_GLYPHS[id] || '●'}</span>
      {children}
    </h2>
  );
}

export default function VisualTemplate({
  resumeData,
  variant,
}: TemplateProps & { variant: VisualVariant }) {
  const normalized = normalizeTemplateResume(resumeData);
  const summary = String(normalized.summary || '').trim();
  const skills = nonOverlappingMainSkills(normalized);
  const languages = cleanList(normalized.languages);
  const experience = experienceItems(normalized);
  const projects = projectItems(normalized);
  const education = educationItems(normalized);
  const certifications = certificationItems(normalized);
  const achievements = achievementItems(normalized);

  const email = String(normalized.contact?.email || '').trim();
  const phone = String(normalized.contact?.phone || '').trim();
  const location = String(normalized.contact?.location || '').trim();
  const links = cleanList(normalized.contact?.links);
  const name = fullNameOrTitle(normalized);

  return (
    <article className={`nb-visual nb-visual--${variant}`}>
      <header className="nb-visual__hero">
        {variant === 'initials-classic' ? (
          <span className="nb-visual__initials" aria-hidden="true">{initialsOf(name)}</span>
        ) : null}
        <div className="nb-visual__id">
          <h1 className="nb-visual__name">{name}</h1>
          {normalized.title && normalized.contact?.fullName ? (
            <p className="nb-visual__role">{normalized.title}</p>
          ) : null}
        </div>
      </header>

      <div className="nb-visual__body">
        <aside className="nb-visual__side">
          <section className="nb-visual__block">
            <SectionTitle id="contact">Contact</SectionTitle>
            {email ? <p className="nb-visual__contact">{email}</p> : null}
            {phone ? <p className="nb-visual__contact">{phone}</p> : null}
            {location ? <p className="nb-visual__contact">{location}</p> : null}
            {links.map((link, i) => (
              <p key={i} className="nb-visual__contact nb-visual__contact--link">{link}</p>
            ))}
          </section>

          {skills.length ? (
            <section className="nb-visual__block">
              <SectionTitle id="skills">Skills</SectionTitle>
              <ul className="nb-visual__list">
                {skills.map((skill, i) => (
                  <li key={i}>{skill}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {languages.length ? (
            <section className="nb-visual__block">
              <SectionTitle id="languages">Languages</SectionTitle>
              <ul className="nb-visual__list">
                {languages.map((lang, i) => (
                  <li key={i}>{lang}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>

        <div className="nb-visual__main">
          {summary ? (
            <section className="nb-visual__block">
              <SectionTitle id="summary">Summary</SectionTitle>
              <p className="nb-visual__summary">{summary}</p>
            </section>
          ) : null}

          {experience.length ? (
            <section className="nb-visual__block">
              <SectionTitle id="experience">Work History</SectionTitle>
              {experience.map((item, i) => (
                <div className="nb-visual__item" key={i}>
                  <div className="nb-visual__item-head">
                    <span className="nb-visual__item-role">{item.role}</span>
                    <span className="nb-visual__item-date">{displayDateRange(item.startDate, item.endDate)}</span>
                  </div>
                  <p className="nb-visual__item-org">{item.company}</p>
                  {item.highlights.length ? (
                    <ul className="nb-visual__bullets">
                      {item.highlights.map((h, j) => (
                        <li key={j}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {projects.length ? (
            <section className="nb-visual__block">
              <SectionTitle id="projects">Projects</SectionTitle>
              {projects.map((item, i) => (
                <div className="nb-visual__item" key={i}>
                  <div className="nb-visual__item-head">
                    <span className="nb-visual__item-role">{item.name}</span>
                  </div>
                  {item.highlights.length ? (
                    <ul className="nb-visual__bullets">
                      {item.highlights.map((h, j) => (
                        <li key={j}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {education.length ? (
            <section className="nb-visual__block">
              <SectionTitle id="education">Education</SectionTitle>
              {education.map((item, i) => (
                <div className="nb-visual__item" key={i}>
                  <div className="nb-visual__item-head">
                    <span className="nb-visual__item-role">{item.degree}</span>
                    <span className="nb-visual__item-date">{displayDateRange(item.startDate, item.endDate)}</span>
                  </div>
                  <p className="nb-visual__item-org">{item.institution}</p>
                </div>
              ))}
            </section>
          ) : null}

          {certifications.length ? (
            <section className="nb-visual__block">
              <SectionTitle id="certifications">Certifications</SectionTitle>
              <ul className="nb-visual__list">
                {certifications.map((cert, i) => (
                  <li key={i}>
                    {cert.name}
                    {cert.issuer ? ` — ${cert.issuer}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Achievements are FIRST-CLASS here rather than via the shared
              AchievementsSection fallback: the fallback renders an unstyled
              section, which looks broken inside a designer layout. Rendering
              through achievementItems keeps the never-drop-user-data guarantee
              the fallback exists for. */}
          {achievements.length ? (
            <section className="nb-visual__block">
              <SectionTitle id="achievements">Achievements</SectionTitle>
              <ul className="nb-visual__list">
                {achievements.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Bind a variant to the registry's `{ resumeData }` component shape. */
export function visualTemplateComponent(variant: VisualVariant) {
  function BoundVisualTemplate({ resumeData }: TemplateProps) {
    return <VisualTemplate resumeData={resumeData} variant={variant} />;
  }
  BoundVisualTemplate.displayName = `VisualTemplate(${variant})`;
  return BoundVisualTemplate;
}
