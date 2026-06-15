import React from 'react';
import {
  contactLine,
  fullNameOrTitle,
  normalizeTemplateResume,
  OrderedAtsSections,
  type TemplateProps,
} from './templateUtils';

export default function MinimalClean({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);

  return (
    <article className="ats-template ats-template--minimal">
      <header className="ats-template__header">
        <h1>{fullNameOrTitle(normalized)}</h1>
        {contactLine(normalized) ? <p>{contactLine(normalized)}</p> : null}
      </header>

      <OrderedAtsSections
        resumeData={normalized}
        options={{
          companyJoiner: ', ',
          tight: true,
          summaryPlaceholder: 'Add a concise summary aligned to your target role.',
        }}
      />
    </article>
  );
}
