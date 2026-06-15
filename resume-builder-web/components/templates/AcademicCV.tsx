import React from 'react';
import {
  contactLine,
  fullNameOrTitle,
  normalizeTemplateResume,
  OrderedAtsSections,
  type TemplateProps,
} from './templateUtils';

export default function AcademicCV({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);

  return (
    <article className="ats-template ats-template--academic">
      <header className="ats-template__header">
        <h1>{fullNameOrTitle(normalized)}</h1>
        {contactLine(normalized) ? <p>{contactLine(normalized)}</p> : null}
      </header>

      <OrderedAtsSections
        resumeData={normalized}
        options={{
          companyJoiner: ', ',
          uppercaseHeadings: true,
          // Academic CV leads with education, then appointments.
          defaultBody: ['summary', 'education', 'experience', 'projects', 'achievements', 'certifications', 'skills', 'languages'],
          labels: {
            summary: 'Research Interest',
            experience: 'Academic & Professional Appointments',
            projects: 'Publications & Research Projects',
            certifications: 'Grants, Awards & Certifications',
            skills: 'Technical & Methodological Skills',
          },
          summaryPlaceholder: 'Add a concise research statement.',
          skillsPlaceholder: 'Add relevant methods, tools, and domains.',
          experienceEmpty: 'No appointments added.',
        }}
      />
    </article>
  );
}
