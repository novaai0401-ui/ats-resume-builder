import React from 'react';
import {
  allSkills,
  certificationItems,
  cleanList,
  contactLine,
  displayDateRange,
  educationItems,
  experienceItems,
  fullNameOrTitle,
  normalizeTemplateResume,
  projectItems,
  type TemplateProps,
} from './templateUtils';

export default function AccentHeader({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);
  const summary = String(normalized.summary || '').trim();
  const skills = allSkills(normalized);
  const techSkills = cleanList(normalized.technicalSkills);
  const softSkills = cleanList(normalized.softSkills);
  const languages = cleanList(normalized.languages);
  const experience = experienceItems(normalized);
  const projects = projectItems(normalized);
  const education = educationItems(normalized);
  const certifications = certificationItems(normalized);

  const displaySkills = techSkills.length ? techSkills : skills;

  return (
    <article className="nb-accent-header">
      {/* ── Colored header band ───────────────────────── */}
      <header className="nb-accent-header__band">
        <h1 className="nb-accent-header__name">{fullNameOrTitle(normalized)}</h1>
        {normalized.title && normalized.contact?.fullName && (
          <p className="nb-accent-header__title">{normalized.title}</p>
        )}
        {contactLine(normalized) && (
          <p className="nb-accent-header__contact">{contactLine(normalized)}</p>
        )}
      </header>

      <div className="nb-accent-header__body">
        {/* Summary */}
        {summary && (
          <section className="nb-accent-header__section">
            <h2 className="nb-accent-header__section-title">About Me</h2>
            <p className="nb-accent-header__summary">{summary}</p>
          </section>
        )}

        {/* Skills row */}
        {displaySkills.length > 0 && (
          <section className="nb-accent-header__section">
            <h2 className="nb-accent-header__section-title">Skills</h2>
            <div className="nb-accent-header__skills-wrap">
              {displaySkills.map((skill, i) => (
                <span key={i} className="nb-accent-header__skill-pill">{skill}</span>
              ))}
              {softSkills.map((skill, i) => (
                <span key={`s-${i}`} className="nb-accent-header__skill-pill nb-accent-header__skill-pill--soft">{skill}</span>
              ))}
            </div>
          </section>
        )}

        {/* Experience */}
        {experience.length > 0 && (
          <section className="nb-accent-header__section">
            <h2 className="nb-accent-header__section-title">Experience</h2>
            {experience.map((item, idx) => (
              <div key={idx} className="nb-accent-header__item">
                <div className="nb-accent-header__item-header">
                  <div className="nb-accent-header__item-dot" />
                  <div className="nb-accent-header__item-meta">
                    <span className="nb-accent-header__item-role">{item.role || 'Role'}</span>
                    {item.company && (
                      <span className="nb-accent-header__item-company"> · {item.company}</span>
                    )}
                    {displayDateRange(item.startDate, item.endDate) && (
                      <span className="nb-accent-header__item-date">
                        {displayDateRange(item.startDate, item.endDate)}
                      </span>
                    )}
                  </div>
                </div>
                {cleanList(item.highlights).length > 0 && (
                  <ul className="nb-accent-header__bullets">
                    {cleanList(item.highlights).map((line, li) => (
                      <li key={li}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <section className="nb-accent-header__section">
            <h2 className="nb-accent-header__section-title">Projects</h2>
            {projects.map((item, idx) => (
              <div key={idx} className="nb-accent-header__item">
                <div className="nb-accent-header__item-header">
                  <div className="nb-accent-header__item-dot" />
                  <div className="nb-accent-header__item-meta">
                    <span className="nb-accent-header__item-role">{item.name || 'Project'}</span>
                    {displayDateRange(item.startDate || '', item.endDate || '') && (
                      <span className="nb-accent-header__item-date">
                        {displayDateRange(item.startDate || '', item.endDate || '')}
                      </span>
                    )}
                  </div>
                </div>
                {cleanList(item.highlights).length > 0 && (
                  <ul className="nb-accent-header__bullets">
                    {cleanList(item.highlights).map((line, li) => (
                      <li key={li}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Two-column lower section: Education | Certifications + Languages */}
        <div className="nb-accent-header__lower">
          {education.length > 0 && (
            <section className="nb-accent-header__section">
              <h2 className="nb-accent-header__section-title">Education</h2>
              {education.map((item, i) => (
                <div key={i} className="nb-accent-header__edu-item">
                  <p className="nb-accent-header__edu-degree">{item.degree || 'Degree'}</p>
                  <p className="nb-accent-header__edu-inst">{item.institution || ''}</p>
                  {displayDateRange(item.startDate, item.endDate) && (
                    <p className="nb-accent-header__edu-date">{displayDateRange(item.startDate, item.endDate)}</p>
                  )}
                </div>
              ))}
            </section>
          )}

          <div>
            {certifications.length > 0 && (
              <section className="nb-accent-header__section">
                <h2 className="nb-accent-header__section-title">Certifications</h2>
                {certifications.map((item, i) => (
                  <div key={i} className="nb-accent-header__edu-item">
                    <p className="nb-accent-header__edu-degree">{item.name}</p>
                    {item.issuer && <p className="nb-accent-header__edu-inst">{item.issuer}</p>}
                  </div>
                ))}
              </section>
            )}
            {languages.length > 0 && (
              <section className="nb-accent-header__section">
                <h2 className="nb-accent-header__section-title">Languages</h2>
                <p className="nb-accent-header__summary">{languages.join(' · ')}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
