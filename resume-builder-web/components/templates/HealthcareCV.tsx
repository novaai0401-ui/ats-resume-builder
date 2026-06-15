import React from 'react';
import {
  contactLine,
  fullNameOrTitle,
  normalizeTemplateResume,
  OrderedAtsSections,
  type TemplateProps,
} from './templateUtils';

export default function HealthcareCV({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);

  return (
    <article className="ats-template ats-template--healthcare">
      <header className="ats-template__header">
        <h1>{fullNameOrTitle(normalized)}</h1>
        {contactLine(normalized) ? <p>{contactLine(normalized)}</p> : null}
      </header>

      <OrderedAtsSections
        resumeData={normalized}
        options={{
          companyJoiner: ', ',
          uppercaseHeadings: true,
          // Healthcare CV leads with licensure/certifications.
          defaultBody: ['summary', 'certifications', 'education', 'experience', 'skills', 'projects', 'achievements', 'languages'],
          labels: {
            summary: 'Clinical Summary',
            certifications: 'Licensure & Certifications',
            experience: 'Clinical Experience',
            skills: 'Clinical Skills & Procedures',
            projects: 'Research & Quality Improvement',
          },
          summaryPlaceholder: 'Describe your clinical focus, years of experience, and patient population.',
          skillsPlaceholder: 'Add procedures, systems, and specialties.',
          experienceEmpty: 'No clinical experience added.',
        }}
      />
    </article>
  );
}
