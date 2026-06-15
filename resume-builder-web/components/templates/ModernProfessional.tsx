import React from 'react';
import {
  contactLine,
  fullNameOrTitle,
  normalizeTemplateResume,
  OrderedAtsSections,
  type TemplateProps,
} from './templateUtils';

export default function ModernProfessional({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);

  return (
    <article className="ats-template ats-template--modern">
      <header className="ats-template__header ats-template__header--bar">
        <h1>{fullNameOrTitle(normalized)}</h1>
        {contactLine(normalized) ? <p>{contactLine(normalized)}</p> : null}
      </header>

      <OrderedAtsSections
        resumeData={normalized}
        options={{
          companyJoiner: ' | ',
          divided: true,
          summaryPlaceholder: 'Add a concise summary focused on role fit and impact.',
          skillsPlaceholder: 'Add role-specific skills.',
        }}
      />
    </article>
  );
}
