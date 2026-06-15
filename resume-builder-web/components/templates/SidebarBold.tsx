import React from 'react';
import { normalizePhotoUrl } from 'resume-builder-shared';
import {
  AchievementsSection,
  certificationItems,
  cleanList,
  contactLine,
  displayDateRange,
  educationItems,
  experienceItems,
  fullNameOrTitle,
  nonOverlappingMainSkills,
  normalizeTemplateResume,
  projectItems,
  type TemplateProps,
} from './templateUtils';

export default function SidebarBold({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);
  const summary = String(normalized.summary || '').trim();
  // displaySkills MUST NOT overlap soft skills — otherwise the sidebar
  // shows the same item in both the Skills list and Soft Skills list.
  const displaySkills = nonOverlappingMainSkills(normalized);
  const softSkills = cleanList(normalized.softSkills);
  const languages = cleanList(normalized.languages);
  const experience = experienceItems(normalized);
  const projects = projectItems(normalized);
  const education = educationItems(normalized);
  const certifications = certificationItems(normalized);
  const displaySoft = softSkills;

  const email = String(normalized.contact?.email || '').trim();
  const phone = String(normalized.contact?.phone || '').trim();
  const location = String(normalized.contact?.location || '').trim();
  const links = cleanList(normalized.contact?.links);
  const photo = normalizePhotoUrl(normalized.photoUrl);

  return (
    <article className="nb-sidebar-bold">
      {/* ── Left Sidebar ───────────────────────────────── */}
      <aside className="nb-sidebar-bold__sidebar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img className="nb-sidebar-bold__photo" src={photo} alt="" /> : null}
        <div className="nb-sidebar-bold__name-block">
          <h1 className="nb-sidebar-bold__name">{fullNameOrTitle(normalized)}</h1>
          {normalized.title && normalized.contact?.fullName && (
            <p className="nb-sidebar-bold__role">{normalized.title}</p>
          )}
        </div>

        <div className="nb-sidebar-bold__divider" />

        {/* Contact */}
        <div className="nb-sidebar-bold__section">
          <h2 className="nb-sidebar-bold__section-title">Contact</h2>
          {email && <p className="nb-sidebar-bold__contact-item">{email}</p>}
          {phone && <p className="nb-sidebar-bold__contact-item">{phone}</p>}
          {location && <p className="nb-sidebar-bold__contact-item">{location}</p>}
          {links.map((link, i) => (
            <p key={i} className="nb-sidebar-bold__contact-item nb-sidebar-bold__contact-item--link">{link}</p>
          ))}
        </div>

        {/* Technical Skills */}
        {displaySkills.length > 0 && (
          <div className="nb-sidebar-bold__section">
            <h2 className="nb-sidebar-bold__section-title">Skills</h2>
            <ul className="nb-sidebar-bold__skill-list">
              {displaySkills.map((skill, i) => (
                <li key={i} className="nb-sidebar-bold__skill-item">{skill}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Soft Skills */}
        {displaySoft.length > 0 && (
          <div className="nb-sidebar-bold__section">
            <h2 className="nb-sidebar-bold__section-title">Soft Skills</h2>
            <ul className="nb-sidebar-bold__skill-list">
              {displaySoft.map((skill, i) => (
                <li key={i} className="nb-sidebar-bold__skill-item">{skill}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Languages */}
        {languages.length > 0 && (
          <div className="nb-sidebar-bold__section">
            <h2 className="nb-sidebar-bold__section-title">Languages</h2>
            {languages.map((lang, i) => (
              <p key={i} className="nb-sidebar-bold__contact-item">{lang}</p>
            ))}
          </div>
        )}

        {/* Education in sidebar */}
        {education.length > 0 && (
          <div className="nb-sidebar-bold__section">
            <h2 className="nb-sidebar-bold__section-title">Education</h2>
            {education.map((item, i) => (
              <div key={i} className="nb-sidebar-bold__edu-item">
                <p className="nb-sidebar-bold__edu-degree">{item.degree || 'Degree'}</p>
                <p className="nb-sidebar-bold__edu-inst">{item.institution || ''}</p>
                {displayDateRange(item.startDate, item.endDate) && (
                  <p className="nb-sidebar-bold__edu-date">{displayDateRange(item.startDate, item.endDate)}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Certifications in sidebar */}
        {certifications.length > 0 && (
          <div className="nb-sidebar-bold__section">
            <h2 className="nb-sidebar-bold__section-title">Certifications</h2>
            {certifications.map((item, i) => (
              <div key={i} className="nb-sidebar-bold__edu-item">
                <p className="nb-sidebar-bold__edu-degree">{item.name || ''}</p>
                {item.issuer && <p className="nb-sidebar-bold__edu-inst">{item.issuer}</p>}
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── Main Content ───────────────────────────────── */}
      <main className="nb-sidebar-bold__main">
        {/* Summary */}
        {summary && (
          <section className="nb-sidebar-bold__content-section">
            <h2 className="nb-sidebar-bold__content-title">Profile</h2>
            <p className="nb-sidebar-bold__summary">{summary}</p>
          </section>
        )}

        {/* Experience */}
        {experience.length > 0 && (
          <section className="nb-sidebar-bold__content-section">
            <h2 className="nb-sidebar-bold__content-title">Experience</h2>
            {experience.map((item, idx) => (
              <div key={idx} className="nb-sidebar-bold__exp-item">
                <div className="nb-sidebar-bold__exp-header">
                  <div>
                    <h3 className="nb-sidebar-bold__exp-role">{item.role || 'Role'}</h3>
                    <p className="nb-sidebar-bold__exp-company">{item.company || ''}</p>
                  </div>
                  {displayDateRange(item.startDate, item.endDate) && (
                    <span className="nb-sidebar-bold__exp-date">
                      {displayDateRange(item.startDate, item.endDate)}
                    </span>
                  )}
                </div>
                {cleanList(item.highlights).length > 0 && (
                  <ul className="nb-sidebar-bold__exp-bullets">
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
          <section className="nb-sidebar-bold__content-section">
            <h2 className="nb-sidebar-bold__content-title">Projects</h2>
            {projects.map((item, idx) => (
              <div key={idx} className="nb-sidebar-bold__exp-item">
                <div className="nb-sidebar-bold__exp-header">
                  <h3 className="nb-sidebar-bold__exp-role">{item.name || 'Project'}</h3>
                  {displayDateRange(item.startDate || '', item.endDate || '') && (
                    <span className="nb-sidebar-bold__exp-date">
                      {displayDateRange(item.startDate || '', item.endDate || '')}
                    </span>
                  )}
                </div>
                {cleanList(item.highlights).length > 0 && (
                  <ul className="nb-sidebar-bold__exp-bullets">
                    {cleanList(item.highlights).map((line, li) => (
                      <li key={li}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        <AchievementsSection
          resumeData={normalized}
          headingStyle={{ fontSize: 14, letterSpacing: '0.05em', color: '#1a3a5c' }}
        />
      </main>
    </article>
  );
}
