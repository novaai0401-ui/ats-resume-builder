import React from 'react';
import {
  contactLine,
  fullNameOrTitle,
  normalizeTemplateResume,
  OrderedAtsSections,
  type TemplateProps,
} from './templateUtils';

export default function ConsultantClean({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);

  return (
    <article className="ats-template ats-template--consultant">
      <header className="ats-template__header ats-template__header--bar">
        <h1>{fullNameOrTitle(normalized)}</h1>
        {contactLine(normalized) ? <p>{contactLine(normalized)}</p> : null}
      </header>

      <OrderedAtsSections
        resumeData={normalized}
        options={{
          companyJoiner: ' | ',
          divided: true,
          summaryPlaceholder: 'Add a concise summary with business outcomes and delivery scope.',
          skillsPlaceholder: 'Add consulting, domain, and execution skills.',
        }}
      />
    </article>
  );
}
