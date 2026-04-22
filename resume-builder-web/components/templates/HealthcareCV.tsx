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
  sectionTitle,
  type TemplateProps,
} from './templateUtils';

export default function HealthcareCV({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);
  const summary = String(normalized.summary || '').trim();
  const skills = allSkills(normalized);
  const languages = cleanList(normalized.languages);
  const experience = experienceItems(normalized);
  const projects = projectItems(normalized);
  const education = educationItems(normalized);
  const certifications = certificationItems(normalized);

  return (
    <article className="ats-template ats-template--healthcare">
      <header className="ats-template__header">
        <h1>{fullNameOrTitle(normalized)}</h1>
        {contactLine(normalized) ? <p>{contactLine(normalized)}</p> : null}
      </header>

      <section className="ats-section">
        <h2>CLINICAL SUMMARY</h2>
        <p>{summary || 'Describe your clinical focus, years of experience, and patient population.'}</p>
      </section>

      {certifications.length ? (
        <section className="ats-section">
          <h2>LICENSURE & CERTIFICATIONS</h2>
          {certifications.map((item, idx) => (
            <div className="ats-item" key={`health-cert-${idx}`}>
              <h3>{item.name || 'Certification'}</h3>
              <p>{[item.issuer, displayDateRange(item.date || '', '')].filter(Boolean).join(' | ')}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="ats-section">
        <h2>{sectionTitle('education').toUpperCase()}</h2>
        {education.length ? education.map((item, idx) => (
          <div className="ats-item" key={`health-edu-${idx}`}>
            <h3>{item.degree || 'Degree'}</h3>
            <p>{item.institution || ''}</p>
            {displayDateRange(item.startDate, item.endDate) ? <p className="ats-item__meta">{displayDateRange(item.startDate, item.endDate)}</p> : null}
          </div>
        )) : <p>No education added.</p>}
      </section>

      <section className="ats-section">
        <h2>CLINICAL EXPERIENCE</h2>
        {experience.length ? experience.map((item, idx) => (
          <div className="ats-item" key={`health-exp-${idx}`}>
            <h3>{item.role || 'Role'}{item.company ? `, ${item.company}` : ''}</h3>
            {displayDateRange(item.startDate, item.endDate) ? <p className="ats-item__meta">{displayDateRange(item.startDate, item.endDate)}</p> : null}
            <ul>
              {cleanList(item.highlights).map((line, lineIdx) => (
                <li key={`health-exp-line-${idx}-${lineIdx}`}>{line}</li>
              ))}
            </ul>
          </div>
        )) : <p>No clinical experience added.</p>}
      </section>

      <section className="ats-section">
        <h2>CLINICAL SKILLS & PROCEDURES</h2>
        <p>{skills.length ? skills.join(', ') : 'Add procedures, systems, and specialties.'}</p>
      </section>

      {projects.length ? (
        <section className="ats-section">
          <h2>RESEARCH & QUALITY IMPROVEMENT</h2>
          {projects.map((item, idx) => (
            <div className="ats-item" key={`health-proj-${idx}`}>
              <h3>{item.name || 'Project'}</h3>
              <ul>
                {cleanList(item.highlights).map((line, lineIdx) => (
                  <li key={`health-proj-line-${idx}-${lineIdx}`}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {languages.length ? (
        <section className="ats-section">
          <h2>{sectionTitle('languages').toUpperCase()}</h2>
          <p>{languages.join(', ')}</p>
        </section>
      ) : null}
    </article>
  );
}
